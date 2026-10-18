# Windows continuous integration

[Windows checks](../.github/workflows/windows-checks.yml) runs on pushes and pull requests to `main` that change application source, public assets, scripts, dependency manifests, TypeScript/Vite configuration, or `.github` files. Documentation and proof-only commits do not restart the checks. The workflow can also be started manually from the repository's Actions tab. It uses one Windows Server 2022 x64 runner with Node.js **22.21.0** and Rust **1.95.0**, matching the locally verified toolchain. A newer run for the same branch cancels an older run; each job has a 35-minute limit.

The workflow installs dependencies from the npm lockfile, checks TypeScript and frontend unit tests, tests the Windows PE dependency auditor, builds the frontend, checks Rust formatting, runs the Rust tests with the Cargo lockfile, and rejects Clippy warnings. These checks do not authorize GitHub, open the desktop app, or prove installer behavior or live provider integration. Browser fixtures and native/manual checks remain separate; see [VERIFICATION.md](VERIFICATION.md).

## Shared GitHub configuration

Set **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name                            | Value                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `GITSOMETHING_GITHUB_CLIENT_ID` | The registered GitSomething OAuth app's public Client ID, with Device Flow enabled |

The workflow reads this value through GitHub's `vars` context. This public application identifier is embedded in native builds. It is not a personal access token or client secret. The ordinary debug-profile checks can run without it; a requested release build fails if it is absent. [GitHub documents repository variables and their workflow context.](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)

## Build a candidate without publishing

From **Actions → Windows checks → Run workflow**, select the intended source branch and enable the **single Windows setup EXE** build (`build_release`). After checks pass, the job runs:

```powershell
npm run tauri build -- --bundles nsis --no-binary-patching -- --locked
# The workflow verifies installation before packaging.
node scripts/package-release.mjs --source-revision "$env:GITHUB_SHA" --installer-proof "$env:RUNNER_TEMP/gitsomething-installer-verification/report.json"
```

The workflow tests a fresh current-user installation on its disposable runner before packaging: actual installed application hash/version/architecture, registry values, desktop and Start menu shortcut targets, and uninstall cleanup. The CI-only verifier refuses pre-existing GitSomething registrations or shortcuts. It never launches the application or authorizes GitHub.

The default installer packager checks synchronized versions, matching release notes, Windows x64 application architecture, normal/delay DLL imports, and the passed installation report's exact setup/application hashes. It stages one NSIS setup EXE plus internal `manifest.json` and `SHA256SUMS.txt` records in `artifacts/releases/v<version>/`. The manifest records the exact workflow source commit. CI uploads the EXE and verification records as separate Actions artifacts for seven days. Download them from that workflow run; access follows repository permissions. Only the setup EXE belongs in the public release asset list. Setup is configured to download WebView2 if missing; that step needs internet access. The explicit local `--format portable` and `--format full` options do not change this CI default.

This workflow creates no Git tag or GitHub release and does not sign executables. The candidate remains unsigned. A successful build and checksum manifest do not establish that installation, browser authorization, or pushing works. Verify the native version and remaining release checks before preparing a release; see [RELEASING.md](RELEASING.md).

[Verify Windows installer](../.github/workflows/verify-windows-installer.yml) provides the same installation checks for an existing draft candidate. Dispatch it with the matching version tag and both expected SHA-256 hashes. It requires exactly one setup asset. GitHub requires push access to read drafts, so this separate job grants `contents: write` and passes its token only to the download step; setup and verification run without that token. The workflow only reads the draft and never publishes or edits it. It uploads the verification report even after a test failure. [GitHub documents draft visibility](https://docs.github.com/en/rest/releases/releases#list-releases).

## Permissions, actions, and caching

The workflow grants `GITHUB_TOKEN` only `contents: read`. Checkout does not persist Git credentials, and no GitHub access token is passed to build steps. Official checkout, setup-node, cache, and upload-artifact actions use immutable commit SHA pins, verified against their upstream release tags. Updating an action means checking its upstream commit and changing that pin deliberately. [GitHub recommends granting only the permissions a workflow needs.](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)

Node setup caches npm's package download cache. Rust caching includes only registry indexes, downloaded package data, Git dependency objects, and `src-tauri/target/`; it never caches the whole Cargo home, credential configuration, `.env` files, or account state. The cache key includes the pinned Rust version and Cargo manifest/lockfile hashes. No release asset upload runs on ordinary pushes or pull requests.

The [bug report form](../.github/ISSUE_TEMPLATE/bug_report.yml) collects the application and Windows versions, installation source, affected feature, reproduction steps, and expected/actual results. It requires no pre-existing repository labels or assignees. Blank issues remain available.
