# Windows continuous integration

[Windows checks](../.github/workflows/windows-checks.yml) runs on pushes and pull requests to `main` that change application source, public assets, scripts, dependency manifests, TypeScript/Vite configuration, or `.github` files. Documentation and proof-only commits do not restart the checks. The workflow can also be started manually from the repository's Actions tab. It uses one Windows Server 2022 x64 runner with Node.js **22.21.0** and Rust **1.95.0**, matching the locally verified toolchain. A newer run for the same branch cancels an older run; each job has a 35-minute limit.

The workflow installs dependencies from the npm lockfile, checks TypeScript and frontend unit tests, builds the frontend, checks Rust formatting, runs the Rust tests with the Cargo lockfile, and rejects Clippy warnings. These checks do not authorize GitHub, open the desktop app, or prove installer behavior or live provider integration. Browser fixtures and native/manual checks remain separate; see [VERIFICATION.md](VERIFICATION.md).

## Shared GitHub configuration

Set **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Name                            | Value                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `GITSOMETHING_GITHUB_CLIENT_ID` | The registered GitSomething OAuth app's public Client ID, with Device Flow enabled |

The workflow reads this value through GitHub's `vars` context. This public application identifier is embedded in native builds. It is not a personal access token or client secret. The ordinary debug-profile checks can run without it; a requested release installer fails if it is absent. [GitHub documents repository variables and their workflow context.](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)

## Build a candidate without publishing

From **Actions → Windows checks → Run workflow**, select the intended source branch and enable **Build and upload an unsigned Windows candidate after checks**. After checks pass, the job runs:

```powershell
npm run tauri build -- --bundles nsis -- --locked
node scripts/package-release.mjs --source-revision "$env:GITHUB_SHA"
```

The packager checks synchronized versions, the matching release notes, and the expected public assets. It stages the installer, application executable, notes, brand exports, manifest, and SHA-256 checksums: **15 files** in `artifacts/releases/v<version>/`. The exact workflow source commit is recorded in the manifest. A successful manual run uploads this directory as an Actions artifact for seven days. Download it from that workflow run; access follows repository permissions.

This workflow creates no Git tag or GitHub release and does not sign executables. The candidate remains unsigned. A successful build and checksum manifest do not establish that installation, browser authorization, or pushing works. Verify the native version and remaining release checks before preparing a release; see [RELEASING.md](RELEASING.md).

## Permissions, actions, and caching

The workflow grants `GITHUB_TOKEN` only `contents: read`. Checkout does not persist Git credentials, and no GitHub access token is passed to build steps. Official checkout, setup-node, cache, and upload-artifact actions use immutable commit SHA pins, verified against their upstream release tags. Updating an action means checking its upstream commit and changing that pin deliberately. [GitHub recommends granting only the permissions a workflow needs.](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)

Node setup caches npm's package download cache. Rust caching includes only registry indexes, downloaded package data, Git dependency objects, and `src-tauri/target/`; it never caches the whole Cargo home, credential configuration, `.env` files, or account state. The cache key includes the pinned Rust version and Cargo manifest/lockfile hashes. No release asset upload runs on ordinary pushes or pull requests.

The [bug report form](../.github/ISSUE_TEMPLATE/bug_report.yml) collects the application and Windows versions, installation source, affected feature, reproduction steps, and expected/actual results. It requires no pre-existing repository labels or assignees. Blank issues remain available.
