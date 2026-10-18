# Preparing a release

**1.0.0-beta.3** uses a single direct-run Windows x64 executable. The default packaging format is `portable`; `--format full` retains the older installer-and-brand-assets format when explicitly requested. Prepare a draft prerelease, verify the exact candidate, then publish it. Keep the native identifier `dev.branchline.desktop` and credential-store service unchanged so updates retain preferences and sign-in.

Published releases are immutable history. Beta.2 was built from **`10a786473f82382879750efc7fdec34e90cf2b17`** and retains its original 15 uploaded assets. Do not move that tag, replace its binaries, or rebuild it from a later documentation commit. [Beta.2](releases/v1.0.0-beta.2.md), [beta.1](releases/v1.0.0-beta.1.md), and the [alpha](releases/v0.1.0-alpha.1.md) keep their versioned evidence.

## Build the portable application

Use Node.js 22.12 or newer, Rust 1.88 or newer, Microsoft C++ build tools, and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/). Install dependencies from the lockfiles and record the exact source commit.

Set the shared public `GITSOMETHING_GITHUB_CLIENT_ID` in the build environment or ignored root `.env.local`; enable Device Flow on that GitHub OAuth app. No client secret or access token belongs in a build. See [GitHub configuration](GITHUB_AUTH.md#maintainer-configuration-before-distribution).

Synchronize `package.json`, both application versions in `package-lock.json`, `src-tauri/Cargo.toml`, the application entry in `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`. Add matching `docs/releases/v<version>.md` notes. Then run:

```powershell
npm ci
npm run check
node --test scripts/inspect-windows-exe.test.mjs
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --no-bundle -- --locked
```

Tauri builds the frontend and application; the final separator passes `--locked` to Cargo. Close an app running from the output directory before relinking it. The host-build executable is `src-tauri/target/release/gitsomething.exe`. An explicit `--target x86_64-pc-windows-msvc` build uses `src-tauri/target/x86_64-pc-windows-msvc/release/` instead.

The direct-run EXE includes the interface, Git engine, and app assets. Users need an installed [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), with no separate Git, Node.js, or Rust installation. It does not run an installer, install shortcuts, or bootstrap WebView2. Microsoft's [runtime distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) explains availability and deployment. Preferences and recents persist in the normal app profile, and GitHub credentials use the OS credential store, rather than beside the EXE.

[Windows CI](CI.md) runs code checks and supports a manual `build_release` request for the portable EXE. CI creates candidate artifacts and does not publish releases. The optional local `full` packaging format requires a separate NSIS build.

## Verify the candidate

Check the packaged production EXE and record version-specific evidence in [VERIFICATION.md](VERIFICATION.md). Confirm direct launch, branding/version, Home and local Git work, retained preferences, and account restoration. Exercise cloning, cancellation, existing-folder refusal, workspace opening, Glass Box progress, and watcher refresh. Distinguish fixture-driven tests from real provider operations and native picker interaction.

Verify usage sharing starts Off and changes only after explicit consent. Anonymous mode must omit the GitHub login; username sharing may include only the signed-in public login. Turning sharing Off must stop future attempts. Browser and development previews must send no usage. [Analytics documentation](ANALYTICS.md) defines the payload and test boundary.

Installer installation/uninstallation applies only to a separately built installer. A successful build does not prove those operations or a live private clone, provider push, or publication. Keep such limits explicit. Beta.3 runtime evidence must come from beta.3; older beta.2 results remain historical.

## Stage one public executable

After the build, package against its verified full source commit. Replace the placeholder before running:

```powershell
$releaseSourceRevision = '<verified-40-character-source-commit>'
npm run release:package -- --format portable --dry-run --source-revision $releaseSourceRevision
npm run release:package -- --format portable --source-revision $releaseSourceRevision
```

`portable` is also the default when `--format` is omitted. Use `--target x86_64-pc-windows-msvc` for a targeted build or `--exe <actual-gitsomething.exe>` to select the built EXE. The packager verifies matching versions and expected inputs, then creates `GitSomething_1.0.0-beta.3_windows-x64.exe` and internal provenance/checksum evidence under `artifacts/releases/v1.0.0-beta.3/`. The manifest's `sourceRevision` identifies the build source, which may differ from a later documentation HEAD.

Upload **only that EXE** for the beta.3 portable release. Keep generated manifests, checksum lists, reports, notes copies, and branding exports as internal build evidence rather than extra download choices. Put the complete executable SHA-256 in the release body, replacing `INSERT_SHA256` in the beta.3 notes after the bytes are final:

```powershell
Get-FileHash .\artifacts\releases\v1.0.0-beta.3\GitSomething_1.0.0-beta.3_windows-x64.exe -Algorithm SHA256
```

The optional `--format full` stages the legacy installer, executable, notes, brand exports, manifest, and checksums. It requires an NSIS build (`npm run tauri build -- --bundles nsis -- --locked`). Selecting that format is a separate distribution decision; it must not silently add those files to a one-EXE release. Keep binaries outside ordinary source commits.

## Publish and verify immutable assets

Review the notes, exact source revision, and hash before publishing a draft prerelease on `imranelak1/GitSomething`. Attach the single named EXE explicitly, rather than uploading the whole staging directory. Keep `prerelease: true`, the intended tag/source target, and `make_latest: "false"` when publishing through the API. Earlier published tags and assets remain unchanged.

Enable [GitHub release immutability](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) before publication. It locks the published tag and assets and creates a GitHub release attestation; titles and notes remain editable. After publication, verify the release and a freshly downloaded EXE:

```powershell
gh release verify v1.0.0-beta.3 --repo imranelak1/GitSomething
gh release verify-asset v1.0.0-beta.3 .\GitSomething_1.0.0-beta.3_windows-x64.exe --repo imranelak1/GitSomething
Get-FileHash .\GitSomething_1.0.0-beta.3_windows-x64.exe -Algorithm SHA256
```

Compare that digest with the release body and internal manifest. Record actual verification results; planned publication is not evidence of attestation. See [GitHub's integrity verification guide](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity).

The Windows executable is **unsigned**. A GitHub-signed release attestation verifies the published asset digest; it is separate from Windows Authenticode signing or a maintainer-signed Git tag. Configure a genuine [Windows signing identity](https://v2.tauri.app/distribute/sign/windows/) before describing a future executable as signed.
