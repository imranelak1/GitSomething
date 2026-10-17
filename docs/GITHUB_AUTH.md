# GitHub sign-in

GitSomething uses GitHub's browser approval screen instead of asking users to create or paste a GitHub personal access token. The desktop app displays a one-time code, opens GitHub, and waits for the user to approve access. Git operations continue to run through libgit2; signing in does not run GitHub CLI or a shell command.

## For people using GitSomething

1. Open the desktop app. On Home, select **Sign in with GitHub** under **GitHub repositories**, or open the GitHub account control.
2. Copy the one-time code shown in GitSomething. On GitHub, enter that code and review the account and permissions before authorizing.
3. Return to GitSomething. Your connected GitHub account replaces the sign-in card, and Home loads your accessible repositories.
4. Browse those repositories or drop a local project folder onto the app to publish it. The final **Slide to create & push** creates local history, creates the GitHub repository, and pushes the first commit.

You can use an existing local Git repository without connecting GitHub. A **commit** saves a version on your computer. **Push** sends those saved versions to the remote repository. Editing, reviewing changes, and making local commits work offline; sign-in, publication, fetch, pull, and push need a connection.

GitHub access is optional for the first-use guide. Reopen it with **A little help** or the command palette's **Getting started** action. The browser preview demonstrates the interface and cannot connect a real account or publish a real folder. If the desktop app offers **Set up GitHub sign-in**, the application owner needs to complete the configuration below. People installing a configured build can sign in directly.

## Your repositories on Home

The **GitHub repositories** section loads private, public, and shared repositories that the connected account can access. When signed in, this section appears beneath Home's open/new actions; local recent folders remain a separate list. Each GitHub row shows its owner, visibility, description, language, and last update when available. Long lists scroll within the section. **Open on GitHub** opens the validated repository URL in the system browser; it does not clone or open a local workspace.

**Load more repositories** requests the next page. **Filter loaded repositories** searches the names, descriptions, and languages already loaded, so an empty filter result does not mean the repository is absent from GitHub. **Refresh** starts again from the newest page. A failed refresh retains the current account's loaded rows and offers a retry. Organization policies may restrict which repositories are returned. [GitHub documents the authenticated repository-list endpoint.](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)

Lists stay in memory and disappear when the account disconnects or changes. Late responses from an earlier sign-in cannot repopulate the current list. The Glass Box records the provider read and its result; filtering and browser navigation do not add interface noise.

## One-time setup for the app owner

GitSomething needs its own public OAuth **Client ID** before GitHub can identify the app on the consent screen. Do not reuse another application's Client ID, a GitHub CLI credential, or a personal access token. The Client ID identifies the application and can be included in native builds. This device flow does not use a client secret. [GitHub documents the device authorization flow and its required Client ID.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

1. Open [GitHub Developer settings](https://github.com/settings/developers), select **OAuth Apps**, then **New OAuth App** (or **Register a new application**).
2. Set **Application name** to `GitSomething` and **Homepage URL** to the public project website or repository URL, such as `https://github.com/imranelak1/GitSomething`.
3. Set **Authorization callback URL** to `http://127.0.0.1`. GitHub's registration form requires this field; this device flow does not start a callback listener or use that URL.
4. Enable **Device Flow**, register the application, then copy its **Client ID**. If GitHub issues expiring tokens, GitSomething handles the returned refresh credentials.
5. Return to GitSomething, open **Set up GitHub sign-in**, paste the public **Client ID** into **GitHub OAuth client ID**, and select **Save GitHub setup**. **Register GitSomething on GitHub** opens the registration page if you have not started yet. No client secret or personal access token is needed.
6. Select **Sign in with GitHub** and approve the device code in your browser. Saving the identifier alone does not authorize an account.

The public Client ID is saved in `github-oauth.json` inside Tauri's application configuration directory, outside this project. This owner setting takes precedence over environment/build configuration and survives native restarts. Setup can be changed only when GitHub is disconnected and no authorization is pending. Access and refresh credentials remain in the OS credential store.

For development or distributing a configured build, you can alternatively set `BRANCHLINE_GITHUB_CLIENT_ID` in the shell that starts or builds the native app:

```powershell
$env:BRANCHLINE_GITHUB_CLIENT_ID = 'YOUR_GITSOMETHING_OAUTH_CLIENT_ID'
npm run tauri dev
```

For a distributable build, set the same environment variable before `npm run tauri build`. The native build embeds the public identifier so people installing that build can sign in without configuring environment variables. The in-app owner setting can override it without rebuilding. `.env.example` lists the setting, but copying it to `.env` alone does not export an environment variable into Rust; use the shell setting above.

These registration fields follow [GitHub's OAuth app registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). Existing registrations can be updated in the same OAuth Apps settings page. [GitHub explains how to modify an OAuth app.](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/modifying-an-oauth-app)

## What access is requested

| Scope        | Why GitSomething requests it                                                            |
| ------------ | --------------------------------------------------------------------------------------- |
| `repo`       | Create, read, and update public and private repositories the signed-in user can access. |
| `workflow`   | Push changes to GitHub Actions workflow files.                                          |
| `read:user`  | Identify the signed-in account and read profile details.                                |
| `user:email` | Read email addresses so commits can use the user's identity.                            |

This is broad repository access, subject to the user's existing permissions. It does not grant GitSomething unrestricted control over the GitHub account, repository deletion, billing, or organization administration. Organization policies and SSO requirements can still prevent access to particular repositories. Review the consent screen for the actual granted access. [GitHub defines these OAuth scopes and their limits.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

## Storage and disconnecting

GitHub's access token is received and used by Rust and saved in the operating system's credential store. React receives account details and authorization progress, never the access token. Tokens do not belong in frontend storage, remote URLs, the Glass-Box console, or a project configuration file. A keychain failure is a sign-in error, not a reason to silently fall back to plaintext storage.

When GitHub issues expiring access tokens, Rust stores the refresh token in the same credential store and renews access before it expires. Rotated credentials are saved before the connection is reported as ready. If authorization or the refresh token is revoked or expires, connect again. [GitHub documents expiring tokens and refresh requests for device authorization.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

**Disconnect** removes GitSomething's saved credential from this computer. To revoke the OAuth app's authorization at GitHub as well, use [GitHub's authorized OAuth applications](https://github.com/settings/applications). Revoking access there affects the application's authorization independently of local storage. [GitHub describes reviewing and revoking authorized OAuth apps.](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps)

GitLab still uses a token entered for the individual publish operation; the GitHub sign-in change does not add GitLab OAuth or self-hosted provider support.

## Verification boundary

Automated browser checks can exercise the consent UI through mocked native responses. Rust tests can check polling, scope validation, redaction, and credential destination rules without approving an account. Neither proves an actual GitHub authorization, OS credential-store round trip, or network push.

The final manual check requires the owner's registered OAuth Client ID and a real desktop session. Complete the in-app owner setup, approve GitHub consent, verify that Home lists your accessible repositories, load another page, and open one in the system browser. Restart to confirm that setup and the account connection persist; disconnect and confirm the private list disappears. Denial, an expired one-time code, and revoked authorization also need real-account checks. Publishing and pushing require an explicitly selected disposable project; do not create a repository or approve consent on someone's behalf as an automated test.
