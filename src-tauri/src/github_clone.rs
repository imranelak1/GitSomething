//! GitHub-to-local checkout. Transport uses libgit2 and native OAuth only.
//! Failed clones retain their directory; no shell or recursive cleanup is used.
use crate::{
    git_engine::{self, EngineResult, RepositorySnapshot},
    github_auth::AuthState,
    AppState,
};
use git2::{
    build::CheckoutBuilder, Cred, CredentialType, ErrorCode, FetchOptions, RemoteCallbacks,
    Repository, RepositoryInitOptions,
};
use reqwest::Url;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, State};
use uuid::Uuid;
use zeroize::Zeroizing;

const INVALID_URL: &str =
    "Choose a GitHub HTTPS clone URL in the form https://github.com/owner/repository.git.";
const EXISTING: &str = "A file or folder with this repository's name already exists there. Open that local repository, or choose a different parent folder. Nothing was overwritten.";

#[derive(Debug)]
struct ClonePlan {
    url: String,
    parent: PathBuf,
    destination: PathBuf,
}

fn clone_name(value: &str) -> EngineResult<&str> {
    let url = Url::parse(value).map_err(|_| INVALID_URL.to_string())?;
    let parts: Vec<_> = url.path().trim_start_matches('/').split('/').collect();
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || parts.len() != 2
    {
        return Err(INVALID_URL.into());
    }
    let owner = parts[0];
    let name = parts[1].strip_suffix(".git").ok_or(INVALID_URL)?;
    if owner.is_empty()
        || owner.len() > 100
        || !owner
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        || !safe_name(name)
        || value != format!("https://github.com/{owner}/{name}.git")
    {
        return Err(INVALID_URL.into());
    }
    // Borrow from the original input rather than the parsed URL's temporary buffer.
    Ok(value
        .strip_suffix(".git")
        .and_then(|v| v.rsplit('/').next())
        .expect("validated clone path"))
}

fn safe_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    !name.is_empty()
        && name.len() <= 100
        && name != "."
        && name != ".."
        && !name.eq_ignore_ascii_case(".git")
        && !name.ends_with('.')
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
        && !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

fn plan(parent_path: &str, clone_url: &str) -> EngineResult<ClonePlan> {
    let name = clone_name(clone_url)?;
    let parent = fs::canonicalize(parent_path).map_err(|_| {
        "Choose an existing local parent folder that GitSomething can access.".to_string()
    })?;
    if !parent.is_dir() {
        return Err("Choose a parent folder, rather than a file.".into());
    }
    let destination = parent.join(name);
    match fs::symlink_metadata(&destination) {
        Ok(_) => return Err(EXISTING.into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {
            return Err(
                "The destination could not be inspected. Choose another parent folder.".into(),
            )
        }
    }
    Ok(ClonePlan {
        url: clone_url.into(),
        parent,
        destination,
    })
}

fn reserve(plan: &ClonePlan) -> EngineResult<()> {
    // create_dir is atomic and refuses even an existing empty directory or link.
    fs::create_dir(&plan.destination).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists { EXISTING.to_string() }
        else { "Could not create the repository folder. Check permissions or choose another parent folder.".to_string() }
    })?;
    let metadata = fs::symlink_metadata(&plan.destination)
        .map_err(|_| "The newly created clone folder could not be inspected.".to_string())?;
    if metadata.file_type().is_symlink()
        || !metadata.is_dir()
        || fs::canonicalize(&plan.destination).ok().as_ref() != Some(&plan.destination)
        || fs::canonicalize(&plan.parent).ok().as_ref() != Some(&plan.parent)
    {
        return Err("The destination changed while cloning started. The folder was preserved; choose another parent folder.".into());
    }
    Ok(())
}

fn checked_credential(
    url: &str,
    expected: &str,
    token: &str,
    allowed: CredentialType,
) -> Result<Cred, git2::Error> {
    // Check every callback, including a URL changed by transport/configuration.
    if clone_name(url).is_err() || url != expected {
        return Err(git2::Error::from_str(
            "The clone destination changed. GitHub authentication was withheld.",
        ));
    }
    if allowed.is_user_pass_plaintext() {
        return Cred::userpass_plaintext("x-access-token", token);
    }
    if allowed.is_username() {
        return Cred::username("x-access-token");
    }
    Err(git2::Error::from_str(
        "GitHub HTTPS authentication is required.",
    ))
}

/// Compose clone phases instead of RepoBuilder::clone: that convenience API
/// recursively cleans a failed checkout, while this product preserves it.
fn populate<F: FnMut(String)>(
    url: &str,
    destination: &Path,
    token: Option<&str>,
    progress: &mut F,
) -> Result<Repository, git2::Error> {
    let mut init = RepositoryInitOptions::new();
    init.no_reinit(true)
        .external_template(false)
        .initial_head("main");
    let repo = Repository::init_opts(destination, &init)?;
    if git_engine::root_path(&repo).ok().as_deref() != Some(destination) {
        return Err(git2::Error::from_str(
            "The new repository resolves outside its destination.",
        ));
    }
    let default_branch = {
        let mut remote = repo.remote("origin", url)?;
        // remote() applies global URL rewrites. Reject them before any request.
        if remote.url()? != url {
            return Err(git2::Error::from_str(
                "Remote URL rewriting is not allowed for this clone.",
            ));
        }
        let mut callbacks = RemoteCallbacks::new();
        if let Some(token) = token {
            let token = Zeroizing::new(token.to_string());
            let expected = url.to_owned();
            callbacks.credentials(move |destination, _, allowed| {
                checked_credential(destination, &expected, &token, allowed)
            });
        }
        let mut last = None;
        callbacks.transfer_progress(|stats| {
            let percent = stats
                .received_objects()
                .saturating_mul(100)
                .checked_div(stats.total_objects())
                .unwrap_or(0);
            let bucket = percent / 10;
            if last != Some(bucket) {
                last = Some(bucket);
                progress(format!(
                    "Receiving Git objects: {} of {}.",
                    stats.received_objects(),
                    stats.total_objects()
                ));
            }
            true
        });
        let mut fetch = FetchOptions::new();
        fetch
            .follow_redirects(git2::RemoteRedirect::None)
            .remote_callbacks(callbacks);
        remote.fetch::<&str>(&[], Some(&mut fetch), None)?;
        remote
            .default_branch()
            .ok()
            .and_then(|branch| branch.as_str().ok().map(str::to_owned))
    };
    if let Some(reference) = default_branch {
        let branch = reference
            .strip_prefix("refs/heads/")
            .ok_or_else(|| git2::Error::from_str("The remote default branch is invalid."))?;
        let target = repo
            .find_reference(&format!("refs/remotes/origin/{branch}"))?
            .peel_to_commit()?;
        repo.branch(branch, &target, false)?
            .set_upstream(Some(&format!("origin/{branch}")))?;
        repo.reference_symbolic(
            "refs/remotes/origin/HEAD",
            &format!("refs/remotes/origin/{branch}"),
            false,
            "Record the cloned default branch",
        )?;
        repo.set_head(&reference)?;
        let mut last = None;
        let mut checkout = CheckoutBuilder::new();
        checkout.safe();
        checkout.progress(|_, complete, total| {
            let bucket = complete.saturating_mul(10).checked_div(total).unwrap_or(0);
            if last != Some(bucket) {
                last = Some(bucket);
                progress(format!("Checking out files: {complete} of {total}."));
            }
        });
        repo.checkout_head(Some(&mut checkout))?;
    } else if repo
        .references_glob("refs/remotes/origin/*")?
        .next()
        .is_some()
    {
        return Err(git2::Error::from_str(
            "The remote default branch could not be checked out.",
        ));
    }
    Ok(repo)
}

fn clone_error(error: git2::Error) -> String {
    let reason = match error.code() {
        ErrorCode::Auth => "GitHub rejected authentication. Reconnect and check repository or organization access.",
        ErrorCode::Certificate => "GitHub's certificate could not be verified. Check your network and trusted certificates.",
        _ => "The clone could not finish. Check your network, repository access, and available disk space.",
    };
    format!("{reason} The new repository folder was preserved, including any completed files. Choose a different parent folder to retry; no existing folder was overwritten. (Git {:?}/{:?})", error.class(), error.code())
}

#[tauri::command]
pub async fn clone_github_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    auth: State<'_, AuthState>,
    parent_path: String,
    clone_url: String,
) -> EngineResult<RepositorySnapshot> {
    let plan = tauri::async_runtime::spawn_blocking(move || plan(&parent_path, &clone_url))
        .await
        .map_err(|_| "The clone preparation worker stopped.".to_string())??;
    let lock = state.path_lock(plan.destination.clone())?;
    let _guard = lock.try_lock_owned().map_err(|_| {
        "This repository is already being cloned into that folder. Wait for it to finish."
            .to_string()
    })?;
    let (token, _) = auth.credential().await?;
    let current = Zeroizing::new(token.to_string());
    let id = Uuid::new_v4().to_string();
    let command = crate::tokens(&[
        ("git", "Git records your project's history."),
        (
            "clone",
            "Download repository history and create a local working copy.",
        ),
        (
            "--",
            "Treat the following arguments as the repository URL and destination.",
        ),
        (
            &crate::quote(&plan.url),
            "The GitHub repository copied using your native account connection.",
        ),
        (
            &crate::quote(&plan.destination.to_string_lossy()),
            "A new local folder; an existing folder is never overwritten.",
        ),
    ]);
    crate::log(
        &app,
        &id,
        &id,
        &command,
        "running",
        Some("Creating a local working copy.".into()),
    );
    let worker_app = app.clone();
    let worker_id = id.clone();
    let worker_command = command.clone();
    let watch = state.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        reserve(&plan)?;
        populate(&plan.url, &plan.destination, Some(&token), &mut |message| {
            crate::log(&worker_app, &worker_id, &worker_id, &worker_command, "running", Some(message));
        }).map_err(clone_error)?;
        let path = plan.destination.to_string_lossy().into_owned();
        let snapshot = git_engine::snapshot(&path).map_err(|_| "The clone was saved locally, but its working view could not be read. Use Open repository to open the preserved folder; do not clone over it.".to_string())?;
        let watching = watch.watch(worker_app, &snapshot.path).is_ok();
        Ok::<_, String>((snapshot, watching))
    }).await.unwrap_or_else(|_| Err("The clone worker stopped. Any created folder was preserved; choose another parent folder to retry.".into()));
    if result
        .as_ref()
        .err()
        .is_some_and(|error| error.starts_with("GitHub rejected authentication."))
    {
        auth.reject_credential(&current).await;
    }
    let result = if result.is_ok() && !auth.is_current_credential(&current).await {
        Err("The clone was saved locally, but your GitHub connection changed. Use Open repository to review the preserved folder.".into())
    } else {
        result
    };
    let message = match &result {
        Ok((_, true)) => "Cloned and opened your local working copy.".into(),
        Ok((_, false)) => "Cloned your local working copy. Automatic refresh could not start; reopen the folder to retry it.".into(),
        Err(error) => error.clone(),
    };
    crate::log(
        &app,
        &id,
        &id,
        &command,
        if result.is_ok() { "success" } else { "error" },
        Some(message),
    );
    result.map(|(snapshot, _)| snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Signature;

    #[test]
    fn clone_urls_require_exact_github_https_repository_paths_and_safe_basenames() {
        for name in [
            "project",
            "-project",
            "_project",
            ".project",
            "project.git",
            "project-name_1",
        ] {
            assert_eq!(
                clone_name(&format!("https://github.com/team-org/{name}.git")).unwrap(),
                name
            );
        }
        for value in [
            "https://github.com/team/project",
            "http://github.com/team/project.git",
            "https://github.com.evil.test/team/project.git",
            "https://evil.test/team/project.git",
            "https://secret@github.com/team/project.git",
            "https://user:secret@github.com/team/project.git",
            "https://github.com:444/team/project.git",
            "https://github.com:443/team/project.git",
            "https://github.com/team/project.git?secret=token",
            "https://github.com/team/project.git#token",
            "https://github.com/team/project.git/extra",
            "https://github.com/team/project.git/",
            "https://github.com/team/../project.git",
            "https://github.com/team/%2e%2e.git",
            "https://github.com/team/.git.git",
            "https://github.com/team/CON.git",
            "https://github.com/team/com1.txt.git",
            "https://github.com/team/LPT9.git",
            "https://github.com/team/project..git",
            "https://github.com/team/project:stream.git",
            "https://github.com/team/a%2fb.git",
            " https://github.com/team/project.git",
            "https://github.com//team/project.git",
            "https://GitHub.com/team/project.git",
            "file:///team/project.git",
            "git@github.com:team/project.git",
        ] {
            assert!(clone_name(value).is_err(), "accepted {value}");
        }
    }

    #[test]
    fn destination_reservation_refuses_existing_files_folders_and_racing_attempts() {
        let parent = tempfile::tempdir().unwrap();
        let url = "https://github.com/owner/project.git";
        let first = plan(parent.path().to_str().unwrap(), url).unwrap();
        let second = plan(parent.path().to_str().unwrap(), url).unwrap();
        reserve(&first).unwrap();
        fs::write(first.destination.join("keep.txt"), "user content").unwrap();
        assert!(reserve(&second)
            .unwrap_err()
            .contains("Nothing was overwritten"));
        assert!(plan(parent.path().to_str().unwrap(), url).is_err());
        assert_eq!(
            fs::read_to_string(first.destination.join("keep.txt")).unwrap(),
            "user content"
        );
        fs::write(parent.path().join("file"), "preserve").unwrap();
        assert!(plan(
            parent.path().to_str().unwrap(),
            "https://github.com/owner/file.git"
        )
        .is_err());
        assert!(plan(parent.path().join("missing").to_str().unwrap(), url).is_err());
        assert!(plan(parent.path().join("file").to_str().unwrap(), url).is_err());
    }

    #[test]
    fn same_destination_operations_share_the_repository_gate() {
        let state = AppState::default();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("project");
        let first = state.path_lock(path.clone()).unwrap();
        let second = state.path_lock(path).unwrap();
        let guard = first.try_lock_owned().unwrap();
        assert!(second.clone().try_lock_owned().is_err());
        drop(guard);
        assert!(second.try_lock_owned().is_ok());
    }

    #[test]
    fn credentials_never_leave_the_exact_github_clone_destination() {
        let expected = "https://github.com/owner/project.git";
        assert!(checked_credential(
            expected,
            expected,
            "native-secret",
            CredentialType::USER_PASS_PLAINTEXT
        )
        .is_ok());
        for target in [
            "https://evil.test/owner/project.git",
            "https://github.com:444/owner/project.git",
            "http://github.com/owner/project.git",
            "https://github.com/owner/other.git",
            "https://github.com/owner/project.git?token=secret",
        ] {
            let error = checked_credential(
                target,
                expected,
                "native-secret",
                CredentialType::USER_PASS_PLAINTEXT,
            )
            .err()
            .unwrap();
            assert!(!error.message().contains("native-secret"));
        }
        assert!(
            checked_credential(expected, expected, "native-secret", CredentialType::SSH_KEY)
                .is_err()
        );
        let error = clone_error(git2::Error::from_str(
            "provider diagnostic with native-secret",
        ));
        assert!(!error.contains("native-secret"));
        assert!(error.contains("preserved"));
    }

    fn bare_repository(path: &Path, with_commit: bool) -> Repository {
        let mut init = RepositoryInitOptions::new();
        init.bare(true).initial_head("feature/default");
        let repo = Repository::init_opts(path, &init).unwrap();
        if with_commit {
            let blob = repo.blob(b"actual cloned content\n").unwrap();
            let tree_id = {
                let mut builder = repo.treebuilder(None).unwrap();
                builder.insert("README.md", blob, 0o100644).unwrap();
                builder.write().unwrap()
            };
            let tree = repo.find_tree(tree_id).unwrap();
            let signature = Signature::now("Fixture", "fixture@example.invalid").unwrap();
            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Fixture initial commit",
                &tree,
                &[],
            )
            .unwrap();
        }
        repo
    }

    #[test]
    fn local_bare_clone_checks_out_history_and_default_branch_with_upstream() {
        let folder = tempfile::tempdir().unwrap();
        let remote = bare_repository(&folder.path().join("remote.git"), true);
        let parent = tempfile::tempdir().unwrap();
        let clone = plan(
            parent.path().to_str().unwrap(),
            "https://github.com/owner/project.git",
        )
        .unwrap();
        reserve(&clone).unwrap();
        let local_url = remote.path().to_str().unwrap();
        let mut messages = Vec::new();
        let repo = populate(local_url, &clone.destination, None, &mut |message| {
            messages.push(message)
        })
        .unwrap();
        assert_eq!(
            repo.head().unwrap().name().unwrap(),
            "refs/heads/feature/default"
        );
        assert_eq!(
            repo.head().unwrap().target(),
            remote.head().unwrap().target()
        );
        assert_eq!(
            fs::read_to_string(clone.destination.join("README.md"))
                .unwrap()
                .replace("\r\n", "\n"),
            "actual cloned content\n"
        );
        assert_eq!(
            repo.find_branch("feature/default", git2::BranchType::Local)
                .unwrap()
                .upstream()
                .unwrap()
                .name()
                .unwrap(),
            Some("origin/feature/default")
        );
        assert_eq!(
            repo.find_reference("refs/remotes/origin/HEAD")
                .unwrap()
                .symbolic_target()
                .unwrap(),
            Some("refs/remotes/origin/feature/default")
        );
        assert!(!messages.is_empty());
        let snapshot = git_engine::snapshot(clone.destination.to_str().unwrap()).unwrap();
        assert_eq!(snapshot.commits.len(), 1);
        assert!(snapshot.files.is_empty());
        let config = fs::read_to_string(repo.path().join("config")).unwrap();
        assert!(!config.contains("native-secret"));
    }

    #[test]
    fn empty_remote_opens_as_a_valid_unborn_working_copy() {
        let folder = tempfile::tempdir().unwrap();
        let remote = bare_repository(&folder.path().join("empty.git"), false);
        let parent = tempfile::tempdir().unwrap();
        let clone = plan(
            parent.path().to_str().unwrap(),
            "https://github.com/owner/empty.git",
        )
        .unwrap();
        reserve(&clone).unwrap();
        let repo = populate(
            remote.path().to_str().unwrap(),
            &clone.destination,
            None,
            &mut |_| {},
        )
        .unwrap();
        assert!(repo.head().is_err());
        assert!(repo
            .references_glob("refs/remotes/origin/*")
            .unwrap()
            .next()
            .is_none());
        let snapshot = git_engine::snapshot(clone.destination.to_str().unwrap()).unwrap();
        assert!(snapshot.commits.is_empty());
        assert!(snapshot.files.is_empty());
    }

    #[test]
    fn fetch_failure_preserves_created_repository_and_existing_content() {
        let parent = tempfile::tempdir().unwrap();
        let clone = plan(
            parent.path().to_str().unwrap(),
            "https://github.com/owner/project.git",
        )
        .unwrap();
        reserve(&clone).unwrap();
        fs::write(clone.destination.join("keep.txt"), "preserve partial work").unwrap();
        let missing = parent.path().join("does-not-exist.git");
        let error = populate(
            missing.to_str().unwrap(),
            &clone.destination,
            None,
            &mut |_| {},
        )
        .err()
        .unwrap();
        assert!(clone_error(error).contains("preserved"));
        assert!(clone.destination.join(".git/config").is_file());
        assert_eq!(
            fs::read_to_string(clone.destination.join("keep.txt")).unwrap(),
            "preserve partial work"
        );
        assert!(plan(
            parent.path().to_str().unwrap(),
            "https://github.com/owner/project.git"
        )
        .is_err());
    }

    #[test]
    fn checkout_refuses_files_that_appear_after_destination_reservation() {
        let folder = tempfile::tempdir().unwrap();
        let remote = bare_repository(&folder.path().join("remote.git"), true);
        let parent = tempfile::tempdir().unwrap();
        let clone = plan(
            parent.path().to_str().unwrap(),
            "https://github.com/owner/project.git",
        )
        .unwrap();
        reserve(&clone).unwrap();
        fs::write(clone.destination.join("README.md"), "new user work").unwrap();
        assert!(populate(
            remote.path().to_str().unwrap(),
            &clone.destination,
            None,
            &mut |_| {}
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(clone.destination.join("README.md")).unwrap(),
            "new user work"
        );
        let repo = Repository::open(&clone.destination).unwrap();
        assert_eq!(
            repo.head().unwrap().target(),
            remote.head().unwrap().target()
        );
        assert!(repo
            .find_reference("refs/remotes/origin/feature/default")
            .is_ok());
    }
}
