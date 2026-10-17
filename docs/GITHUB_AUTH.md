# GitHub sign-in

GitSomething uses GitHub's browser approval screen instead of asking users to create or paste a GitHub personal access token. The desktop app displays a one-time code, opens GitHub, and waits for the user to approve access. Git operations continue to run through libgit2; signing in does not run GitHub CLI or a shell command.

## For people using GitSomething

1. Open the desktop app. On Home, select **Sign in with GitHub** under **GitHub repositories**, or open the GitHub account control.
2. Copy the one-time code shown in GitSomething. On GitHub, enter that code and review the account and permissions before authorizing.
3. Return to GitSomething. The sign-in dialog closes automatically, and Home loads your accessible repositories.
4. Select **Clone & open** to download a repository into a local workspace, or drop a local project folder onto the app to publish it. The final **Slide to create & push** creates local history, creates the GitHub repository, and pushes the first commit.

You can use an existing local Git repository without connecting GitHub. A **commit** saves a version on your computer. **Push** sends those saved versions to the remote repository. Editing, reviewing changes, and making local commits work offline; sign-in, publication, fetch, pull, and push need a connection.

GitHub access is optional for the first-use guide. Reopen it with **A little help** or the command palette's **Getting started** action. The browser preview demonstrates the interface and cannot connect a real account or publish a real folder. People installing GitSomething only sign in and approve access; app registration and build configuration belong to the maintainer.

## Your repositories on Home

The **GitHub repositories** section loads private, public, and shared repositories that the connected account can access. When signed in, this section appears beneath Home's open/new actions; local recent folders remain a separate list. Each GitHub row shows its owner, visibility, description, language, and last update when available. Long lists scroll within the section. **Clone & open** downloads a local working copy in the desktop app. The separate **GitHub** link opens the validated repository URL in the system browser.

The first request loads up to 100 repositories. **All**, **Public**, and **Private** narrow the loaded list, with counts for each visibility. **Filter loaded repositories** searches loaded names, descriptions, and languages; clear the search to return to the selected visibility. Sorting orders the loaded rows by last update or name. These controls act on repositories already loaded, so an empty result does not mean the repository is absent from GitHub.

**Load more repositories** requests the next page when available. **Refresh** starts again from the newest page. A failed refresh retains the current account's loaded rows and offers a retry. Organization policies may restrict which repositories are returned. [GitHub documents the authenticated repository-list endpoint.](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)

Lists stay in memory and disappear when the account disconnects or changes. Late responses from an earlier sign-in cannot repopulate the current list. The Glass Box records the provider read and its result; filtering and browser navigation do not add interface noise.

## Clone a GitHub repository

**Requires GitSomething 1.0.0-beta.2 or newer.** The published beta.1 release only opens GitHub browser links; its existing release assets are unchanged. Beta.2 is currently a prepared release candidate, not a published update.

1. Sign in on Home and find the repository under **GitHub repositories**.
2. Select its **Clone & open** button.
3. In the native folder picker, choose an existing **parent folder**. GitSomething creates a new child folder with the repository's name; selecting `C:\Projects` for `owner/my-app` saves the working copy in `C:\Projects\my-app`.
4. After cloning, GitSomething opens the real local workspace and adds it to **Recents**. The Glass Box records the equivalent `git clone` command, object transfer, checkout progress, and result. Rust and libgit2 perform the operation using the existing GitHub connection; no terminal command or pasted token is required.

Cancelling the folder picker does not start cloning or write Git data. An existing destination is never overwritten, even if its folder is empty. If the repository is already downloaded, use **Open repository** to select its local folder, or choose it from **Recents** after it has been opened before. To make a separate copy when a folder with the same name already exists, select another parent folder.

If a clone fails after creating its folder, completed files remain there. GitSomething does not automatically delete partial clones or resume into an existing folder. Inspect the preserved folder; use **Open repository** if it contains a usable checkout, or choose another parent folder to retry. A connection change or a working-view error can also leave a saved checkout that must be opened manually.

This flow supports GitHub.com HTTPS repositories through the connected native account. Submodules are not initialized, Git LFS objects are not downloaded, and external Git filters are not run; LFS-tracked files may remain pointer files. Use an appropriate Git tool for those additional steps. Browser previews cannot clone repositories. The original beta.1 rows only opened browser links; native **Clone & open** is added in the beta.2 release candidate.

## Maintainer configuration before distribution

Register GitSomething once as its own OAuth app and embed its public **Client ID** in the native build. This is a release responsibility. People using the app never register an OAuth app, configure environment variables, or enter a Client ID. The device flow requires no client secret. Do not reuse another application's identifier, a GitHub CLI credential, or a personal access token. [GitHub documents the required device-flow configuration.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

1. Open [GitHub Developer settings](https://github.com/settings/developers), select **OAuth Apps**, then **New OAuth App**.
2. Set **Application name** to `GitSomething` and **Homepage URL** to the public project website or repository URL, such as `https://github.com/imranelak1/GitSomething`.
3. Set **Authorization callback URL** to `http://127.0.0.1`. Registration requires this field; GitSomething's device flow does not use a callback listener.
4. Enable **Device Flow** in the registered application's settings and copy the public **Client ID**.
5. Set the public identifier in the repository root's ignored `.env.local`:

```dotenv
GITSOMETHING_GITHUB_CLIENT_ID=YOUR_GITSOMETHING_OAUTH_CLIENT_ID
```

Then start or build the desktop app:

```powershell
npm run tauri dev
# Or create a distributable native build:
npm run tauri build
```

The Rust build script reads only the named public Client ID from `.env.local`; it does not embed arbitrary environment values or secrets. CI can set `GITSOMETHING_GITHUB_CLIENT_ID` in its build environment instead. A release build refuses to complete without a valid identifier, preventing distribution of an app whose sign-in needs user setup. Keep `.env.local` out of version control, and never put an OAuth client secret or access token in this setting. The Client ID itself is public application metadata and is embedded in the distributable.

The legacy `BRANCHLINE_GITHUB_CLIENT_ID` name remains supported. Explicit environment and embedded build configuration take precedence over a legacy locally saved `github-oauth.json` identifier. That saved setting is a debug-only compatibility fallback; there is no app registration or configuration screen in the product. A debug build without any configured identifier keeps local Git work available and shows **GitHub sign-in is unavailable in this development build.**

Registration fields follow [GitHub's OAuth app registration instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). Changing the registered app requires rebuilding and distributing GitSomething with the new identifier. After configuring the native build, verify the same **Sign in with GitHub** flow that users will see.

## What access is requested

| Scope        | Why GitSomething requests it                                                            |
| ------------ | --------------------------------------------------------------------------------------- |
| `repo`       | Create, read, and update public and private repositories the signed-in user can access. |
| `workflow`   | Push changes to GitHub Actions workflow files.                                          |
| `read:user`  | Identify the signed-in account and read profile details.                                |
| `user:email` | Read email addresses so commits can use the user's identity.                            |

This is broad repository access, subject to the user's existing permissions. It does not grant GitSomething unrestricted control over the GitHub account, repository deletion, billing, or organization administration. Organization policies and SSO requirements can still prevent access to particular repositories. Review the consent screen for the actual granted access. [GitHub defines these OAuth scopes and their limits.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)

## Storage and disconnecting

GitHub's access token is received and used by Rust and saved in the operating system's credential store. On a later launch, the app restores the saved connection and loads the account's repositories without asking for another approval while the authorization remains valid. React receives account details and authorization progress, never the access token. Tokens do not belong in frontend storage, remote URLs, the Glass-Box console, or a project configuration file. A keychain failure is a sign-in error, not a reason to silently fall back to plaintext storage.

When GitHub issues expiring access tokens, Rust stores the refresh token in the same credential store and renews access before it expires. Rotated credentials are saved before the connection is reported as ready. If authorization or the refresh token is revoked or expires, connect again. [GitHub documents expiring tokens and refresh requests for device authorization.](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

**Disconnect** removes GitSomething's saved credential from this computer. To revoke the OAuth app's authorization at GitHub as well, use [GitHub's authorized OAuth applications](https://github.com/settings/applications). Revoking access there affects the application's authorization independently of local storage. [GitHub describes reviewing and revoking authorized OAuth apps.](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps)

GitLab still uses a token entered for the individual publish operation; the GitHub sign-in change does not add GitLab OAuth or self-hosted provider support.

## Verification boundary

The packaged Windows alpha completed real GitHub browser approval on October 17, 2026. Home loaded accessible public and private repositories, including another page, and restarting the packaged application restored the connection from the Windows credential store without another sign-in. [VERIFICATION.md](VERIFICATION.md) records that live evidence separately from the automated fixtures. Private repository names and credentials are not part of the release evidence.

Automated browser checks exercise the consent and repository-list UI through explicit native fixtures; Rust tests check polling, scope validation, redaction, and credential destination rules. Those checks complement the live account test and do not prove remote publication or pushing. New release candidates still need a production-app check of sign-in, loaded repository controls, paging, browser links, logout, and restoration after restart.

Live denial, an expired one-time code, revoked authorization, and installer installation/uninstallation remain separate checks. Publishing and pushing to GitHub also remain unverified in this release candidate and require an explicitly selected disposable project. Do not create a repository or approve consent on someone's behalf as an automated test.
