# GitHub sign-in

Branchline uses GitHub's browser approval screen instead of asking users to create or paste a GitHub personal access token. The desktop app displays a one-time code, opens GitHub, and waits for the user to approve access. Git operations continue to run through libgit2; signing in does not run GitHub CLI or a shell command.

## For people using Branchline

1. Open the desktop app and select **Connect GitHub**.
2. Copy the one-time code shown in Branchline. On GitHub, enter that code and review the account and permissions before authorizing.
3. Return to Branchline. Your connected GitHub account replaces the sign-in card.
4. Drop a project folder onto the app, choose its repository name and visibility, and publish. Branchline creates the local history, creates the GitHub repository, and pushes the first commit.

You can use an existing local Git repository without connecting GitHub. A **commit** saves a version on your computer. **Push** sends those saved versions to the remote repository. Editing, reviewing changes, and making local commits work offline; sign-in, publication, fetch, pull, and push need a connection.

GitHub access is optional for the first-use guide. Reopen it with **A little help** or the command palette's **Getting started** action. The browser preview demonstrates the interface and cannot connect a real account or publish a real folder. If the desktop app says GitHub sign-in is unavailable in this build, the application owner needs to complete the configuration below. App users do not need to register an OAuth app.

## One-time setup for the app owner

Branchline needs its own public OAuth **Client ID** before GitHub can identify the app on the consent screen. Do not reuse another application's Client ID, a GitHub CLI credential, or a personal access token. The Client ID identifies the application and can be included in native builds. This device flow does not use a client secret. [GitHub documents the device authorization flow and its required Client ID.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

1. Open [GitHub Developer settings](https://github.com/settings/developers), select **OAuth Apps**, then **New OAuth App** (or **Register a new application**).
2. Set **Application name** to `Branchline` and **Homepage URL** to the public project website or repository URL, such as `https://github.com/imranelak1/branchline`.
3. Set **Authorization callback URL** to `http://127.0.0.1`. GitHub's registration form requires this field; this device flow does not start a callback listener or use that URL.
4. Enable **Device Flow**. Keep **Expire user access tokens** enabled; Branchline handles the refresh credentials issued by this flow. Register the application, then copy its **Client ID**.
5. Set `BRANCHLINE_GITHUB_CLIENT_ID` in the shell that starts the native app:

```powershell
$env:BRANCHLINE_GITHUB_CLIENT_ID = 'YOUR_BRANCHLINE_OAUTH_CLIENT_ID'
npm run tauri dev
```

For a distributable build, set the same environment variable before `npm run tauri build`. The native build embeds the public identifier so people installing that build can sign in without configuring environment variables. Changing it requires a native rebuild. `.env.example` lists the setting, but copying it to `.env` alone does not export an environment variable into Rust; use the shell setting above.

These registration fields follow [GitHub's OAuth app registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). Existing registrations can be updated in the same OAuth Apps settings page. [GitHub explains how to modify an OAuth app.](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/modifying-an-oauth-app)

## What access is requested

| Scope        | Why Branchline requests it                                                              |
| ------------ | --------------------------------------------------------------------------------------- |
| `repo`       | Create, read, and update public and private repositories the signed-in user can access. |
| `workflow`   | Push changes to GitHub Actions workflow files.                                          |
| `read:user`  | Identify the signed-in account and read profile details.                                |
| `user:email` | Read email addresses so commits can use the user's identity.                            |

This is broad repository access, subject to the user's existing permissions. It does not grant Branchline unrestricted control over the GitHub account, repository deletion, billing, or organization administration. Organization policies and SSO requirements can still prevent access to particular repositories. Review the consent screen for the actual granted access. [GitHub defines these OAuth scopes and their limits.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

## Storage and disconnecting

GitHub's access token is received and used by Rust and saved in the operating system's credential store. React receives account details and authorization progress, never the access token. Tokens do not belong in frontend storage, remote URLs, the Glass-Box console, or a project configuration file. A keychain failure is a sign-in error, not a reason to silently fall back to plaintext storage.

When GitHub issues expiring access tokens, Rust stores the refresh token in the same credential store and renews access before it expires. Rotated credentials are saved before the connection is reported as ready. If authorization or the refresh token is revoked or expires, connect again. [GitHub documents expiring tokens and refresh requests for device authorization.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

**Disconnect** removes Branchline's saved credential from this computer. To revoke the OAuth app's authorization at GitHub as well, use [GitHub's authorized OAuth applications](https://github.com/settings/applications). Revoking access there affects the application's authorization independently of local storage. [GitHub describes reviewing and revoking authorized OAuth apps.](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps)

GitLab still uses a token entered for the individual publish operation; the GitHub sign-in change does not add GitLab OAuth or self-hosted provider support.

## Verification boundary

Automated browser checks can exercise the consent UI through mocked native responses. Rust tests can check polling, scope validation, redaction, and credential destination rules without approving an account. Neither proves an actual GitHub authorization, OS credential-store round trip, or network push.

The final manual check requires the owner's registered OAuth Client ID, a real desktop session, and an explicitly selected disposable project. Approve GitHub consent, restart the app to confirm the account connection persists, publish a private test repository, edit and commit a file, then push again. Also verify denial, an expired one-time code, disconnect, and a revoked authorization. Do not create a repository or approve consent on someone's behalf as an automated test.
