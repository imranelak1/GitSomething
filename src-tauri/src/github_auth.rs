//! GitHub's public-client device flow. Credentials and device codes never cross IPC.
//! Only the application's public OAuth client ID is configuration; no client secret.
use crate::git_engine::EngineResult;
use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

const SCOPES: &str = "repo workflow read:user user:email";
const VERIFY_URL: &str = "https://github.com/login/device";
const SERVICE: &str = "com.branchline.desktop.github";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubAccount {
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: String,
}

#[derive(Clone, Deserialize, Serialize, Zeroize, ZeroizeOnDrop)]
struct Credential {
    token: String,
    refresh_token: Option<String>,
    #[zeroize(skip)]
    client_id: String,
    #[zeroize(skip)]
    account: GitHubAccount,
    #[zeroize(skip)]
    scopes: Vec<String>,
    #[zeroize(skip)]
    expires_at: Option<u64>,
    #[zeroize(skip)]
    refresh_expires_at: Option<u64>,
}

struct Session {
    id: String,
    code: Zeroizing<String>,
    expires_at: Instant,
    next_poll: Instant,
    interval: u64,
    in_flight: bool,
}

impl Session {
    fn gate(&self, now: Instant) -> Option<PollResult> {
        if now >= self.expires_at {
            return Some(PollResult::new("expired", None));
        }
        if self.in_flight || now < self.next_poll {
            let wait = self
                .next_poll
                .saturating_duration_since(now)
                .as_secs()
                .saturating_add(1);
            return Some(PollResult::new("pending", Some(wait.max(1))));
        }
        None
    }

    fn pending(&mut self, slowdown: bool, provider_interval: Option<u64>) -> PollResult {
        self.in_flight = false;
        if slowdown {
            self.interval = self
                .interval
                .saturating_add(5)
                .max(provider_interval.unwrap_or(0));
        }
        self.next_poll = Instant::now() + Duration::from_secs(self.interval);
        PollResult::new(
            if slowdown { "slow_down" } else { "pending" },
            Some(self.interval),
        )
    }
}

#[derive(Default)]
struct Inner {
    restored: bool,
    credential: Option<Credential>,
    session: Option<Session>,
    error: Option<String>,
}

#[derive(Clone, Default)]
pub struct AuthState(Arc<tokio::sync::Mutex<Inner>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    configured: bool,
    connected: bool,
    account: Option<GitHubAccount>,
    scopes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSession {
    session_id: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    account: Option<GitHubAccount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after: Option<u64>,
}

impl PollResult {
    fn new(status: &'static str, retry_after: Option<u64>) -> Self {
        Self {
            status,
            account: None,
            retry_after,
        }
    }
}

#[derive(Deserialize)]
struct DeviceResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize, Default, Zeroize, ZeroizeOnDrop)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    #[zeroize(skip)]
    token_type: Option<String>,
    #[zeroize(skip)]
    scope: Option<String>,
    #[zeroize(skip)]
    error: Option<String>,
    #[zeroize(skip)]
    expires_in: Option<u64>,
    #[zeroize(skip)]
    refresh_token_expires_in: Option<u64>,
    #[zeroize(skip)]
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct UserResponse {
    id: u64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: String,
}

#[derive(Deserialize)]
struct EmailResponse {
    email: String,
    primary: bool,
    verified: bool,
}

fn client_id() -> Option<String> {
    std::env::var("BRANCHLINE_GITHUB_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("BRANCHLINE_GITHUB_CLIENT_ID").map(str::to_owned))
        .map(|id| id.trim().to_owned())
        .filter(|id| {
            !id.is_empty() && id.len() <= 128 && id.chars().all(|c| c.is_ascii_alphanumeric())
        })
}

fn require_client_id() -> EngineResult<String> {
    client_id().ok_or_else(|| "GitHub sign-in is not configured in this build. The app owner must set BRANCHLINE_GITHUB_CLIENT_ID to their registered OAuth application's public client ID and enable Device Flow in GitHub settings.".into())
}

fn client() -> EngineResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("GitSomething/0.1")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize the GitHub connection.".into())
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn normalized_scopes(value: &str) -> Vec<String> {
    value
        .split(|c: char| c == ',' || c.is_ascii_whitespace())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect()
}

fn validate_scopes(scopes: &[String]) -> EngineResult<()> {
    let has = |scope| scopes.iter().any(|s| s == scope);
    if !has("repo")
        || !has("workflow")
        || !(has("read:user") || has("user"))
        || !(has("user:email") || has("user"))
    {
        return Err("GitHub did not grant the repository, workflow, profile, and email permissions needed by GitSomething. Connect again and approve the requested permissions.".into());
    }
    Ok(())
}

async fn store(credential: Credential) -> EngineResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = keyring::Entry::new(SERVICE, "github.com")
            .map_err(|_| "The operating system's secure credential store is unavailable.".to_string())?;
        let secret = Zeroizing::new(serde_json::to_string(&credential)
            .map_err(|_| "Could not prepare the GitHub credential for secure storage.".to_string())?);
        entry.set_password(&secret)
            .map_err(|_| "GitHub authorized access, but the operating system could not save it securely. Unlock your credential store and connect again; GitSomething has not saved a connection.".to_string())
    }).await.map_err(|_| "The secure credential worker stopped.".to_string())?
}

async fn load() -> EngineResult<Option<Credential>> {
    tauri::async_runtime::spawn_blocking(|| {
        let entry = keyring::Entry::new(SERVICE, "github.com")
            .map_err(|_| "The operating system's secure credential store is unavailable.".to_string())?;
        match entry.get_password() {
            Ok(secret) => {
                let secret = Zeroizing::new(secret);
                serde_json::from_str(&secret).map(Some)
                    .map_err(|_| "The saved GitHub connection could not be read. Disconnect and connect again.".to_string())
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Your secure credential store is locked or unavailable. Unlock it and restart GitSomething.".into()),
        }
    }).await.map_err(|_| "The secure credential worker stopped.".to_string())?
}

async fn delete() -> EngineResult<()> {
    tauri::async_runtime::spawn_blocking(|| {
        let entry = keyring::Entry::new(SERVICE, "github.com")
            .map_err(|_| "The operating system's secure credential store is unavailable.".to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("The secure credential store could not remove the saved connection. Unlock it and try disconnecting again.".into()),
        }
    }).await.map_err(|_| "The secure credential worker stopped.".to_string())?
}

async fn identity(token: &str) -> EngineResult<(GitHubAccount, Option<Vec<String>>)> {
    let client = client()?;
    let response = client
        .get("https://api.github.com/user")
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| {
            "Could not verify your GitHub account. Check your connection and try again.".to_string()
        })?;
    match response.status().as_u16() {
        401 => {
            return Err(
                "Your GitHub connection expired or was revoked. Connect to GitHub again.".into(),
            )
        }
        403 => {
            return Err(
                "GitHub denied account access. Check your organization restrictions or reconnect."
                    .into(),
            )
        }
        200 => (),
        _ => {
            return Err(
                "GitHub could not verify this connection. Wait a moment and try again.".into(),
            )
        }
    }
    let granted = response
        .headers()
        .get("x-oauth-scopes")
        .and_then(|s| s.to_str().ok())
        .map(normalized_scopes);
    if let Some(scopes) = &granted {
        validate_scopes(scopes)?;
    }
    let user: UserResponse = response.json().await.map_err(|_| {
        "GitHub returned an unexpected account response. Connect again.".to_string()
    })?;
    let emails = client
        .get("https://api.github.com/user/emails")
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await;
    let verified = if let Ok(response) = emails {
        if response.status().is_success() {
            response
                .json::<Vec<EmailResponse>>()
                .await
                .ok()
                .and_then(|emails| {
                    emails
                        .into_iter()
                        .find(|e| e.primary && e.verified)
                        .map(|e| e.email)
                })
        } else {
            None
        }
    } else {
        None
    };
    let email = verified
        .or(user.email)
        .unwrap_or_else(|| format!("{}+{}@users.noreply.github.com", user.id, user.login));
    Ok((
        GitHubAccount {
            login: user.login,
            name: user.name,
            email: Some(email),
            avatar_url: user.avatar_url,
        },
        granted,
    ))
}

async fn refresh(mut credential: Credential) -> EngineResult<Credential> {
    let refresh_token = credential
        .refresh_token
        .as_deref()
        .filter(|_| {
            credential
                .refresh_expires_at
                .is_none_or(|time| time > unix_now())
        })
        .ok_or("Your GitHub connection expired. Connect to GitHub again.")?;
    let mut response = request_refresh_token(
        "https://github.com/login/oauth/access_token",
        &credential.client_id,
        refresh_token,
    )
    .await?;
    if response.error.is_some()
        || !response
            .token_type
            .as_deref()
            .is_some_and(|t| t.eq_ignore_ascii_case("bearer"))
    {
        return Err(
            "Your GitHub connection expired or was revoked. Connect to GitHub again.".into(),
        );
    }
    let token = Zeroizing::new(
        response
            .access_token
            .take()
            .filter(|t| !t.is_empty())
            .ok_or("GitHub did not renew your connection. Connect again.")?,
    );
    let (account, scopes) = identity(&token).await?;
    credential.token.zeroize();
    credential.token = token.to_string();
    credential.refresh_token.zeroize();
    credential.refresh_token = response.refresh_token.take();
    credential.expires_at = response
        .expires_in
        .map(|time| unix_now().saturating_add(time));
    credential.refresh_expires_at = response
        .refresh_token_expires_in
        .map(|time| unix_now().saturating_add(time));
    credential.account = account;
    if let Some(scopes) = scopes.or_else(|| response.scope.as_deref().map(normalized_scopes)) {
        validate_scopes(&scopes)?;
        credential.scopes = scopes;
    }
    // GitHub rotates both secrets. Persistence must succeed before reporting connected.
    store(credential.clone()).await?;
    Ok(credential)
}

async fn restore_credential(credential: Credential) -> EngineResult<Credential> {
    if credential
        .expires_at
        .is_some_and(|time| time <= unix_now().saturating_add(60))
    {
        // refresh() validates the newly issued identity and persists rotated secrets.
        return refresh(credential).await;
    }
    let mut credential = credential;
    let (account, scopes) = identity(&credential.token).await?;
    credential.account = account;
    if let Some(scopes) = scopes {
        credential.scopes = scopes;
    }
    Ok(credential)
}

async fn request_refresh_token(
    endpoint: &str,
    client_id: &str,
    refresh_token: &str,
) -> EngineResult<TokenResponse> {
    let response = client()?
        .post(endpoint)
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(|_| {
            "Could not renew your GitHub connection. Check your connection and reconnect."
                .to_string()
        })?;
    if !response.status().is_success() {
        return Err("GitHub could not renew your connection. Connect to GitHub again.".into());
    }
    response
        .json()
        .await
        .map_err(|_| "GitHub returned an unexpected renewal response. Connect again.".into())
}

async fn request_device_token(
    endpoint: &str,
    client_id: &str,
    code: &str,
) -> EngineResult<TokenResponse> {
    let response = client()?.post(endpoint).header("Accept", "application/json")
        .form(&[("client_id", client_id), ("device_code", code), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code")])
        .send().await.map_err(|_| "GitHub sign-in could not be checked. Check your connection; you can keep waiting or retry.".to_string())?;
    if response.status().as_u16() == 429 {
        let mut response = TokenResponse::default();
        response.error = Some("slow_down".into());
        return Ok(response);
    }
    if !response.status().is_success() {
        return Err("GitHub sign-in could not be checked. Check your connection; you can keep waiting or retry.".into());
    }
    response
        .json()
        .await
        .map_err(|_| "GitHub returned an unexpected sign-in response. Cancel and reconnect.".into())
}

impl AuthState {
    /// A local commit may use saved account metadata even when the network is offline.
    /// This never authorizes an API or Git transport operation.
    pub async fn commit_identity(&self) -> Option<GitHubAccount> {
        let inner = self.0.lock().await;
        if let Some(credential) = &inner.credential {
            return Some(credential.account.clone());
        }
        // Startup may have read the credential successfully but failed to verify it
        // while offline. Saved account metadata remains useful for a local commit;
        // loading it here never grants access to the saved transport credential.
        if let Ok(Some(credential)) = load().await {
            if client_id().as_deref() == Some(&credential.client_id) {
                return Some(credential.account.clone());
            }
        }
        None
    }

    pub async fn status(&self) -> AuthStatus {
        let mut inner = self.0.lock().await;
        if !inner.restored {
            match load().await {
                Ok(Some(credential)) if client_id().as_deref() == Some(&credential.client_id) => {
                    match restore_credential(credential).await {
                        Ok(credential) => inner.credential = Some(credential),
                        Err(error) => inner.error = Some(error),
                    }
                }
                Ok(Some(_)) => inner.error = Some("Your saved GitHub connection expired or belongs to another app registration. Connect again.".into()),
                Ok(None) => (),
                Err(error) => inner.error = Some(error),
            }
            inner.restored = true;
        }
        if inner.credential.as_ref().is_some_and(|c| {
            c.expires_at
                .is_some_and(|t| t <= unix_now().saturating_add(60))
        }) {
            if let Some(credential) = inner.credential.take() {
                match refresh(credential).await {
                    Ok(credential) => inner.credential = Some(credential),
                    Err(error) => inner.error = Some(error),
                }
            }
        }
        AuthStatus {
            configured: client_id().is_some(),
            connected: inner.credential.is_some(),
            account: inner.credential.as_ref().map(|c| c.account.clone()),
            scopes: inner
                .credential
                .as_ref()
                .map_or_else(Vec::new, |c| c.scopes.clone()),
            error: inner.error.clone(),
        }
    }

    pub async fn credential(&self) -> EngineResult<(Zeroizing<String>, GitHubAccount)> {
        self.status().await;
        let inner = self.0.lock().await;
        inner
            .credential
            .as_ref()
            .map(|c| (Zeroizing::new(c.token.clone()), c.account.clone()))
            .ok_or_else(|| {
                inner.error.clone().unwrap_or_else(|| {
                    "Connect to GitHub before publishing or syncing a GitHub repository.".into()
                })
            })
    }

    pub async fn rejected(&self) {
        let mut inner = self.0.lock().await;
        inner.credential = None;
        inner.error = Some("GitHub rejected your connection. Connect to GitHub again.".into());
    }
}

#[tauri::command]
pub async fn github_auth_status(state: State<'_, AuthState>) -> EngineResult<AuthStatus> {
    Ok(state.status().await)
}

#[tauri::command]
pub async fn github_auth_start(state: State<'_, AuthState>) -> EngineResult<DeviceSession> {
    let client_id = require_client_id()?;
    let mut inner = state.0.lock().await;
    // One pending session per app. A double click cannot create two active grants.
    if inner
        .session
        .as_ref()
        .is_some_and(|s| s.expires_at > Instant::now())
    {
        return Err("GitHub sign-in is already waiting for approval. Finish it or cancel before starting again.".into());
    }
    inner.session = None;
    let response = client()?
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", SCOPES)])
        .send()
        .await
        .map_err(|_| {
            "Could not reach GitHub. Check your connection and retry sign-in.".to_string()
        })?;
    if !response.status().is_success() {
        return Err("GitHub could not start sign-in. The app owner should verify the OAuth client ID and enable Device Flow.".into());
    }
    let data: DeviceResponse = response.json().await
        .map_err(|_| "GitHub could not start device sign-in. The app owner should verify the client ID and enable Device Flow.".to_string())?;
    let code = Zeroizing::new(data.device_code);
    if data.verification_uri != VERIFY_URL
        || code.is_empty()
        || data.user_code.is_empty()
        || data.expires_in == 0
        || data.expires_in > 3600
        || data.interval > 300
    {
        return Err(
            "GitHub returned an unexpected sign-in response. No browser was opened.".into(),
        );
    }
    let interval = data.interval.max(5);
    let session_id = Uuid::new_v4().to_string();
    let now = Instant::now();
    inner.session = Some(Session {
        id: session_id.clone(),
        code,
        expires_at: now + Duration::from_secs(data.expires_in),
        next_poll: now + Duration::from_secs(interval),
        interval,
        in_flight: false,
    });
    inner.error = None;
    Ok(DeviceSession {
        session_id,
        user_code: data.user_code,
        verification_uri: VERIFY_URL.into(),
        expires_in: data.expires_in,
        interval,
    })
}

#[tauri::command]
pub async fn github_auth_open_browser(
    app: AppHandle,
    state: State<'_, AuthState>,
    session_id: String,
) -> EngineResult<()> {
    let inner = state.0.lock().await;
    if !inner
        .session
        .as_ref()
        .is_some_and(|s| s.id == session_id && s.expires_at > Instant::now())
    {
        return Err("This sign-in request expired or was cancelled. Start a new sign-in.".into());
    }
    app.opener().open_url(VERIFY_URL, None::<&str>)
        .map_err(|_| "Could not open your browser. Visit github.com/login/device and enter the code shown here.".into())
}

#[tauri::command]
pub async fn github_auth_poll(
    state: State<'_, AuthState>,
    session_id: String,
) -> EngineResult<PollResult> {
    let client_id = require_client_id()?;
    poll_device(
        state.inner(),
        &session_id,
        &client_id,
        "https://github.com/login/oauth/access_token",
    )
    .await
}

async fn poll_device(
    state: &AuthState,
    session_id: &str,
    client_id: &str,
    endpoint: &str,
) -> EngineResult<PollResult> {
    let code = {
        let mut inner = state.0.lock().await;
        let Some(session) = inner.session.as_mut().filter(|s| s.id == session_id) else {
            return Ok(PollResult::new("expired", None));
        };
        if let Some(result) = session.gate(Instant::now()) {
            if result.status == "expired" {
                inner.session = None;
            }
            return Ok(result);
        }
        session.in_flight = true;
        session.next_poll = Instant::now() + Duration::from_secs(session.interval);
        session.code.clone()
    };
    let response = request_device_token(endpoint, client_id, &code).await;
    let mut inner = state.0.lock().await;
    let Some(session) = inner.session.as_mut().filter(|s| s.id == session_id) else {
        return Ok(PollResult::new("expired", None));
    };
    if Instant::now() >= session.expires_at {
        inner.session = None;
        return Ok(PollResult::new("expired", None));
    }
    let mut response = match response {
        Ok(response) => response,
        Err(error) => {
            session.pending(false, None);
            return Err(error);
        }
    };
    if let Some(error) = &response.error {
        return match error.as_str() {
            "authorization_pending" => Ok(session.pending(false, None)),
            "slow_down" => Ok(session.pending(true, response.interval)),
            "expired_token" | "token_expired" => {
                inner.session = None;
                Ok(PollResult::new("expired", None))
            }
            "access_denied" => {
                inner.session = None;
                Ok(PollResult::new("denied", None))
            }
            _ => {
                inner.session = None;
                Err("GitHub rejected the sign-in request. The app owner should verify the OAuth client ID and enable Device Flow, then try again.".into())
            }
        };
    }
    let token = match response.access_token.take().filter(|t| !t.is_empty()) {
        Some(token) => Zeroizing::new(token),
        None => {
            inner.session = None;
            return Err("GitHub did not return a usable connection. Connect again.".into());
        }
    };
    if !response
        .token_type
        .as_deref()
        .is_some_and(|t| t.eq_ignore_ascii_case("bearer"))
    {
        inner.session = None;
        return Err("GitHub returned an unsupported sign-in response. Connect again.".into());
    }
    let scopes = normalized_scopes(response.scope.as_deref().unwrap_or_default());
    if let Err(error) = validate_scopes(&scopes) {
        inner.session = None;
        return Err(error);
    }
    // Release the lock while validating identity; cancellation wins before persistence.
    drop(inner);
    let verified = identity(&token).await;
    let mut inner = state.0.lock().await;
    if !inner
        .session
        .as_ref()
        .is_some_and(|s| s.id == session_id && s.expires_at > Instant::now())
    {
        return Ok(PollResult::new("expired", None));
    }
    inner.session = None;
    let (account, granted) = verified?;
    let credential = Credential {
        token: token.to_string(),
        refresh_token: response.refresh_token.take(),
        client_id: client_id.to_string(),
        account: account.clone(),
        scopes: granted.unwrap_or(scopes),
        expires_at: response
            .expires_in
            .map(|duration| unix_now().saturating_add(duration)),
        refresh_expires_at: response
            .refresh_token_expires_in
            .map(|duration| unix_now().saturating_add(duration)),
    };
    store(credential.clone()).await?;
    inner.credential = Some(credential);
    inner.restored = true;
    inner.error = None;
    Ok(PollResult {
        status: "connected",
        account: Some(account),
        retry_after: None,
    })
}

#[tauri::command]
pub async fn github_auth_cancel(
    state: State<'_, AuthState>,
    session_id: String,
) -> EngineResult<()> {
    let mut inner = state.0.lock().await;
    if inner.session.as_ref().is_some_and(|s| s.id == session_id) {
        inner.session = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn github_auth_disconnect(state: State<'_, AuthState>) -> EngineResult<()> {
    let mut inner = state.0.lock().await;
    inner.session = None;
    inner.credential = None;
    inner.restored = true;
    delete().await?;
    inner.error = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    fn oauth_server(
        body: &'static str,
        status: &'static str,
    ) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let count = stream.read(&mut buffer).unwrap();
                assert_ne!(count, 0);
                request.extend_from_slice(&buffer[..count]);
                if let Some(end) = request.windows(4).position(|value| value == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length:")
                                .map(|value| value.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            String::from_utf8(request).unwrap()
        });
        (format!("http://{address}/token"), server)
    }

    fn session() -> Session {
        let now = Instant::now();
        Session {
            id: "test".into(),
            code: Zeroizing::new("never-frontend".into()),
            expires_at: now + Duration::from_secs(900),
            next_poll: now + Duration::from_secs(5),
            interval: 5,
            in_flight: false,
        }
    }

    #[test]
    fn poll_gate_enforces_interval_concurrency_and_expiry() {
        let mut session = session();
        assert_eq!(session.gate(Instant::now()).unwrap().status, "pending");
        session.next_poll = Instant::now() - Duration::from_secs(1);
        assert!(session.gate(Instant::now()).is_none());
        session.in_flight = true;
        assert_eq!(session.gate(Instant::now()).unwrap().status, "pending");
        session.expires_at = Instant::now();
        assert_eq!(session.gate(Instant::now()).unwrap().status, "expired");
    }

    #[test]
    fn slowdown_increases_poll_interval_and_pending_keeps_it() {
        let mut session = session();
        assert_eq!(session.pending(true, Some(10)).retry_after, Some(10));
        assert_eq!(session.pending(true, Some(12)).retry_after, Some(15));
        assert_eq!(session.pending(false, None).retry_after, Some(15));
        assert!(session.next_poll > Instant::now() + Duration::from_secs(14));
    }

    #[test]
    fn scopes_require_full_repo_and_workflow_but_accept_normalized_user_scope() {
        assert!(
            validate_scopes(&normalized_scopes("repo, workflow, read:user, user:email")).is_ok()
        );
        assert!(validate_scopes(&normalized_scopes("repo workflow user")).is_ok());
        for scopes in [
            "public_repo workflow user",
            "repo user",
            "repo workflow read:user",
            "",
        ] {
            assert!(validate_scopes(&normalized_scopes(scopes)).is_err());
        }
    }

    #[test]
    fn ipc_responses_never_contain_credential_or_device_code() {
        let session = DeviceSession {
            session_id: "id".into(),
            user_code: "ABCD-EFGH".into(),
            verification_uri: VERIFY_URL.into(),
            expires_in: 900,
            interval: 5,
        };
        let json = serde_json::to_string(&session).unwrap();
        assert!(!json.contains("device_code"));
        assert!(!json.contains("access_token"));
        assert!(!json.contains("never-frontend"));
        let pending: TokenResponse =
            serde_json::from_str(r#"{"error":"authorization_pending"}"#).unwrap();
        assert_eq!(pending.error.as_deref(), Some("authorization_pending"));
        let denied: TokenResponse = serde_json::from_str(r#"{"error":"access_denied"}"#).unwrap();
        assert_eq!(denied.error.as_deref(), Some("access_denied"));
    }

    #[test]
    fn device_token_http_uses_public_client_form_and_classifies_provider_states() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        for (body, expected) in [
            (
                r#"{"error":"authorization_pending"}"#,
                "authorization_pending",
            ),
            (r#"{"error":"slow_down","interval":10}"#, "slow_down"),
            (r#"{"error":"expired_token"}"#, "expired_token"),
            (r#"{"error":"access_denied"}"#, "access_denied"),
        ] {
            let (endpoint, server) = oauth_server(body, "200 OK");
            let response = runtime
                .block_on(request_device_token(
                    &endpoint,
                    "owned-public-client",
                    "private-device-code",
                ))
                .unwrap();
            assert_eq!(response.error.as_deref(), Some(expected));
            let request = server.join().unwrap();
            assert!(request.contains("client_id=owned-public-client"));
            assert!(request.contains("device_code=private-device-code"));
            assert!(request
                .contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"));
            assert!(!request.contains("client_secret"));
            assert!(!request.to_lowercase().contains("authorization:"));
        }
        let (endpoint, server) = oauth_server(
            r#"{"message":"private-device-code must never enter errors"}"#,
            "500 Internal Server Error",
        );
        let error = runtime
            .block_on(request_device_token(
                &endpoint,
                "owned-public-client",
                "private-device-code",
            ))
            .err()
            .unwrap();
        server.join().unwrap();
        assert!(!error.contains("private-device-code"));
        let (endpoint, server) = oauth_server("{}", "429 Too Many Requests");
        let response = runtime
            .block_on(request_device_token(
                &endpoint,
                "owned-public-client",
                "private-device-code",
            ))
            .unwrap();
        server.join().unwrap();
        assert_eq!(response.error.as_deref(), Some("slow_down"));
    }

    #[test]
    fn refresh_request_uses_no_client_secret_and_parses_rotated_expiring_tokens() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let (endpoint, server) = oauth_server(
            r#"{"access_token":"rotated-access","refresh_token":"rotated-refresh","token_type":"bearer","scope":"repo workflow user","expires_in":28800,"refresh_token_expires_in":15897600}"#,
            "200 OK",
        );
        let response = runtime
            .block_on(request_refresh_token(
                &endpoint,
                "owned-public-client",
                "old-refresh",
            ))
            .unwrap();
        assert_eq!(response.access_token.as_deref(), Some("rotated-access"));
        assert_eq!(response.refresh_token.as_deref(), Some("rotated-refresh"));
        assert_eq!(response.expires_in, Some(28800));
        assert_eq!(response.refresh_token_expires_in, Some(15897600));
        let request = server.join().unwrap();
        assert!(request.contains("client_id=owned-public-client"));
        assert!(request.contains("grant_type=refresh_token"));
        assert!(request.contains("refresh_token=old-refresh"));
        assert!(!request.contains("client_secret"));
    }

    #[test]
    fn cancelled_in_flight_poll_cannot_restore_or_persist_a_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/token", listener.local_addr().unwrap());
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (resume_tx, resume_rx) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0; 4096];
            assert!(stream.read(&mut buffer).unwrap() > 0);
            started_tx.send(()).unwrap();
            resume_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            let body = r#"{"access_token":"must-never-persist","token_type":"bearer","scope":"repo workflow user"}"#;
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
        });
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let state = AuthState::default();
            let mut pending = session();
            pending.next_poll = Instant::now() - Duration::from_secs(1);
            state.0.lock().await.session = Some(pending);
            let worker_state = state.clone();
            let worker_endpoint = endpoint.clone();
            let worker = tokio::spawn(async move {
                poll_device(
                    &worker_state,
                    "test",
                    "owned-public-client",
                    &worker_endpoint,
                )
                .await
            });
            tokio::task::spawn_blocking(move || {
                started_rx.recv_timeout(Duration::from_secs(5)).unwrap()
            })
            .await
            .unwrap();
            assert_eq!(
                poll_device(&state, "test", "owned-public-client", &endpoint)
                    .await
                    .unwrap()
                    .status,
                "pending"
            );
            // Same mutation used by cancel/disconnect, before GitHub returns its token.
            state.0.lock().await.session = None;
            resume_tx.send(()).unwrap();
            assert_eq!(worker.await.unwrap().unwrap().status, "expired");
            assert!(state.0.lock().await.credential.is_none());
        });
        server.join().unwrap();
    }
}
