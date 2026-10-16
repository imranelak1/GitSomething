//! All Git reads and mutations use libgit2. This module never launches Git.
use git2::{
    build::CheckoutBuilder, BranchType, Cred, DiffOptions, ErrorCode, FetchOptions, PushOptions,
    RemoteCallbacks, Repository, RepositoryInitOptions, RepositoryState, Signature, Sort, Status,
    StatusOptions,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
};

pub type EngineResult<T> = Result<T, String>;
const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_PUBLISH_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub id: String,
    pub summary: String,
    pub author: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchSummary {
    pub name: String,
    pub target: String,
    pub current: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Guardian {
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub path: String,
    pub name: String,
    pub branch: String,
    pub files: Vec<FileStatus>,
    pub commits: Vec<CommitSummary>,
    pub branches: Vec<BranchSummary>,
    pub guardian: Option<Guardian>,
}

#[derive(Debug, Serialize)]
pub struct FileDiff {
    pub original: String,
    pub modified: String,
    pub language: String,
}

pub fn canonical_directory(path: &str) -> EngineResult<PathBuf> {
    let path = fs::canonicalize(path).map_err(|e| format!("Cannot open this folder: {e}"))?;
    if !path.is_dir() {
        return Err("Choose a folder, rather than a file.".into());
    }
    Ok(path)
}

pub fn open(path: &str) -> EngineResult<Repository> {
    let path = canonical_directory(path)?;
    let repo = Repository::discover(&path).map_err(|_| {
        "This folder is not a Git repository. Drop an unversioned folder to publish it.".to_string()
    })?;
    if repo.is_bare() {
        return Err(
            "Bare repositories do not have a working directory. Choose a normal checkout.".into(),
        );
    }
    Ok(repo)
}

pub fn root_path(repo: &Repository) -> EngineResult<PathBuf> {
    repo.workdir()
        .ok_or_else(|| "This repository has no working directory.".into())
        .and_then(|path| fs::canonicalize(path).map_err(|e| e.to_string()))
}

fn checked_relative(file_path: &str) -> EngineResult<&Path> {
    let path = Path::new(file_path);
    if file_path.is_empty()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        || path
            .components()
            .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
    {
        return Err("Choose a file inside the repository; absolute paths and parent traversal are not allowed.".into());
    }
    Ok(path)
}

fn checked_working_path(repo: &Repository, file_path: &str) -> EngineResult<PathBuf> {
    let relative = checked_relative(file_path)?;
    let root = root_path(repo)?;
    let full = root.join(relative);
    // Resolve existing ancestors to prevent an in-repository directory symlink from escaping.
    let mut ancestor = full.parent();
    while let Some(path) = ancestor {
        if path.exists() {
            let resolved = fs::canonicalize(path).map_err(|e| e.to_string())?;
            if !resolved.starts_with(&root) {
                return Err("This file resolves outside the repository.".into());
            }
            break;
        }
        ancestor = path.parent();
    }
    Ok(full)
}

pub fn snapshot(path: &str) -> EngineResult<RepositorySnapshot> {
    let repo = open(path)?;
    let root = root_path(&repo)?;
    let head = repo.head().ok();
    let branch = if repo.head_detached().unwrap_or(false) {
        "Detached HEAD".to_string()
    } else {
        head.as_ref()
            .and_then(|h| h.shorthand().ok())
            .map(str::to_owned)
            .or_else(|| {
                repo.find_reference("HEAD").ok().and_then(|head| {
                    head.symbolic_target()
                        .ok()
                        .flatten()
                        .and_then(|name| name.strip_prefix("refs/heads/"))
                        .map(str::to_owned)
                })
            })
            .unwrap_or_else(|| "main".into())
    };
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true);
    let statuses = repo
        .statuses(Some(&mut options))
        .map_err(|e| e.to_string())?;
    let stats = line_statistics(&repo).unwrap_or_default();
    let mut files = Vec::new();
    for entry in statuses.iter() {
        let path = entry.path().map_err(|e| e.to_string())?.to_string();
        let status = entry.status();
        let staged_changes = status
            & (Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE);
        let working_changes = status
            & (Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE
                | Status::CONFLICTED);
        // A file can have two different versions: one staged and one still being
        // edited. Each gets its own row and diff so the commit preview is exact.
        for (staged, side) in [(true, staged_changes), (false, working_changes)] {
            if side.is_empty() {
                continue;
            }
            let label = if side.is_conflicted() {
                "conflicted"
            } else if side.intersects(Status::INDEX_DELETED | Status::WT_DELETED) {
                "deleted"
            } else if side.intersects(Status::INDEX_NEW | Status::WT_NEW) {
                "added"
            } else if side.intersects(Status::INDEX_RENAMED | Status::WT_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            let (additions, deletions) = stats
                .get(&(path.clone(), staged))
                .copied()
                .unwrap_or_default();
            files.push(FileStatus {
                path: path.clone(),
                status: label.into(),
                staged,
                additions,
                deletions,
            });
        }
    }
    let mut commits = Vec::new();
    if let Ok(mut walk) = repo.revwalk() {
        if walk.push_head().is_ok() {
            let _ = walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME);
            for id in walk.take(100).flatten() {
                if let Ok(commit) = repo.find_commit(id) {
                    commits.push(CommitSummary {
                        id: id.to_string(),
                        summary: commit
                            .summary()
                            .ok()
                            .flatten()
                            .unwrap_or("Untitled commit")
                            .into(),
                        author: commit.author().name().unwrap_or("Unknown").into(),
                        timestamp: commit.time().seconds(),
                        parents: commit.parent_ids().map(|id| id.to_string()).collect(),
                    });
                }
            }
        }
    }
    let mut branches = Vec::new();
    for branch in repo
        .branches(Some(BranchType::Local))
        .map_err(|e| e.to_string())?
    {
        let (branch, _) = branch.map_err(|e| e.to_string())?;
        branches.push(BranchSummary {
            name: branch.name().ok().flatten().unwrap_or("Unnamed").into(),
            target: branch
                .get()
                .target()
                .map(|id| id.to_string())
                .unwrap_or_default(),
            current: branch.is_head(),
        });
    }
    let guardian = if repo.index().map(|i| i.has_conflicts()).unwrap_or(false) {
        Some(Guardian {
            kind: "conflict".into(),
            message: "This repository has conflicts. Resolve them in your editor and finish the in-progress merge or rebase before continuing here.".into(),
        })
    } else if repo.head_detached().unwrap_or(false) {
        Some(Guardian {
            kind: "detached".into(),
            message: "You are exploring a commit. Create a branch to keep new work safe.".into(),
        })
    } else if repo.state() != RepositoryState::Clean {
        Some(Guardian {
            kind: "operation".into(),
            message: format!(
                "A {:?} operation is in progress. Finish it before starting another operation.",
                repo.state()
            ),
        })
    } else {
        None
    };
    Ok(RepositorySnapshot {
        path: root.to_string_lossy().into(),
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().into())
            .unwrap_or_else(|| "Repository".into()),
        branch,
        files,
        commits,
        branches,
        guardian,
    })
}

type LineStatistics = HashMap<(String, bool), (usize, usize)>;

fn line_statistics(repo: &Repository) -> EngineResult<LineStatistics> {
    let mut stats = HashMap::new();
    let tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let mut options = DiffOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true)
        .max_size(MAX_TEXT_BYTES as i64);
    for (staged, diff) in [
        (
            true,
            repo.diff_tree_to_index(tree.as_ref(), None, Some(&mut options)),
        ),
        (false, repo.diff_index_to_workdir(None, Some(&mut options))),
    ] {
        let diff = diff.map_err(|e| e.to_string())?;
        diff.foreach(
            &mut |_, _| true,
            None,
            None,
            Some(&mut |delta, _, line| {
                if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
                    let counter = stats
                        .entry((path.to_string_lossy().into_owned(), staged))
                        .or_insert((0, 0));
                    match line.origin() {
                        '+' => counter.0 += 1,
                        '-' => counter.1 += 1,
                        _ => {}
                    }
                }
                true
            }),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(stats)
}

fn text(bytes: &[u8]) -> EngineResult<String> {
    if bytes.len() as u64 > MAX_TEXT_BYTES || bytes.contains(&0) {
        return Err(
            "This is a binary or large file. Inline text diff supports files up to 2 MiB.".into(),
        );
    }
    String::from_utf8(bytes.to_vec())
        .map_err(|_| "This file is not UTF-8 text. Open it in your editor.".into())
}

fn index_content(repo: &Repository, path: &Path) -> EngineResult<String> {
    match repo.index().map_err(|e| e.to_string())?.get_path(path, 0) {
        Some(entry) => text(
            repo.find_blob(entry.id)
                .map_err(|e| e.to_string())?
                .content(),
        ),
        None => Ok(String::new()),
    }
}

pub fn get_diff(path: &str, file_path: &str, staged: bool) -> EngineResult<FileDiff> {
    let repo = open(path)?;
    let relative = checked_relative(file_path)?;
    let full = checked_working_path(&repo, file_path)?;
    let (original, modified) = if !staged {
        let original = index_content(&repo, relative)?;
        let modified = if full.exists() {
            let metadata = fs::symlink_metadata(&full).map_err(|e| e.to_string())?;
            if metadata.file_type().is_symlink() {
                return Err("Symbolic links are displayed as file changes; edit their targets in your editor.".into());
            }
            if metadata.len() > MAX_TEXT_BYTES {
                return Err("Inline text diff supports files up to 2 MiB.".into());
            }
            text(&fs::read(full).map_err(|e| e.to_string())?)?
        } else {
            String::new()
        };
        (original, modified)
    } else {
        let original = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_tree().ok())
            .and_then(|t| t.get_path(relative).ok())
            .map(|entry| {
                repo.find_blob(entry.id())
                    .map_err(|e| e.to_string())
                    .and_then(|b| text(b.content()))
            })
            .transpose()?
            .unwrap_or_default();
        (original, index_content(&repo, relative)?)
    };
    let language = match relative.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "rs" => "rust",
        "tsx" | "ts" => "typescript",
        "jsx" | "js" => "javascript",
        "json" => "json",
        "css" => "css",
        "html" => "html",
        "md" => "markdown",
        "yml" | "yaml" => "yaml",
        "toml" => "ini",
        "py" => "python",
        _ => "plaintext",
    };
    Ok(FileDiff {
        original,
        modified,
        language: language.into(),
    })
}

pub fn stage_file(path: &str, file_path: &str) -> EngineResult<()> {
    let repo = open(path)?;
    let full = checked_working_path(&repo, file_path)?;
    let relative = checked_relative(file_path)?;
    if full.is_dir() {
        return Err("Select a single file to stage.".into());
    }
    let mut index = repo.index().map_err(|e| e.to_string())?;
    if fs::symlink_metadata(&full).is_ok() {
        index.add_path(relative)
    } else {
        index.remove_path(relative)
    }
    .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())
}

pub fn unstage_file(path: &str, file_path: &str) -> EngineResult<()> {
    let repo = open(path)?;
    let relative = checked_relative(file_path)?;
    let result = match repo.head().and_then(|h| h.peel_to_commit()) {
        Ok(commit) => repo
            .reset_default(Some(commit.as_object()), [relative])
            .map_err(|e| e.to_string()),
        Err(error) if matches!(error.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => {
            let mut index = repo.index().map_err(|e| e.to_string())?;
            index.remove_path(relative).map_err(|e| e.to_string())?;
            index.write().map_err(|e| e.to_string())
        }
        Err(error) => Err(error.to_string()),
    };
    result
}

fn ensure_clean_operation(repo: &Repository) -> EngineResult<()> {
    if repo.state() != RepositoryState::Clean {
        return Err("Finish the merge, rebase, or cherry-pick already in progress first.".into());
    }
    if repo.index().map_err(|e| e.to_string())?.has_conflicts() {
        return Err("Resolve all file conflicts first.".into());
    }
    Ok(())
}

pub fn commit_changes(path: &str, message: &str) -> EngineResult<String> {
    commit_changes_with_identity(path, message, None)
}

pub fn commit_changes_with_identity(
    path: &str,
    message: &str,
    fallback: Option<(&str, &str)>,
) -> EngineResult<String> {
    let repo = open(path)?;
    ensure_clean_operation(&repo)?;
    let signature = repo
        .signature()
        .or_else(|error| fallback.map_or(Err(error), |(name, email)| Signature::now(name, email)))
        .map_err(|_| {
            "Connect to GitHub or set your Git author name and email before committing.".to_string()
        })?;
    commit_index(&repo, message, &signature)
}

pub fn create_rescue_branch(path: &str, name: &str) -> EngineResult<()> {
    let repo = open(path)?;
    ensure_clean_operation(&repo)?;
    let name = name.trim();
    if name.is_empty() || !git2::Reference::is_valid_name(&format!("refs/heads/{name}")) {
        return Err("Choose a valid branch name, such as rescue/my-work.".into());
    }
    let commit = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| "Create an initial commit before creating a rescue branch.".to_string())?;
    repo.branch(name, &commit, false).map_err(|e| {
        format!("Could not create branch: {e}. Existing branches are never overwritten.")
    })?;
    // The new branch points at the current commit, so no working files change.
    repo.set_head(&format!("refs/heads/{name}"))
        .map_err(|e| e.to_string())
}

fn commit_index(
    repo: &Repository,
    message: &str,
    signature: &Signature<'_>,
) -> EngineResult<String> {
    if message.trim().is_empty() || message.len() > 16_384 {
        return Err("Write a commit message between 1 and 16,384 characters.".into());
    }
    let mut index = repo.index().map_err(|e| e.to_string())?;
    if index.has_conflicts() {
        return Err("Resolve all file conflicts first.".into());
    }
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    if parent.as_ref().is_some_and(|p| p.tree_id() == tree_id)
        || (parent.is_none() && tree.is_empty())
    {
        return Err("Stage at least one change before committing.".into());
    }
    let parents = parent.iter().collect::<Vec<_>>();
    repo.commit(
        Some("HEAD"),
        signature,
        signature,
        message.trim(),
        &tree,
        &parents,
    )
    .map(|id| id.to_string())
    .map_err(|e| e.to_string())
}

fn validate_token_destination(url: &str, expected_host: Option<&str>) -> EngineResult<()> {
    let expected_host = expected_host
        .filter(|host| matches!(*host, "github.com" | "gitlab.com"))
        .ok_or("Token authentication requires an explicitly trusted provider host.")?;
    let parsed = reqwest::Url::parse(url)
        .map_err(|_| "The remote URL is invalid; token authentication was withheld.".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(expected_host)
        || parsed.port_or_known_default() != Some(443)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("The remote destination differs from the trusted provider. Token authentication was withheld; check origin and its push URL.".into());
    }
    Ok(())
}

/// Determine which remote this operation actually contacts before selecting a credential.
/// SSH, local, GitLab, and other remotes retain their existing authentication behavior.
pub fn uses_github_auth(path: &str, operation: &str) -> EngineResult<bool> {
    let repo = open(path)?;
    let remote_name = if operation == "pull" {
        let head = repo
            .head()
            .map_err(|_| "Switch to a branch before pulling.".to_string())?;
        let remote = repo
            .branch_upstream_remote(head.name().map_err(|e| e.to_string())?)
            .map_err(|_| "This branch has no upstream. Push it first.".to_string())?;
        remote.as_str().map_err(|e| e.to_string())?.to_string()
    } else {
        "origin".to_string()
    };
    let remote = repo
        .find_remote(&remote_name)
        .map_err(|_| "No remote is configured. Publish this repository first.".to_string())?;
    let fetch_url = remote
        .url()
        .map_err(|_| "Invalid remote URL.".to_string())?;
    let destination = if operation == "push" {
        remote
            .pushurl()
            .map_err(|_| "Invalid push URL.".to_string())?
            .unwrap_or(fetch_url)
    } else {
        fetch_url
    };
    match reqwest::Url::parse(destination) {
        Ok(url) if url.scheme() == "https" && url.host_str() == Some("github.com") => {
            validate_token_destination(destination, Some("github.com"))?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn callbacks(
    token: Option<&str>,
    username: &str,
    expected_host: Option<&str>,
) -> RemoteCallbacks<'static> {
    let token = token.map(|t| zeroize::Zeroizing::new(t.to_string()));
    let username = username.to_string();
    let expected_host = expected_host.map(str::to_owned);
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |url, url_username, allowed| {
        if let Some(token) = token.as_ref() {
            // Check every callback, including URLs produced by rewrites or redirects.
            validate_token_destination(url, expected_host.as_deref())
                .map_err(|message| git2::Error::from_str(&message))?;
            if allowed.is_user_pass_plaintext() {
                return Cred::userpass_plaintext(&username, token);
            }
        }
        if allowed.is_ssh_key() {
            return Cred::ssh_key_from_agent(url_username.unwrap_or("git"));
        }
        if allowed.is_username() {
            return Cred::username(url_username.unwrap_or(&username));
        }
        if allowed.is_default() {
            return Cred::default();
        }
        Err(git2::Error::from_str(
            "Authentication required. Connect to GitHub, or configure an SSH remote and SSH agent.",
        ))
    });
    callbacks.push_update_reference(|_, status| {
        status.map_or(Ok(()), |message| Err(git2::Error::from_str(message)))
    });
    callbacks
}

pub fn fetch_repository(path: &str) -> EngineResult<()> {
    fetch_repository_with_auth(path, None, "git", None)
}

pub fn fetch_repository_with_auth(
    path: &str,
    token: Option<&str>,
    username: &str,
    expected_host: Option<&str>,
) -> EngineResult<()> {
    let repo = open(path)?;
    let mut remote = repo.find_remote("origin").map_err(|_| {
        "This repository has no origin remote. Publish it or configure a remote first.".to_string()
    })?;
    let mut options = FetchOptions::new();
    if token.is_some() {
        validate_token_destination(
            remote.url().map_err(|_| "Invalid remote URL.")?,
            expected_host,
        )?;
        options.follow_redirects(git2::RemoteRedirect::None);
    }
    options.remote_callbacks(callbacks(token, username, expected_host));
    remote
        .fetch::<&str>(&[], Some(&mut options), None)
        .map_err(network_error)
}

fn network_error(error: git2::Error) -> String {
    // A remote's raw diagnostic may contain a configured credential-bearing URL.
    // Report classified errors instead of ever emitting that diagnostic to IPC.
    let help = match error.code() {
        ErrorCode::Auth => "Authentication was rejected. Connect to GitHub again, or unlock your SSH agent for an SSH remote.",
        ErrorCode::Certificate => "The remote certificate could not be verified. Check your network and trusted certificates.",
        ErrorCode::NotFastForward => "The remote branch has new history. Fetch and review it before pushing; remote history was preserved.",
        _ => "The remote could not complete the operation. Check your connection, repository access, and SSH agent.",
    };
    format!(
        "{help} Local files are preserved. (Git {:?}/{:?})",
        error.class(),
        error.code()
    )
}

pub fn push_repository(
    path: &str,
    token: Option<&str>,
    username: &str,
    expected_host: Option<&str>,
) -> EngineResult<()> {
    let repo = open(path)?;
    ensure_clean_operation(&repo)?;
    let head = repo
        .head()
        .map_err(|_| "Create a commit before pushing.".to_string())?;
    if !head.is_branch() {
        return Err("Create a branch before pushing from a detached HEAD.".into());
    }
    let branch = head.shorthand().map_err(|e| e.to_string())?;
    let mut remote = repo
        .find_remote("origin")
        .map_err(|_| "No origin remote is configured.".to_string())?;
    if token.is_some() {
        let push_url = remote.pushurl().map_err(|_| {
            "The push URL is invalid; token authentication was withheld.".to_string()
        })?;
        let fetch_url = remote.url().map_err(|_| {
            "The remote URL is invalid; token authentication was withheld.".to_string()
        })?;
        let destination = push_url.unwrap_or(fetch_url);
        validate_token_destination(destination, expected_host)?;
    }
    let mut options = PushOptions::new();
    if token.is_some() {
        options.follow_redirects(git2::RemoteRedirect::None);
    }
    options.remote_callbacks(callbacks(token, username, expected_host));
    remote
        .push(
            &[format!("refs/heads/{branch}:refs/heads/{branch}")],
            Some(&mut options),
        )
        .map_err(network_error)?;
    let target = head
        .target()
        .ok_or("The current branch does not have a commit.")?;
    repo.reference(
        &format!("refs/remotes/origin/{branch}"),
        target,
        true,
        "Branchline: update published branch",
    )
    .map_err(|e| e.to_string())?;
    let result = repo
        .find_branch(branch, BranchType::Local)
        .map_err(|e| e.to_string())?
        .set_upstream(Some(&format!("origin/{branch}")))
        .map_err(|e| e.to_string());
    result
}

pub fn pull_repository(path: &str) -> EngineResult<()> {
    pull_repository_with_auth(path, None, "git", None)
}

pub fn pull_repository_with_auth(
    path: &str,
    token: Option<&str>,
    username: &str,
    expected_host: Option<&str>,
) -> EngineResult<()> {
    let repo = open(path)?;
    ensure_clean_operation(&repo)?;
    if !repo.statuses(None).map_err(|e| e.to_string())?.is_empty() {
        return Err("Commit or stash local changes before pulling.".into());
    }
    let head = repo.head().map_err(|e| e.to_string())?;
    if !head.is_branch() {
        return Err("Switch to a branch before pulling.".into());
    }
    let branch_name = head.shorthand().map_err(|e| e.to_string())?.to_string();
    let upstream_name = repo
        .find_branch(&branch_name, BranchType::Local)
        .and_then(|b| b.upstream())
        .and_then(|b| b.get().name().map(str::to_owned))
        .map_err(|_| "This branch has no upstream. Push it first.".to_string())?;
    let remote_name = repo
        .branch_upstream_remote(head.name().map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let remote_name = remote_name.as_str().map_err(|e| e.to_string())?;
    let mut remote = repo.find_remote(remote_name).map_err(|e| e.to_string())?;
    let mut options = FetchOptions::new();
    if token.is_some() {
        validate_token_destination(
            remote.url().map_err(|_| "Invalid remote URL.")?,
            expected_host,
        )?;
        options.follow_redirects(git2::RemoteRedirect::None);
    }
    options.remote_callbacks(callbacks(token, username, expected_host));
    remote
        .fetch::<&str>(&[], Some(&mut options), None)
        .map_err(network_error)?;
    let upstream = repo
        .find_reference(&upstream_name)
        .map_err(|e| e.to_string())?;
    let annotated = repo
        .reference_to_annotated_commit(&upstream)
        .map_err(|e| e.to_string())?;
    let (analysis, _) = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| e.to_string())?;
    if analysis.is_up_to_date() {
        return Ok(());
    }
    if !analysis.is_fast_forward() {
        return Err("Your branch and its remote have diverged. Review the history before merging or rebasing; no files were changed.".into());
    }
    let target = repo
        .find_object(annotated.id(), None)
        .map_err(|e| e.to_string())?;
    // Safe checkout refuses to overwrite any work that appeared during the fetch.
    repo.checkout_tree(&target, Some(CheckoutBuilder::new().safe()))
        .map_err(|e| e.to_string())?;
    let mut local = repo
        .find_reference(head.name().map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    local
        .set_target(annotated.id(), "Branchline: fast-forward pull")
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn validate_repository_name(name: &str) -> EngineResult<()> {
    if name.is_empty()
        || name.len() > 100
        || matches!(name, "." | "..")
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
        || !name.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err("Use a repository name starting with a letter or number, containing only letters, numbers, dots, dashes, and underscores (up to 100 characters).".into());
    }
    Ok(())
}

fn sensitive_name(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let sample = [".env.example", ".env.sample", ".env.template"].contains(&name.as_str());
    (!sample && (name == ".env" || name.starts_with(".env.")))
        || [
            "id_rsa",
            "id_ed25519",
            ".npmrc",
            ".pypirc",
            "credentials",
            "credentials.json",
        ]
        .contains(&name.as_str())
        || ["pem", "key", "p12", "pfx"].contains(
            &path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase()
                .as_str(),
        )
}

/// Preflight is performed before creating .git or contacting a provider.
/// Only files allowed by local ignore rules will become the initial commit.
pub fn validate_publish_folder(path: &str, name: &str) -> EngineResult<(PathBuf, Vec<PathBuf>)> {
    validate_repository_name(name)?;
    let root = canonical_directory(path)?;
    if Repository::discover(&root).is_ok() || root.join(".git").exists() {
        return Err("This folder already belongs to a Git repository. Open it instead; publishing a new folder never rewrites existing history.".into());
    }
    let mut files = Vec::new();
    let mut walker = ignore::WalkBuilder::new(&root);
    walker
        .hidden(false)
        .require_git(false)
        .follow_links(false)
        .ignore(false)
        .parents(false);
    for entry in walker.build() {
        let entry = entry.map_err(|e| format!("Cannot inspect folder: {e}"))?;
        if entry.file_type().is_some_and(|kind| kind.is_dir()) {
            if entry.path() != root && entry.path().join(".git").exists() {
                return Err(format!(
                    "Nested repository detected at {}. Exclude it in .gitignore before publishing.",
                    entry.path().display()
                ));
            }
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_path_buf();
        if relative.as_os_str().is_empty() {
            continue;
        }
        if relative
            .components()
            .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
        {
            return Err(format!(
                "Nested repository detected at {}. Exclude it in .gitignore before publishing.",
                relative.display()
            ));
        }
        if sensitive_name(&relative) {
            return Err(format!("Potential secret detected: {}. Add it to .gitignore or move it out of this folder before publishing.", relative.display()));
        }
        let metadata = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
        if metadata.len() > MAX_PUBLISH_BYTES {
            return Err(format!(
                "{} exceeds 50 MiB. Exclude it or configure Git LFS before publishing.",
                relative.display()
            ));
        }
        files.push(relative);
        if files.len() > 100_000 {
            return Err("This folder contains over 100,000 files. Add generated files and dependencies to .gitignore before publishing.".into());
        }
    }
    if files.is_empty() {
        return Err(
            "This folder has no publishable files. Add a README or another file first.".into(),
        );
    }
    Ok((root, files))
}

pub fn initialize_publish(
    root: &Path,
    files: &[PathBuf],
    author_name: &str,
    author_email: &str,
) -> EngineResult<()> {
    initialize_repository(root, author_name, author_email)?;
    create_initial_commit(root, files, author_name, author_email)
}

pub fn initialize_repository(
    root: &Path,
    author_name: &str,
    author_email: &str,
) -> EngineResult<()> {
    if author_name.trim().is_empty()
        || author_email.trim().is_empty()
        || !author_email.contains('@')
        || author_name.contains(['\n', '\r'])
        || author_email.contains(['\n', '\r'])
    {
        return Err("Enter your author name and a valid commit email address.".into());
    }
    Signature::now(author_name.trim(), author_email.trim()).map_err(|e| e.to_string())?;
    let mut options = RepositoryInitOptions::new();
    options.initial_head("main").no_reinit(true);
    let repo = Repository::init_opts(root, &options)
        .map_err(|e| format!("Could not initialize repository: {e}"))?;
    let mut config = repo.config().map_err(|e| e.to_string())?;
    config
        .set_str("user.name", author_name.trim())
        .map_err(|e| e.to_string())?;
    config
        .set_str("user.email", author_email.trim())
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn create_initial_commit(
    root: &Path,
    files: &[PathBuf],
    author_name: &str,
    author_email: &str,
) -> EngineResult<()> {
    let repo = Repository::open(root).map_err(|e| e.to_string())?;
    let signature =
        Signature::now(author_name.trim(), author_email.trim()).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    // Explicit preflight-approved paths ensure .ignore and .gitignore exclusions agree.
    for path in files {
        index
            .add_path(path)
            .map_err(|e| format!("Could not stage {}: {e}", path.display()))?;
    }
    index.write().map_err(|e| e.to_string())?;
    commit_index(&repo, "Initial commit", &signature)?;
    Ok(())
}

pub fn add_remote(path: &str, clone_url: &str) -> EngineResult<()> {
    let repo = open(path)?;
    repo.remote("origin", clone_url)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn publish_preflight_refuses_secret_before_git_is_created() {
        let folder = tempdir().unwrap();
        fs::write(folder.path().join(".env"), "SECRET=private").unwrap();
        assert!(
            validate_publish_folder(folder.path().to_str().unwrap(), "demo")
                .unwrap_err()
                .contains("Potential secret")
        );
        assert!(!folder.path().join(".git").exists());
        fs::write(folder.path().join(".gitignore"), ".env\n").unwrap();
        let (_, files) = validate_publish_folder(folder.path().to_str().unwrap(), "demo").unwrap();
        assert!(!files.iter().any(|p| p == Path::new(".env")));
    }

    #[test]
    fn stage_unstage_commit_and_diff_are_real_git_operations() {
        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Test Author", "test@example.com").unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\nworld\n").unwrap();
        assert_eq!(snapshot(path).unwrap().files.len(), 1);
        let diff = get_diff(path, "hello.txt", false).unwrap();
        assert_eq!(diff.original, "hello\n");
        assert_eq!(diff.modified, "hello\nworld\n");
        stage_file(path, "hello.txt").unwrap();
        assert!(snapshot(path).unwrap().files[0].staged);
        unstage_file(path, "hello.txt").unwrap();
        assert!(!snapshot(path).unwrap().files[0].staged);
        stage_file(path, "hello.txt").unwrap();
        commit_changes(path, "Add world").unwrap();
        let snapshot = snapshot(path).unwrap();
        assert!(snapshot.files.is_empty());
        assert_eq!(snapshot.commits[0].summary, "Add world");
        assert_eq!(snapshot.branch, "main");
        assert!(stage_file(path, "../outside").is_err());
    }

    #[test]
    fn mixed_changes_have_distinct_staged_and_working_previews() {
        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        let file = folder.path().join("hello.txt");
        fs::write(&file, "base\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Test", "test@example.com").unwrap();
        fs::write(&file, "base\nstaged\n").unwrap();
        stage_file(path, "hello.txt").unwrap();
        fs::write(&file, "base\nstaged\nworking\nextra\n").unwrap();
        let snapshot = snapshot(path).unwrap();
        assert_eq!(snapshot.files.len(), 2);
        let staged = snapshot.files.iter().find(|file| file.staged).unwrap();
        let working = snapshot.files.iter().find(|file| !file.staged).unwrap();
        assert_eq!(staged.path, working.path);
        assert_eq!((staged.additions, staged.deletions), (1, 0));
        assert_eq!((working.additions, working.deletions), (2, 0));
        let staged_diff = get_diff(path, "hello.txt", true).unwrap();
        assert_eq!(staged_diff.original, "base\n");
        assert_eq!(staged_diff.modified, "base\nstaged\n");
        let working_diff = get_diff(path, "hello.txt", false).unwrap();
        assert_eq!(working_diff.original, "base\nstaged\n");
        assert_eq!(working_diff.modified, "base\nstaged\nworking\nextra\n");
        commit_changes(path, "Only staged content").unwrap();
        let staged_diff = get_diff(path, "hello.txt", true).unwrap();
        assert_eq!(staged_diff.original, "base\nstaged\n");
        assert_eq!(staged_diff.original, staged_diff.modified);
        assert_eq!(
            fs::read_to_string(file).unwrap(),
            "base\nstaged\nworking\nextra\n"
        );
    }

    #[test]
    fn existing_parent_repository_is_never_reinitialized() {
        let folder = tempdir().unwrap();
        Repository::init(folder.path()).unwrap();
        let child = folder.path().join("nested");
        fs::create_dir(&child).unwrap();
        fs::write(child.join("hello.txt"), "hello").unwrap();
        assert!(validate_publish_folder(child.to_str().unwrap(), "demo")
            .unwrap_err()
            .contains("already belongs"));
        assert!(!child.join(".git").exists());
    }

    #[test]
    fn unsafe_names_and_unstaged_commits_are_rejected() {
        for name in [
            "",
            "..",
            "../escape",
            "hello/world",
            "--force",
            "hello world",
        ] {
            assert!(validate_repository_name(name).is_err());
        }
        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Test", "test@example.com").unwrap();
        assert!(commit_changes(path, "No changes").is_err());
        assert!(commit_changes(path, " ").is_err());
    }

    #[test]
    fn publishing_rejects_nested_repositories_and_large_files() {
        let folder = tempdir().unwrap();
        let nested = folder.path().join("nested");
        fs::create_dir(&nested).unwrap();
        Repository::init(&nested).unwrap();
        assert!(
            validate_publish_folder(folder.path().to_str().unwrap(), "demo")
                .unwrap_err()
                .contains("Nested repository")
        );
        fs::write(folder.path().join(".gitignore"), "nested/\n").unwrap();
        let large = fs::File::create(folder.path().join("large.bin")).unwrap();
        large.set_len(MAX_PUBLISH_BYTES + 1).unwrap();
        assert!(
            validate_publish_folder(folder.path().to_str().unwrap(), "demo")
                .unwrap_err()
                .contains("50 MiB")
        );
    }

    #[test]
    fn rescue_branch_preserves_dirty_work_and_existing_names() {
        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Test", "test@example.com").unwrap();
        let repo = open(path).unwrap();
        let id = repo.head().unwrap().target().unwrap();
        repo.set_head_detached(id).unwrap();
        fs::write(folder.path().join("hello.txt"), "unsaved work\n").unwrap();
        assert_eq!(snapshot(path).unwrap().guardian.unwrap().kind, "detached");
        create_rescue_branch(path, "rescue/my-work").unwrap();
        assert_eq!(snapshot(path).unwrap().branch, "rescue/my-work");
        assert_eq!(
            fs::read_to_string(folder.path().join("hello.txt")).unwrap(),
            "unsaved work\n"
        );
        assert!(create_rescue_branch(path, "rescue/my-work").is_err());
    }

    #[test]
    fn fetch_push_and_pull_handle_a_local_remote_and_refuse_dirty_work() {
        let folder = tempdir().unwrap();
        let source = folder.path().join("source");
        let remote = folder.path().join("remote.git");
        let clone = folder.path().join("clone");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("hello.txt"), "hello\n").unwrap();
        let source_path = source.to_str().unwrap();
        let (root, files) = validate_publish_folder(source_path, "demo").unwrap();
        initialize_publish(&root, &files, "Test", "test@example.com").unwrap();
        let bare = Repository::init_bare(&remote).unwrap();
        bare.set_head("refs/heads/main").unwrap();
        add_remote(source_path, remote.to_str().unwrap()).unwrap();
        push_repository(source_path, None, "git", None).unwrap();
        Repository::clone(remote.to_str().unwrap(), &clone).unwrap();
        let clone_path = clone.to_str().unwrap();
        fs::write(source.join("hello.txt"), "hello\nremote change\n").unwrap();
        stage_file(source_path, "hello.txt").unwrap();
        commit_changes(source_path, "Remote change").unwrap();
        push_repository(source_path, None, "git", None).unwrap();
        fetch_repository(clone_path).unwrap();
        pull_repository(clone_path).unwrap();
        assert_eq!(
            snapshot(clone_path).unwrap().commits[0].summary,
            "Remote change"
        );
        fs::write(clone.join("hello.txt"), "local dirty work\n").unwrap();
        assert!(pull_repository(clone_path)
            .unwrap_err()
            .contains("Commit or stash"));
        assert_eq!(
            fs::read_to_string(clone.join("hello.txt")).unwrap(),
            "local dirty work\n"
        );
    }

    #[test]
    fn provider_tokens_are_bound_to_the_expected_https_destination() {
        assert!(validate_token_destination(
            "https://github.com/owner/repo.git",
            Some("github.com")
        )
        .is_ok());
        assert!(validate_token_destination(
            "https://gitlab.com:443/owner/repo.git",
            Some("gitlab.com")
        )
        .is_ok());
        for url in [
            "http://github.com/owner/repo",
            "https://github.com:444/owner/repo",
            "https://github.com.evil.example/owner/repo",
            "https://attacker.example/repo",
            "https://name:password@github.com/owner/repo",
            "https://gitlab.com/owner/repo",
            "https://github.com/owner/repo?token=secret",
        ] {
            assert!(
                validate_token_destination(url, Some("github.com")).is_err(),
                "must reject {url}"
            );
        }
        assert!(validate_token_destination(
            "https://attacker.example/repo",
            Some("attacker.example")
        )
        .is_err());
        assert!(validate_token_destination("https://github.com/owner/repo", None).is_err());

        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Test", "test@example.com").unwrap();
        add_remote(path, "https://github.com/owner/repo.git").unwrap();
        open(path)
            .unwrap()
            .remote_set_pushurl("origin", Some("https://attacker.example/repo.git"))
            .unwrap();
        let error = push_repository(
            path,
            Some("never-send-this-token"),
            "x-access-token",
            Some("github.com"),
        )
        .unwrap_err();
        assert!(error.contains("withheld"));
        assert!(!error.contains("never-send-this-token"));
        assert!(!error.contains("attacker.example"));
    }

    #[test]
    fn github_auth_selection_follows_push_url_and_pull_upstream() {
        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Test", "test@example.com").unwrap();
        add_remote(path, "https://github.com/owner/repo.git").unwrap();
        assert!(uses_github_auth(path, "fetch").unwrap());
        assert!(uses_github_auth(path, "push").unwrap());
        let repo = open(path).unwrap();
        repo.remote_set_pushurl("origin", Some("git@github.com:owner/repo.git"))
            .unwrap();
        assert!(!uses_github_auth(path, "push").unwrap());
        assert!(uses_github_auth(path, "fetch").unwrap());
        repo.remote("backup", "https://gitlab.com/owner/repo.git")
            .unwrap();
        let mut config = repo.config().unwrap();
        config.set_str("branch.main.remote", "backup").unwrap();
        config
            .set_str("branch.main.merge", "refs/heads/main")
            .unwrap();
        assert!(!uses_github_auth(path, "pull").unwrap());
        config.set_str("branch.main.remote", "origin").unwrap();
        assert!(uses_github_auth(path, "pull").unwrap());
        repo.remote_set_url("origin", "https://name:password@github.com/owner/repo.git")
            .unwrap();
        assert!(uses_github_auth(path, "fetch").is_err());
    }

    #[test]
    fn account_commit_identity_is_a_fallback_and_does_not_rewrite_config() {
        let folder = tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\n").unwrap();
        let (root, files) = validate_publish_folder(path, "demo").unwrap();
        initialize_publish(&root, &files, "Configured Author", "configured@example.com").unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\nconfigured\n").unwrap();
        stage_file(path, "hello.txt").unwrap();
        let fallback = Some(("Connected Account", "account@example.com"));
        let id = commit_changes_with_identity(path, "Keep repo identity", fallback).unwrap();
        let repo = open(path).unwrap();
        let commit = repo.find_commit(git2::Oid::from_str(&id).unwrap()).unwrap();
        assert_eq!(commit.author().name().unwrap(), "Configured Author");
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "").unwrap();
        config.set_str("user.email", "").unwrap();
        fs::write(folder.path().join("hello.txt"), "hello\nfallback\n").unwrap();
        stage_file(path, "hello.txt").unwrap();
        let id = commit_changes_with_identity(path, "Use connected identity", fallback).unwrap();
        let commit = repo.find_commit(git2::Oid::from_str(&id).unwrap()).unwrap();
        assert_eq!(commit.author().name().unwrap(), "Connected Account");
        assert_eq!(commit.author().email().unwrap(), "account@example.com");
        assert_eq!(config.get_string("user.name").unwrap(), "");
        assert_eq!(config.get_string("user.email").unwrap(), "");
    }
}
