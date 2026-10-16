pub mod git_engine;

use git_engine::{EngineResult, FileDiff, RepositorySnapshot};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use zeroize::Zeroizing;

#[derive(Clone, Default)]
pub struct AppState {
    inner: Arc<SharedState>,
}

#[derive(Default)]
struct SharedState {
    locks: Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>,
    watchers: Mutex<HashMap<PathBuf, RecommendedWatcher>>,
}

impl AppState {
    async fn repository_lock(&self, path: String) -> EngineResult<Arc<tokio::sync::Mutex<()>>> {
        let root = tauri::async_runtime::spawn_blocking(move || {
            let directory = git_engine::canonical_directory(&path)?;
            match git_engine::open(&path) {
                Ok(repo) => git_engine::root_path(&repo),
                Err(_) => Ok(directory),
            }
        })
        .await
        .map_err(|e| e.to_string())??;
        let mut locks = self
            .inner
            .locks
            .lock()
            .map_err(|_| "Repository lock is unavailable.".to_string())?;
        Ok(locks.entry(root).or_default().clone())
    }

    fn watch(&self, app: AppHandle, path: &str) -> EngineResult<()> {
        let root = git_engine::canonical_directory(path)?;
        let mut watchers = self
            .inner
            .watchers
            .lock()
            .map_err(|_| "Watcher registry is unavailable.".to_string())?;
        if watchers.contains_key(&root) {
            return Ok(());
        }
        let (sender, receiver) = std::sync::mpsc::channel();
        let mut watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                if let Ok(event) = event {
                    if !matches!(event.kind, EventKind::Access(_)) {
                        let _ = sender.send(());
                    }
                }
            })
            .map_err(|e| format!("Could not watch repository: {e}"))?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        let watched_path = root.to_string_lossy().into_owned();
        // One worker per opened repository coalesces bursts; access events are ignored
        // so refreshing the index never creates a read/watch feedback loop.
        std::thread::spawn(move || {
            while receiver.recv().is_ok() {
                let burst_started = Instant::now();
                loop {
                    if burst_started.elapsed() >= Duration::from_secs(1) {
                        break;
                    }
                    match receiver.recv_timeout(Duration::from_millis(180)) {
                        Ok(()) => continue,
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                    }
                }
                let _ = app.emit("repo:changed", serde_json::json!({ "path": watched_path }));
            }
        });
        watchers.insert(root, watcher);
        Ok(())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandToken {
    text: String,
    explanation: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandLog {
    id: String,
    operation_id: String,
    tokens: Vec<CommandToken>,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    timestamp: u64,
}

fn tokens(words: &[(&str, &str)]) -> Vec<CommandToken> {
    words
        .iter()
        .map(|(text, explanation)| CommandToken {
            text: (*text).into(),
            explanation: (*explanation).into(),
        })
        .collect()
}

fn log(
    app: &AppHandle,
    id: &str,
    operation_id: &str,
    command: &[CommandToken],
    status: &str,
    message: Option<String>,
) {
    let _ = app.emit(
        "git:log",
        CommandLog {
            id: id.into(),
            operation_id: operation_id.into(),
            tokens: command.to_vec(),
            status: status.into(),
            message,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        },
    );
}

fn quote(argument: &str) -> String {
    format!("'{}'", argument.replace('\'', "'\\''"))
}

async fn run_git<T, F>(
    app: AppHandle,
    state: AppState,
    path: String,
    command: Vec<CommandToken>,
    action: F,
) -> EngineResult<T>
where
    T: Send + 'static,
    F: FnOnce(String) -> EngineResult<T> + Send + 'static,
{
    let id = Uuid::new_v4().to_string();
    let operation_id = id.clone();
    let lock = state.repository_lock(path.clone()).await?;
    let _guard = lock.lock_owned().await;
    log(&app, &id, &operation_id, &command, "running", None);
    let result = tauri::async_runtime::spawn_blocking(move || action(path))
        .await
        .unwrap_or_else(|e| Err(format!("Git worker stopped: {e}")));
    log(
        &app,
        &id,
        &operation_id,
        &command,
        if result.is_ok() { "success" } else { "error" },
        result.as_ref().err().cloned(),
    );
    result
}

#[tauri::command]
async fn open_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> EngineResult<RepositorySnapshot> {
    let watch_state = state.inner().clone();
    let watch_app = app.clone();
    run_git(
        app,
        state.inner().clone(),
        path,
        tokens(&[
            ("git", "Git records your project's history."),
            ("status", "Read the working directory and staging area."),
            ("--short", "Summarize changes without modifying files."),
        ]),
        move |path| {
            let snapshot = git_engine::snapshot(&path)?;
            watch_state.watch(watch_app, &snapshot.path)?;
            Ok(snapshot)
        },
    )
    .await
}

#[tauri::command]
async fn get_diff(
    state: State<'_, AppState>,
    path: String,
    file_path: String,
    staged: Option<bool>,
) -> EngineResult<FileDiff> {
    let lock = state.repository_lock(path.clone()).await?;
    let _guard = lock.lock_owned().await;
    tauri::async_runtime::spawn_blocking(move || {
        git_engine::get_diff(&path, &file_path, staged.unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stage_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    file_path: String,
) -> EngineResult<()> {
    let quoted = quote(&file_path);
    let command = tokens(&[
        ("git", "Git records your project's history."),
        ("add", "Stage the selected file for the next commit."),
        ("--", "Treat everything after this token as a file path."),
        (&quoted, "The file whose current contents will be staged."),
    ]);
    run_git(app, state.inner().clone(), path, command, move |path| {
        git_engine::stage_file(&path, &file_path)
    })
    .await
}

#[tauri::command]
async fn unstage_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    file_path: String,
) -> EngineResult<()> {
    let quoted = quote(&file_path);
    let command = tokens(&[
        ("git", "Git records your project's history."),
        (
            "restore",
            "Restore selected content from another Git snapshot.",
        ),
        (
            "--staged",
            "Remove this change from the next commit while preserving your working file.",
        ),
        ("--", "Treat the following token as a file path."),
        (&quoted, "The file to remove from staging."),
    ]);
    run_git(app, state.inner().clone(), path, command, move |path| {
        git_engine::unstage_file(&path, &file_path)
    })
    .await
}

#[tauri::command]
async fn commit_changes(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    message: String,
) -> EngineResult<String> {
    let quoted = quote(&message);
    let command = tokens(&[
        ("git", "Git records your project's history."),
        (
            "commit",
            "Save staged changes as a permanent history snapshot.",
        ),
        ("-m", "Use the following text as the commit message."),
        (&quoted, "Your explanation of this change."),
    ]);
    run_git(app, state.inner().clone(), path, command, move |path| {
        git_engine::commit_changes(&path, &message)
    })
    .await
}

#[tauri::command]
async fn fetch_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> EngineResult<()> {
    run_git(
        app,
        state.inner().clone(),
        path,
        tokens(&[
            ("git", "Git records your project's history."),
            (
                "fetch",
                "Download remote history without changing your working files.",
            ),
            ("origin", "The remote this repository was published to."),
        ]),
        |path| git_engine::fetch_repository(&path),
    )
    .await
}

#[tauri::command]
async fn push_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> EngineResult<()> {
    run_git(
        app,
        state.inner().clone(),
        path,
        tokens(&[
            ("git", "Git records your project's history."),
            (
                "push",
                "Upload local commits. Divergent remote history is never overwritten.",
            ),
            (
                "--set-upstream",
                "Remember the remote branch for future pushes and pulls.",
            ),
            ("origin", "The remote this repository was published to."),
            ("HEAD", "Push the currently checked out branch."),
        ]),
        |path| git_engine::push_repository(&path, None, "git", None),
    )
    .await
}

#[tauri::command]
async fn pull_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> EngineResult<()> {
    run_git(
        app,
        state.inner().clone(),
        path,
        tokens(&[
            ("git", "Git records your project's history."),
            ("pull", "Download history and advance this branch."),
            (
                "--ff-only",
                "Stop safely if local and remote history have diverged.",
            ),
        ]),
        |path| git_engine::pull_repository(&path),
    )
    .await
}

#[tauri::command]
async fn create_rescue_branch(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> EngineResult<()> {
    let quoted = quote(&name);
    let command = tokens(&[
        ("git", "Git records your project's history."),
        (
            "switch",
            "Move onto a branch pointing to this same commit; your files stay in place.",
        ),
        (
            "-c",
            "Create a new branch without overwriting an existing one.",
        ),
        (
            &quoted,
            "A permanent branch name for the work you are rescuing.",
        ),
    ]);
    run_git(app, state.inner().clone(), path, command, move |path| {
        git_engine::create_rescue_branch(&path, &name)
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishRequest {
    path: String,
    name: String,
    private: bool,
    provider: String,
    token: String,
    author_name: String,
    author_email: String,
    operation_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublishResult {
    url: String,
    path: String,
    branch: String,
}

#[derive(Deserialize)]
struct ProviderRepository {
    html_url: Option<String>,
    clone_url: Option<String>,
    web_url: Option<String>,
    http_url_to_repo: Option<String>,
}

fn progress(
    app: &AppHandle,
    operation_id: &str,
    step: &str,
    status: &str,
    message: Option<&str>,
    url: Option<&str>,
) {
    let _ = app.emit("publish:progress", serde_json::json!({ "operationId": operation_id, "step": step, "status": status, "message": message, "url": url }));
}

async fn provider_error(response: reqwest::Response, provider: &str) -> String {
    let status = response.status();
    // The provider response body is intentionally excluded: it may echo user data.
    let help = match status.as_u16() {
        401 => "Your token was rejected. Check its value and expiration.",
        403 => "Your token needs permission to create and push repositories, or your organization restricts this action.",
        400 | 409 | 422 => "A repository with that name may already exist, or the provider rejected the name.",
        429 => "The provider rate limit was reached. Wait before trying again.",
        _ => "Check your connection and provider status before retrying.",
    };
    format!("{provider} returned HTTP {status}. {help} Any local repository already created has been preserved.")
}

async fn validate_provider_access(request: &PublishRequest, token: &str) -> EngineResult<()> {
    let client = reqwest::Client::builder()
        .user_agent("Branchline/0.1")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let account_endpoint = if request.provider == "github" {
        "https://api.github.com/user"
    } else {
        "https://gitlab.com/api/v4/user"
    };
    let response = client.get(account_endpoint).bearer_auth(token).header("Accept", "application/json").send().await.map_err(|_| "Could not verify your provider account. Check your connection; this folder has not been changed.".to_string())?;
    if !response.status().is_success() {
        return Err(provider_error(response, &request.provider).await);
    }
    let account: serde_json::Value = response.json().await.map_err(|_| "The provider returned an unexpected account response. This folder has not been changed.".to_string())?;
    let username = account
        .get(if request.provider == "github" {
            "login"
        } else {
            "username"
        })
        .and_then(|value| value.as_str())
        .ok_or("The provider did not return an account name. This folder has not been changed.")?;
    let mut availability_url = reqwest::Url::parse(if request.provider == "github" {
        "https://api.github.com/repos"
    } else {
        "https://gitlab.com/api/v4/projects"
    })
    .map_err(|e| e.to_string())?;
    {
        let mut segments = availability_url
            .path_segments_mut()
            .map_err(|_| "Could not construct the provider URL.".to_string())?;
        if request.provider == "github" {
            segments.push(username).push(&request.name);
        } else {
            segments.push(&format!("{username}/{}", request.name));
        }
    }
    let availability = client
        .get(availability_url)
        .bearer_auth(token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| {
            "Could not check repository-name availability. Your folder has not been changed."
                .to_string()
        })?;
    match availability.status().as_u16() {
        404 => Ok(()),
        200 => Err("A repository with this name already exists in your account. Choose another name; your folder has not been changed.".into()),
        _ => Err(provider_error(availability, &request.provider).await),
    }
}

async fn create_remote(
    request: &PublishRequest,
    token: &str,
) -> EngineResult<(String, String, String)> {
    let client = reqwest::Client::builder()
        .user_agent("Branchline/0.1")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;
    let (endpoint, body, username) = if request.provider == "github" {
        (
            "https://api.github.com/user/repos",
            serde_json::json!({"name": request.name, "private": request.private, "auto_init": false}),
            "x-access-token",
        )
    } else {
        (
            "https://gitlab.com/api/v4/projects",
            serde_json::json!({"name": request.name, "path": request.name, "visibility": if request.private { "private" } else { "public" }, "initialize_with_readme": false}),
            "oauth2",
        )
    };
    let response = client.post(endpoint).bearer_auth(token).header("Accept", "application/json").json(&body).send().await.map_err(|_| "The provider did not confirm repository creation. Check your account before retrying; the request may have succeeded. Your local repository is preserved.".to_string())?;
    if !response.status().is_success() {
        return Err(provider_error(response, &request.provider).await);
    }
    let created = response.json::<ProviderRepository>().await.map_err(|_| "The provider created a repository but returned an unexpected response. Check your account; your local repository is preserved.".to_string())?;
    let url = created
        .html_url
        .or(created.web_url)
        .ok_or("The provider did not return the repository URL. Check your provider account.")?;
    let clone_url = created
        .clone_url
        .or(created.http_url_to_repo)
        .ok_or("The provider did not return a clone URL. Check your provider account.")?;
    // Provider responses can never redirect a transient credential to another host.
    let expected_host = if request.provider == "github" {
        "github.com"
    } else {
        "gitlab.com"
    };
    let parsed =
        reqwest::Url::parse(&clone_url).map_err(|_| "Invalid provider clone URL.".to_string())?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(expected_host)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("The provider returned an unexpected clone URL. Repository creation was preserved; no credential was sent to that URL.".into());
    }
    Ok((url, clone_url, username.into()))
}

#[tauri::command]
async fn publish_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    mut request: PublishRequest,
) -> EngineResult<PublishResult> {
    let token = Zeroizing::new(std::mem::take(&mut request.token));
    let operation = request.operation_id.clone();
    progress(
        &app,
        &operation,
        "validate",
        "running",
        Some("Checking this folder before making any changes."),
        None,
    );
    let mut current_step = "validate";
    let result = publish_inner(
        &app,
        state.inner().clone(),
        &request,
        &token,
        &mut current_step,
    )
    .await;
    if let Err(error) = &result {
        progress(&app, &operation, current_step, "error", Some(error), None);
        // A terminal error event is always emitted, including failures between stages.
        progress(&app, &operation, "done", "error", Some(error), None);
    }
    result
}

async fn publish_inner(
    app: &AppHandle,
    state: AppState,
    request: &PublishRequest,
    token: &str,
    current_step: &mut &'static str,
) -> EngineResult<PublishResult> {
    let operation = &request.operation_id;
    if !matches!(request.provider.as_str(), "github" | "gitlab") {
        return Err("Choose GitHub or GitLab.".into());
    }
    if token.trim().is_empty() {
        return Err(
            "Enter a provider access token. It is used for this request and is never saved.".into(),
        );
    }
    if request.author_name.trim().is_empty() || !request.author_email.contains('@') {
        return Err("Enter your author name and commit email address.".into());
    }
    if operation.is_empty() || operation.len() > 128 {
        return Err("Invalid publish operation identifier.".into());
    }
    let lock = state.repository_lock(request.path.clone()).await?;
    let _guard = lock.lock_owned().await;
    let path = request.path.clone();
    let name = request.name.clone();
    let (root, files) = tauri::async_runtime::spawn_blocking(move || {
        git_engine::validate_publish_folder(&path, &name)
    })
    .await
    .map_err(|e| e.to_string())??;
    // An expired token or common repository-name collision must not create .git.
    validate_provider_access(request, token).await?;
    progress(
        app,
        operation,
        "validate",
        "success",
        Some("Folder checked. No ignored files or obvious credential files will be published."),
        None,
    );
    *current_step = "init";
    progress(
        app,
        operation,
        "init",
        "running",
        Some("Creating local history on main."),
        None,
    );
    let init_id = Uuid::new_v4().to_string();
    let init_tokens = tokens(&[
        ("git", "Git records your project's history."),
        (
            "init",
            "Create a local Git repository without touching the files.",
        ),
        ("--initial-branch=main", "Name the first branch main."),
    ]);
    log(app, &init_id, operation, &init_tokens, "running", None);
    let author_name = request.author_name.clone();
    let author_email = request.author_email.clone();
    let local_root = root.clone();
    let initialized = tauri::async_runtime::spawn_blocking(move || {
        git_engine::initialize_repository(&local_root, &author_name, &author_email)
    })
    .await
    .map_err(|e| e.to_string())?;
    log(
        app,
        &init_id,
        operation,
        &init_tokens,
        if initialized.is_ok() {
            "success"
        } else {
            "error"
        },
        initialized.as_ref().err().cloned(),
    );
    initialized?;
    progress(app, operation, "init", "success", None, None);
    *current_step = "commit";
    progress(
        app,
        operation,
        "commit",
        "running",
        Some("Staging checked files and creating the initial commit."),
        None,
    );
    let commit_id = Uuid::new_v4().to_string();
    let commit_tokens = tokens(&[
        ("git", "Git records your project's history."),
        (
            "add",
            "Stage publishable files, honoring your ignore rules.",
        ),
        ("--all", "Include all checked new files."),
        ("&&", "The next operation only runs after staging succeeds."),
        ("git", "Git records your project's history."),
        ("commit", "Save the initial project snapshot."),
        ("-m", "Use the following commit message."),
        ("'Initial commit'", "The initial history snapshot."),
    ]);
    log(app, &commit_id, operation, &commit_tokens, "running", None);
    let author_name = request.author_name.clone();
    let author_email = request.author_email.clone();
    let local_root = root.clone();
    let committed = tauri::async_runtime::spawn_blocking(move || {
        git_engine::create_initial_commit(&local_root, &files, &author_name, &author_email)
    })
    .await
    .map_err(|e| e.to_string())?;
    log(
        app,
        &commit_id,
        operation,
        &commit_tokens,
        if committed.is_ok() {
            "success"
        } else {
            "error"
        },
        committed.as_ref().err().cloned(),
    );
    committed?;
    progress(
        app,
        operation,
        "commit",
        "success",
        Some("Your initial commit is saved locally."),
        None,
    );
    *current_step = "remote";
    progress(
        app,
        operation,
        "remote",
        "running",
        Some("Creating your cloud repository."),
        None,
    );
    let (url, clone_url, username) = create_remote(request, token).await?;
    let path = root.to_string_lossy().into_owned();
    let remote_path = path.clone();
    let remote_clone_url = clone_url.clone();
    let remote_id = Uuid::new_v4().to_string();
    let quoted_url = quote(&clone_url);
    let remote_tokens = tokens(&[
        ("git", "Git records your project's history."),
        (
            "remote",
            "Manage the cloud repositories connected to this folder.",
        ),
        ("add", "Add a new remote without changing any files."),
        (
            "origin",
            "The conventional name for your primary cloud repository.",
        ),
        (
            &quoted_url,
            "The HTTPS repository URL; credentials are never embedded.",
        ),
    ]);
    log(app, &remote_id, operation, &remote_tokens, "running", None);
    let remote_result = tauri::async_runtime::spawn_blocking(move || {
        git_engine::add_remote(&remote_path, &remote_clone_url)
    })
    .await
    .map_err(|e| e.to_string())?;
    log(
        app,
        &remote_id,
        operation,
        &remote_tokens,
        if remote_result.is_ok() {
            "success"
        } else {
            "error"
        },
        remote_result.as_ref().err().cloned(),
    );
    remote_result.map_err(|error| format!("Repository created at {url}, but origin could not be configured: {error}. The local and remote repositories are preserved."))?;
    progress(
        app,
        operation,
        "remote",
        "success",
        Some("Cloud repository connected."),
        Some(&url),
    );
    *current_step = "push";
    progress(
        app,
        operation,
        "push",
        "running",
        Some("Uploading your initial commit."),
        Some(&url),
    );
    let push_id = Uuid::new_v4().to_string();
    let push_tokens = tokens(&[
        ("git", "Git records your project's history."),
        ("push", "Upload local history to the new cloud repository."),
        (
            "--set-upstream",
            "Remember the cloud branch for future synchronization.",
        ),
        ("origin", "Your new cloud repository."),
        ("main", "The branch containing your initial commit."),
    ]);
    log(app, &push_id, operation, &push_tokens, "running", None);
    let push_path = path.clone();
    let push_token = Zeroizing::new(token.to_string());
    let trusted_host = if request.provider == "github" {
        "github.com"
    } else {
        "gitlab.com"
    };
    let pushed = tauri::async_runtime::spawn_blocking(move || {
        git_engine::push_repository(&push_path, Some(&push_token), &username, Some(trusted_host))
    })
    .await
    .map_err(|e| e.to_string())?;
    log(
        app,
        &push_id,
        operation,
        &push_tokens,
        if pushed.is_ok() { "success" } else { "error" },
        pushed.as_ref().err().cloned(),
    );
    pushed.map_err(|error| format!("Your repository exists at {url}, and your initial commit is safe locally, but the upload failed: {error} Configure your SSH remote or provider credentials before retrying a push."))?;
    let completion_message = if state.watch(app.clone(), &path).is_ok() {
        "Your project is now on the cloud."
    } else {
        "Your project was uploaded successfully. Automatic refresh could not start; reopen the repository to retry it."
    };
    progress(app, operation, "push", "success", None, Some(&url));
    progress(
        app,
        operation,
        "done",
        "success",
        Some(completion_message),
        Some(&url),
    );
    Ok(PublishResult {
        url,
        path,
        branch: "main".into(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_repository,
            get_diff,
            stage_file,
            unstage_file,
            commit_changes,
            fetch_repository,
            push_repository,
            pull_repository,
            create_rescue_branch,
            publish_repository
        ])
        .run(tauri::generate_context!())
        .expect("could not run Branchline desktop application");
}
