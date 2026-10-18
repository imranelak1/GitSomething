# Preparing a release

**1.0.0-beta.4** uses one Windows x64 setup EXE. The default packaging format is `installer`; `--format portable` selects the direct-run app, while `--format full` retains the older installer-and-brand-assets set when explicitly requested. Prepare a draft prerelease, verify the exact candidate, then publish it. Keep the native identifier `dev.branchline.desktop` and credential-store service unchanged so updates retain preferences and sign-in.

Published releases are immutable history. [Beta.3](releases/v1.0.0-beta.3.md) keeps its original portable EXE. Beta.2 was built from **`10a786473f82382879750efc7fdec34e90cf2b17`** and retains its original 15 uploaded assets. Do not move that tag, replace its binaries, or rebuild it from a later documentation commit. [Beta.2](releases/v1.0.0-beta.2.md), [beta.1](releases/v1.0.0-beta.1.md), and the [alpha](releases/v0.1.0-alpha.1.md) keep their versioned evidence.

## Build the setup executable

Use Node.js 22.12 or newer, Rust 1.88 or newer, Microsoft C++ build tools, and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/). Install dependencies from the lockfiles and record the exact source commit.

Set the shared public `GITSOMETHING_GITHUB_CLIENT_ID` in the build environment or ignored root `.env.local`; enable Device Flow on that GitHub OAuth app. No client secret or access token belongs in a build. See [GitHub configuration](GITHUB_AUTH.md#maintainer-configuration-before-distribution).

Synchronize `package.json`, both application versions in `package-lock.json`, `src-tauri/Cargo.toml`, the application entry in `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`. Add matching `docs/releases/v<version>.md` notes. Then run:

```powershell
npm ci
npm run check
node --test scripts/inspect-windows-exe.test.mjs
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --bundles nsis --no-binary-patching -- --locked
```

Tauri builds the frontend and application; the final separator passes `--locked` to Cargo. Close an app running from the output directory before relinking it. The host-build application is `src-tauri/target/release/gitsomething.exe`; the setup output is `src-tauri/target/release/bundle/nsis/GitSomething_1.0.0-beta.4_x64-setup.exe`. An explicit `--target x86_64-pc-windows-msvc` build uses `src-tauri/target/x86_64-pc-windows-msvc/release/` instead.

Keep `--no-binary-patching`: Tauri otherwise temporarily changes an embedded bundle-type marker in the installer payload and restores the standalone file afterward. This project ships one NSIS format and has no per-format updater, so preserving identical app bytes lets the installation verifier compare its SHA-256 directly against the audited executable. To rebundle an already verified locked build, use `npm run tauri bundle -- --bundles nsis --no-binary-patching` without rebuilding the application.

The NSIS setup installs for the current Windows user and supplies application shortcuts. The app includes its interface, Git engine, and assets; Git, Node.js, and Rust are not runtime requirements. Tauri's configured `downloadBootstrapper` obtains [Microsoft Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if missing, so that step requires internet access. Microsoft's [runtime distribution guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) explains availability and deployment. Preferences and recents use the normal app profile, and GitHub credentials use the OS credential store.

[Windows CI](CI.md) runs code checks and supports a manual `build_release` request for the single setup EXE. CI creates candidate artifacts and does not publish releases.

## Verify the candidate

Install and launch the packaged production candidate and record version-specific evidence in [VERIFICATION.md](VERIFICATION.md). Confirm current-user installation, actual shortcut locations, shortcut launch, branding/version, Home and local Git work, retained preferences, and account restoration. Check uninstall/reinstall separately; do not infer them from a successful build. Exercise cloning, cancellation, existing-folder refusal, workspace opening, Glass Box progress, and watcher refresh. Distinguish fixture-driven tests from real provider operations and native picker interaction.

Verify usage sharing starts Off and changes only after explicit consent. Anonymous mode must omit the GitHub login; username sharing may include only the signed-in public login. Turning sharing Off must stop future attempts. Browser and development previews must send no usage. [Analytics documentation](ANALYTICS.md) defines the payload and test boundary.

A successful build does not prove installation, a missing-WebView2 experience, a live private clone, provider push, or publication. Keep such limits explicit. Beta.4 evidence must come from beta.4; older release results remain historical.

## Stage one public setup executable

After the build, upload the exact setup output to a **draft** with only that asset, then run [Verify Windows installer](../.github/workflows/verify-windows-installer.yml). Supply its tag and the SHA-256 of both the setup file and the built `gitsomething.exe`. The disposable runner installs it, compares the actual installed application bytes, checks both shortcuts and registration, then uninstalls it. Download its `report.json` artifact. This does not modify the maintainer's existing installation.

Package against the verified source commit with that report. Replace both placeholders before running:

```powershell
$releaseSourceRevision = '<verified-40-character-source-commit>'
$installerProof = '<downloaded-installer-verification-report.json>'
npm run release:package -- --format installer --dry-run --source-revision $releaseSourceRevision
npm run release:package -- --format installer --source-revision $releaseSourceRevision --installer-proof $installerProof
```

`installer` is also the default when `--format` is omitted. Use `--target x86_64-pc-windows-msvc` for a targeted build, `--installer <actual-setup.exe>` to select the setup input, or `--exe <actual-gitsomething.exe>` to select the application inspected by the packager. Actual installer/full staging requires a passed report matching the version and exact setup/application hashes; an input-only dry-run is insufficient. The packager then creates `GitSomething_1.0.0-beta.4_x64-setup.exe` and internal provenance/checksum evidence under `artifacts/releases/v1.0.0-beta.4/`. The manifest's `sourceRevision` identifies the build source, which may differ from a later documentation HEAD.

Upload **only that EXE** for the beta.4 setup release. Keep generated manifests, checksum lists, reports, notes copies, and branding exports as internal build evidence rather than extra download choices. Put the complete executable SHA-256 in the release body, replacing `INSERT_SHA256` in the beta.4 notes after the bytes are final:

```powershell
Get-FileHash .\artifacts\releases\v1.0.0-beta.4\GitSomething_1.0.0-beta.4_x64-setup.exe -Algorithm SHA256
```

The optional `--format portable` packages only the direct-run application and requires an existing WebView2 runtime. Build it with `npm run tauri build -- --no-bundle -- --locked`. The optional `--format full` stages the legacy installer, executable, notes, brand exports, manifest, and checksums. Neither option should silently add files to the one-setup-EXE release. Keep binaries outside ordinary source commits.

## Publish and verify immutable assets

Review the notes, exact source revision, and hash before publishing a draft prerelease on `imranelak1/GitSomething`. Attach the single named EXE explicitly, rather than uploading the whole staging directory. Keep `prerelease: true`, the intended tag/source target, and `make_latest: "false"` when publishing through the API. Earlier published tags and assets remain unchanged.

Enable [GitHub release immutability](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) before publication. It locks the published tag and assets and creates a GitHub release attestation; titles and notes remain editable. After publication, verify the release and a freshly downloaded EXE:

```powershell
gh release verify v1.0.0-beta.4 --repo imranelak1/GitSomething
gh release verify-asset v1.0.0-beta.4 .\GitSomething_1.0.0-beta.4_x64-setup.exe --repo imranelak1/GitSomething
Get-FileHash .\GitSomething_1.0.0-beta.4_x64-setup.exe -Algorithm SHA256
```

Compare that digest with the release body and internal manifest. Record actual verification results; planned publication is not evidence of attestation. See [GitHub's integrity verification guide](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity).

The Windows installer and application are **unsigned**. A GitHub-signed release attestation verifies the published asset digest; it is separate from Windows Authenticode signing or a maintainer-signed Git tag. Configure a genuine [Windows signing identity](https://v2.tauri.app/distribute/sign/windows/) before describing a future executable as signed.
