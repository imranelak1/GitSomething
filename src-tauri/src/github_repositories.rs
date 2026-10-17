//! Read-only GitHub discovery. OAuth credentials stay in native memory and never
//! appear in the renderer's request, response, repository URLs, or error text.
use crate::{git_engine::EngineResult, github_auth::AuthState};
use reqwest::{header::HeaderMap, Client, Response, StatusCode, Url};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

const REPOSITORIES_ENDPOINT: &str = "https://api.github.com/user/repos";
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RepositoryListRequest {
    #[serde(default = "first_page")]
    page: u32,
    #[serde(default = "default_page_size")]
    per_page: u32,
}

fn first_page() -> u32 {
    1
}

fn default_page_size() -> u32 {
    50
}

impl RepositoryListRequest {
    fn normalized(self) -> Self {
        Self {
            page: self.page.max(1),
            per_page: self.per_page.clamp(1, 100),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepository {
    id: u64,
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    archived: bool,
    fork: bool,
    default_branch: Option<String>,
    html_url: String,
    clone_url: String,
    updated_at: String,
    language: Option<String>,
    owner_login: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryList {
    repositories: Vec<GitHubRepository>,
    next_page: Option<u32>,
    account_login: String,
}

#[derive(Deserialize)]
struct ProviderOwner {
    login: String,
}

#[derive(Deserialize)]
struct ProviderRepository {
    id: u64,
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    archived: bool,
    fork: bool,
    default_branch: Option<String>,
    html_url: String,
    clone_url: String,
    updated_at: String,
    language: Option<String>,
    owner: ProviderOwner,
}

#[derive(Debug)]
struct RequestError {
    message: String,
    unauthorized: bool,
}

impl RequestError {
    fn new(message: &str) -> Self {
        Self {
            message: message.into(),
            unauthorized: false,
        }
    }
}

fn client() -> EngineResult<Client> {
    Client::builder()
        .user_agent("GitSomething/0.1")
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize the GitHub connection.".into())
}

fn valid_owner(owner: &str) -> bool {
    !owner.is_empty()
        && owner.len() <= 100
        && owner
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 100
        && name != "."
        && name != ".."
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
}

/// Browser links and clone URLs are both constrained to GitHub. No provider
/// response can hand the renderer a credential-bearing or executable URL.
fn repository_url(value: &str, clone: bool) -> EngineResult<Url> {
    let invalid = || "GitHub returned an unexpected repository URL.".to_string();
    let url = Url::parse(value).map_err(|_| invalid())?;
    if value != value.trim()
        || url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(invalid());
    }
    let segments: Vec<_> = url.path().trim_start_matches('/').split('/').collect();
    if segments.len() != 2
        || !valid_owner(segments[0])
        || !(if clone {
            segments[1].strip_suffix(".git").is_some_and(valid_name)
        } else {
            valid_name(segments[1])
        })
    {
        return Err(invalid());
    }
    Ok(url)
}

impl TryFrom<ProviderRepository> for GitHubRepository {
    type Error = RequestError;

    fn try_from(repo: ProviderRepository) -> Result<Self, Self::Error> {
        let invalid = || {
            RequestError::new(
                "GitHub returned unexpected repository details. Refresh to try again.",
            )
        };
        if !valid_owner(&repo.owner.login)
            || !valid_name(&repo.name)
            || repo.full_name != format!("{}/{}", repo.owner.login, repo.name)
        {
            return Err(invalid());
        }
        let html = repository_url(&repo.html_url, false).map_err(|_| invalid())?;
        let clone = repository_url(&repo.clone_url, true).map_err(|_| invalid())?;
        if html.path() != format!("/{}", repo.full_name)
            || clone.path() != format!("/{}.git", repo.full_name)
        {
            return Err(invalid());
        }
        Ok(Self {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            private: repo.private,
            archived: repo.archived,
            fork: repo.fork,
            default_branch: repo.default_branch,
            html_url: html.into(),
            clone_url: clone.into(),
            updated_at: repo.updated_at,
            language: repo.language,
            owner_login: repo.owner.login,
        })
    }
}

fn response_error(status: StatusCode, headers: &HeaderMap) -> RequestError {
    let mut error = RequestError::new(match status.as_u16() {
        401 => "Your GitHub connection expired or was revoked. Reconnect to GitHub to load your repositories.",
        403 if headers.get("x-ratelimit-remaining").is_some_and(|value| value == "0")
            || headers.contains_key("retry-after") =>
            "GitHub's request limit was reached. Wait a few minutes, then refresh your repositories.",
        403 if headers.contains_key("x-github-sso") =>
            "Your organization requires SSO approval. Authorize GitSomething in your organization's GitHub settings, then refresh your repositories.",
        403 => "GitHub denied access to your repositories. Reconnect and approve repository access; an organization may also require SSO or app approval.",
        429 => "GitHub's request limit was reached. Wait a few minutes, then refresh your repositories.",
        300..=399 => "GitHub returned an unexpected redirect. No credentials were forwarded. Refresh to try again.",
        500..=599 => "GitHub is temporarily unavailable. Try refreshing your repositories shortly.",
        _ => "GitHub could not load your repositories. Check your connection and try again.",
    });
    error.unauthorized = status == StatusCode::UNAUTHORIZED;
    // Provider bodies and header values are deliberately excluded from all errors.
    error
}

/// Read the relation only; never fetch or return the provider's Link URL. Even
/// a valid next relation is converted into the next locally constructed page.
fn next_page(headers: &HeaderMap, request: RepositoryListRequest) -> Option<u32> {
    let next = request.page.checked_add(1)?;
    for header in headers.get_all("link") {
        for part in header.to_str().ok()?.split(',') {
            let mut attributes = part.trim().split(';');
            let target = attributes
                .next()?
                .trim()
                .strip_prefix('<')?
                .strip_suffix('>')?;
            let is_next = attributes.any(|attribute| {
                attribute.trim().strip_prefix("rel=").is_some_and(|value| {
                    value
                        .trim_matches('"')
                        .split_ascii_whitespace()
                        .any(|rel| rel == "next")
                })
            });
            if !is_next {
                continue;
            }
            let url = Url::parse(target).ok()?;
            if url.scheme() == "https"
                && url.host_str() == Some("api.github.com")
                && url.port().is_none()
                && url.username().is_empty()
                && url.password().is_none()
                && url.path() == "/user/repos"
                && url.fragment().is_none()
                && url
                    .query_pairs()
                    .any(|(key, value)| key == "page" && value.parse::<u32>().ok() == Some(next))
            {
                return Some(next);
            }
        }
    }
    None
}

async fn bounded_body(mut response: Response) -> Result<Vec<u8>, RequestError> {
    let too_large = || {
        RequestError::new("GitHub returned too much repository data. Try refreshing with fewer repositories per page.")
    };
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(too_large());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        RequestError::new(
            "The GitHub connection was interrupted. Refresh your repositories to try again.",
        )
    })? {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err(too_large());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

// Only tests inject a loopback endpoint. The IPC command below always uses the
// fixed GitHub endpoint and a credential acquired from AuthState.
async fn request_repositories(
    client: &Client,
    endpoint: &str,
    token: &str,
    account_login: String,
    request: RepositoryListRequest,
) -> Result<RepositoryList, RequestError> {
    let request = request.normalized();
    let response = client
        .get(endpoint)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .query(&[
            ("visibility", "all".to_string()),
            (
                "affiliation",
                "owner,collaborator,organization_member".to_string(),
            ),
            ("sort", "updated".to_string()),
            ("direction", "desc".to_string()),
            ("per_page", request.per_page.to_string()),
            ("page", request.page.to_string()),
        ])
        .send()
        .await
        .map_err(|_| {
            RequestError::new(
                "Could not reach GitHub. Check your connection, then refresh your repositories.",
            )
        })?;
    if response.status() != StatusCode::OK {
        return Err(response_error(response.status(), response.headers()));
    }
    let next_page = next_page(response.headers(), request);
    let body = bounded_body(response).await?;
    let repositories: Vec<ProviderRepository> = serde_json::from_slice(&body).map_err(|_| {
        RequestError::new("GitHub returned unexpected repository data. Refresh to try again.")
    })?;
    if repositories.len() > request.per_page as usize {
        return Err(RequestError::new(
            "GitHub returned an unexpected repository page. Refresh to try again.",
        ));
    }
    Ok(RepositoryList {
        repositories: repositories
            .into_iter()
            .map(TryInto::try_into)
            .collect::<Result<_, _>>()?,
        next_page,
        account_login,
    })
}

#[tauri::command]
pub async fn list_github_repositories(
    auth: State<'_, AuthState>,
    request: RepositoryListRequest,
) -> EngineResult<RepositoryList> {
    let (token, account) = auth.credential().await?;
    let result = request_repositories(
        &client()?,
        REPOSITORIES_ENDPOINT,
        &token,
        account.login,
        request,
    )
    .await;
    // A response that started before disconnect/account change must never restore
    // the previous account's private repository data in the current session.
    if !auth.is_current_credential(&token).await {
        return Err(
            "Your GitHub connection changed. Refresh to load the current account's repositories."
                .into(),
        );
    }
    match result {
        Ok(repositories) => Ok(repositories),
        Err(error) => {
            if error.unauthorized {
                auth.reject_credential(&token).await;
            }
            Err(error.message)
        }
    }
}

#[tauri::command]
pub fn open_github_repository(app: AppHandle, url: String) -> EngineResult<()> {
    let url = repository_url(&url, false)
        .map_err(|_| "Only a GitHub repository's HTTPS page can be opened.".to_string())?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "Could not open the GitHub repository in your browser.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    fn repository(owner: &str, name: &str, private: bool) -> serde_json::Value {
        serde_json::json!({
            "id": 42, "name": name, "full_name": format!("{owner}/{name}"),
            "description": "A real repository", "private": private, "archived": false,
            "fork": false, "default_branch": "main", "html_url": format!("https://github.com/{owner}/{name}"),
            "clone_url": format!("https://github.com/{owner}/{name}.git"), "updated_at": "2026-10-17T10:00:00Z",
            "language": "Rust", "owner": {"login": owner}, "temp_clone_token": "never-forward-provider-secret"
        })
    }

    fn server(
        body: String,
        status: &'static str,
        headers: &'static str,
    ) -> (String, std::thread::JoinHandle<String>) {
        let length = body.len();
        server_with_length(body, status, headers, length)
    }

    fn server_with_length(
        body: String,
        status: &'static str,
        headers: &'static str,
        length: usize,
    ) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0; 4096];
            while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
                let size = stream.read(&mut buffer).unwrap();
                assert_ne!(size, 0);
                request.extend_from_slice(&buffer[..size]);
            }
            write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {length}\r\n{headers}Connection: close\r\n\r\n{body}").unwrap();
            String::from_utf8(request).unwrap()
        });
        (format!("http://{address}/user/repos"), worker)
    }

    fn request(page: u32, per_page: u32) -> RepositoryListRequest {
        RepositoryListRequest { page, per_page }
    }

    #[test]
    fn authenticated_pages_include_private_collaborator_and_organization_repositories() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        for (page, owner, name, private, headers, expected_next) in [
            (
                1,
                "octocat",
                "private-project",
                true,
                "Link: <https://api.github.com/user/repos?page=2&per_page=1>; rel=\"next\"\r\n",
                Some(2),
            ),
            (2, "team-org", "shared-project", false, "", None),
        ] {
            let (endpoint, worker) = server(
                serde_json::json!([repository(owner, name, private)]).to_string(),
                "200 OK",
                headers,
            );
            let result = runtime
                .block_on(request_repositories(
                    &client().unwrap(),
                    &endpoint,
                    "native-oauth-secret",
                    "octocat".into(),
                    request(page, 1),
                ))
                .unwrap();
            let http = worker.join().unwrap();
            assert!(http.starts_with("GET /user/repos?"));
            for parameter in [
                "visibility=all",
                "affiliation=owner%2Ccollaborator%2Corganization_member",
                "sort=updated",
                "direction=desc",
                "per_page=1",
            ] {
                assert!(http.contains(parameter), "Missing {parameter}");
            }
            assert!(http.contains(&format!("page={page}")));
            assert!(http
                .to_ascii_lowercase()
                .contains("authorization: bearer native-oauth-secret"));
            assert!(http
                .to_ascii_lowercase()
                .contains("x-github-api-version: 2022-11-28"));
            assert!(!http.contains("type="));
            assert_eq!(result.account_login, "octocat");
            assert_eq!(result.next_page, expected_next);
            assert_eq!(result.repositories[0].owner_login, owner);
            assert_eq!(result.repositories[0].private, private);
            let serialized = serde_json::to_string(&result).unwrap();
            assert!(serialized.contains("\"ownerLogin\""));
            assert!(serialized.contains("\"accountLogin\":\"octocat\""));
            for secret in [
                "native-oauth-secret",
                "temp_clone_token",
                "never-forward-provider-secret",
                "Authorization",
            ] {
                assert!(!serialized.contains(secret));
            }
        }
    }

    #[test]
    fn pagination_is_bounded_and_never_follows_untrusted_link_targets() {
        assert_eq!(request(0, 0).normalized().page, 1);
        assert_eq!(request(0, 0).normalized().per_page, 1);
        assert_eq!(request(1, u32::MAX).normalized().per_page, 100);
        assert!(
            serde_json::from_str::<RepositoryListRequest>(r#"{"token":"renderer-token"}"#).is_err()
        );
        for target in [
            "https://attacker.example/user/repos?page=2",
            "https://api.github.com.attacker.example/user/repos?page=2",
            "https://secret@api.github.com/user/repos?page=2",
            "http://api.github.com/user/repos?page=2",
            "https://api.github.com/users/other/repos?page=2",
            "https://api.github.com/user/repos?page=99",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert("link", format!("<{target}>; rel=\"next\"").parse().unwrap());
            assert_eq!(next_page(&headers, request(1, 50)), None, "{target}");
        }
        let mut headers = HeaderMap::new();
        headers.insert("link", "<https://api.github.com/user/repos?page=2>; rel=\"next\", <https://api.github.com/user/repos?page=8>; rel=\"last\"".parse().unwrap());
        assert_eq!(next_page(&headers, request(1, 50)), Some(2));
        assert_eq!(next_page(&headers, request(u32::MAX, 50)), None);
    }

    #[test]
    fn api_errors_explain_reconnect_rate_limit_and_sso_without_provider_data() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        for (status, headers, expected, unauthorized) in [
            ("401 Unauthorized", "", "Reconnect", true),
            (
                "403 Forbidden",
                "X-RateLimit-Remaining: 0\r\n",
                "request limit",
                false,
            ),
            (
                "403 Forbidden",
                "X-GitHub-SSO: required; url=https://github.com/org/sso?secret=private-header\r\n",
                "SSO approval",
                false,
            ),
            ("403 Forbidden", "", "approve repository access", false),
            (
                "429 Too Many Requests",
                "Retry-After: 60\r\n",
                "request limit",
                false,
            ),
            (
                "503 Service Unavailable",
                "",
                "temporarily unavailable",
                false,
            ),
            (
                "302 Found",
                "Location: https://attacker.example/secret\r\n",
                "No credentials were forwarded",
                false,
            ),
        ] {
            let (endpoint, worker) = server(
                r#"{"message":"native-oauth-secret private-provider-body"}"#.into(),
                status,
                headers,
            );
            let error = runtime
                .block_on(request_repositories(
                    &client().unwrap(),
                    &endpoint,
                    "native-oauth-secret",
                    "octocat".into(),
                    request(1, 50),
                ))
                .unwrap_err();
            worker.join().unwrap();
            assert!(error.message.contains(expected), "{}", error.message);
            assert_eq!(error.unauthorized, unauthorized);
            for secret in [
                "native-oauth-secret",
                "private-provider-body",
                "private-header",
                "attacker.example",
            ] {
                assert!(!error.message.contains(secret));
            }
        }
    }

    #[test]
    fn invalid_json_and_unsafe_repository_urls_are_rejected_without_echoing_details() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        for body in [
            "{native-oauth-secret".to_string(),
            serde_json::json!({"access_token": "native-oauth-secret"}).to_string(),
        ] {
            let (endpoint, worker) = server(body, "200 OK", "");
            let error = runtime
                .block_on(request_repositories(
                    &client().unwrap(),
                    &endpoint,
                    "native-oauth-secret",
                    "octocat".into(),
                    request(1, 50),
                ))
                .unwrap_err();
            worker.join().unwrap();
            assert!(!error.message.contains("native-oauth-secret"));
        }
        for url in [
            "https://attacker.example/octocat/project",
            "https://github.com.attacker.example/octocat/project",
            "http://github.com/octocat/project",
            "https://secret@github.com/octocat/project",
            "https://github.com:444/octocat/project",
            "https://github.com/octocat/project?token=secret",
            "https://github.com/octocat/project#secret",
            "https://github.com/octocat/project/issues",
            "https://github.com/octocat",
            "javascript:alert(1)",
        ] {
            assert!(repository_url(url, false).is_err(), "Accepted {url}");
        }
        let mut raw = repository("octocat", "project", true);
        raw["clone_url"] = "https://attacker.example/octocat/project.git".into();
        assert!(GitHubRepository::try_from(
            serde_json::from_value::<ProviderRepository>(raw).unwrap()
        )
        .is_err());
        assert!(repository_url("https://github.com/octocat/project", false).is_ok());
        let longest_name = "a".repeat(100);
        assert!(GitHubRepository::try_from(
            serde_json::from_value::<ProviderRepository>(repository(
                "octocat",
                &longest_name,
                true
            ))
            .unwrap()
        )
        .is_ok());
    }

    #[test]
    fn empty_accounts_remain_empty_and_excess_page_records_are_rejected() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let (endpoint, worker) = server("[]".into(), "200 OK", "");
        let result = runtime
            .block_on(request_repositories(
                &client().unwrap(),
                &endpoint,
                "native-oauth-secret",
                "empty-account".into(),
                request(1, 50),
            ))
            .unwrap();
        worker.join().unwrap();
        assert_eq!(result.account_login, "empty-account");
        assert!(result.repositories.is_empty());
        assert_eq!(result.next_page, None);
        let (endpoint, worker) = server(
            serde_json::json!([
                repository("octocat", "one", false),
                repository("octocat", "two", true)
            ])
            .to_string(),
            "200 OK",
            "",
        );
        let error = runtime
            .block_on(request_repositories(
                &client().unwrap(),
                &endpoint,
                "native-oauth-secret",
                "octocat".into(),
                request(1, 1),
            ))
            .unwrap_err();
        worker.join().unwrap();
        assert!(error.message.contains("unexpected repository page"));
    }

    #[test]
    fn oversized_and_interrupted_responses_are_bounded_without_exposing_credentials() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        for (body, reported_length, expected) in [
            ("", MAX_RESPONSE_BYTES + 1, "too much repository data"),
            ("[", 100, "connection was interrupted"),
        ] {
            let (endpoint, worker) = server_with_length(body.into(), "200 OK", "", reported_length);
            let error = runtime
                .block_on(request_repositories(
                    &client().unwrap(),
                    &endpoint,
                    "native-oauth-secret",
                    "octocat".into(),
                    request(1, 50),
                ))
                .unwrap_err();
            worker.join().unwrap();
            assert!(error.message.contains(expected), "{}", error.message);
            assert!(!error.message.contains("native-oauth-secret"));
            assert!(!error.message.contains(&endpoint));
        }
    }
}
