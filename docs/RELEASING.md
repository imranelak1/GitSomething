# Preparing a release

The current release is [**1.0.0-beta.2**](https://github.com/imranelak1/GitSomething/releases/tag/v1.0.0-beta.2), a public Windows x64 beta preview with native GitHub cloning. It remains a prerelease, not a stable Latest release. Prepare future candidates as draft GitHub prereleases so the installer and notes can be reviewed before publication. Keep the existing native identifier `dev.branchline.desktop` and credential-store service unchanged so updates retain preferences and sign-in. The [beta.2 notes](releases/v1.0.0-beta.2.md) describe this release; [beta.1](releases/v1.0.0-beta.1.md) and the [alpha](releases/v0.1.0-alpha.1.md) remain historical evidence with their original tags and assets unchanged.

The beta.2 application was built from **`10a786473f82382879750efc7fdec34e90cf2b17`**. Later documentation commits do not change that build source. Pin the release tag, manifest `sourceRevision`, and packaging input to that exact commit rather than the current documentation HEAD.

## Configure and build

Use Node.js 22.12 or newer, Rust 1.88 or newer, Microsoft C++ build tools, and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/). Work from a known commit with dependencies installed from the lockfiles.

1. Set the shared public `GITSOMETHING_GITHUB_CLIENT_ID` in the build environment or ignored root `.env.local`. Enable Device Flow on that GitHub OAuth app. Never supply a client secret or access token; see [GitHub configuration](GITHUB_AUTH.md#maintainer-configuration-before-distribution).
2. Synchronize the version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`. Create the matching `docs/releases/v<version>.md` notes. Keep preview capabilities and unverified live flows explicit.
3. Confirm `src-tauri/icons/` contains the branded icon sizes referenced by Tauri and the brand exports are present in `public/brand/`. Review the app's production CSP and capabilities; new release metadata does not need additional native permissions.
4. Run the meaningful checks, then build the NSIS installer:

```powershell
npm ci
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --bundles nsis -- --locked
```

The Tauri command also builds the frontend. The final separator passes `--locked` to Cargo. Close a running executable from the same output directory before relinking it on Windows.

The [Windows CI workflow](CI.md) repeats the code checks on GitHub and can build an unsigned candidate on manual request. The shared public OAuth Client ID is configured as a repository variable; CI does not publish releases.

For the default host build, the outputs are `src-tauri/target/release/gitsomething.exe` and `src-tauri/target/release/bundle/nsis/`. A build with `--target x86_64-pc-windows-msvc` places them under `src-tauri/target/x86_64-pc-windows-msvc/release/`. Only claim the architecture actually built and tested. [Tauri documents its Windows installer and WebView2 behavior.](https://v2.tauri.app/distribute/windows-installer/)

## Verify the candidate

Use the installed production app, not only the development WebView or browser fixtures. Record the commands and results in [VERIFICATION.md](VERIFICATION.md).

- Check install, launch, application/shortcut icons, version, uninstall, and a subsequent reinstall on Windows x64. Confirm local Git work does not require GitHub sign-in.
- Complete browser authorization for the registered GitSomething OAuth app. Confirm Home loads actual accessible public/private repositories, including pagination, safe browser links, logout, and fresh launch credential restoration. Check that credentials never enter the frontend, terminal, or reports.
- For cloning, verify the native Home action, picker cancellation, a new destination, default-branch checkout/upstream, Glass Box progress, watcher refresh, Recents, and refusal to overwrite an existing directory. Distinguish a live public clone from fixture-based private credential tests and from exercising the actual operating-system picker.
- In an explicitly chosen disposable project, verify stage/unstage, commit, fetch/push, a clean fast-forward pull, and the folder-to-GitHub publish flow. Confirm failure messages preserve completed steps. Do not use a production repository as an automated publishing test.
- Review Home, sign-in, the diff, publishing slider, and Glass Box at the supported desktop window sizes; include keyboard and reduced-motion behavior.
- On a full launch, verify the finite startup introduction reveals the already-mounted Home after about 1.64 seconds. Check Skip, Escape, Enter, native folder drop, focus handoff, reduced-motion bypass and changes during playback, and no replay during in-app navigation. Intro timing must not depend on a network request or repository read; it must add no Git/provider terminal activity.

The packaged **1.0.0-beta.2** executable passed ten live public-clone checks, including a real GitHub fetch/checkout through Rust, workspace opening, tracking metadata, progress events, existing-destination refusal, watcher refresh, and Recents. Only the folder-picker result was supplied by a fixture; private cloning and actual native picker selection remain separate checks. Earlier beta.1 and alpha account/startup evidence remains historical. See [VERIFICATION.md](VERIFICATION.md) for the exact versioned results. Installer installation/uninstallation and live GitHub publication/pushing remain unverified; the existence of an NSIS file does not establish either result.

The beta has no configured Windows code-signing identity. Record it as unsigned in the notes and manifest. For a later signed release, configure a real [Windows code-signing certificate or signing service](https://v2.tauri.app/distribute/sign/windows/), verify the executable and installer signatures, and update the packaging metadata only after that succeeds. A checksum verifies file integrity; it does not establish the publisher's identity.

## Stage the assets

After a successful beta.2 build, confirm that the NSIS output is `src-tauri/target/release/bundle/nsis/GitSomething_1.0.0-beta.2_x64-setup.exe` and the production executable is `src-tauri/target/release/gitsomething.exe`. Then stage the versioned assets:

```powershell
npm run release:package -- --dry-run
$beta2SourceRevision = '10a786473f82382879750efc7fdec34e90cf2b17'
npm run release:package -- --source-revision $beta2SourceRevision
```

Pass `--target x86_64-pc-windows-msvc` for an explicitly targeted build. If the bundler chose a different filename, use `--installer <actual-setup.exe>`; `--exe <actual-gitsomething.exe>` selects an explicit application executable. `--source-revision <40-character-commit>` records a verified source commit without invoking Git. All paths are resolved from the current working directory.

The script validates matching versions, copies only the expected executable, installer, notes, and explicit public brand files, then writes `manifest.json` and `SHA256SUMS.txt` into `artifacts/releases/v1.0.0-beta.2/`. The brand files include a standalone animated SVG and a self-contained HTML logo preview alongside the static application/provider icons, wordmarks, and banner exports. The resulting set contains 15 staged files, including the manifest and checksums. It never copies environment files, auth state, credentials, debug profiles, or the source tree. It refuses unexpected files already in that output directory rather than silently including them. The manifest labels the package unsigned and lists the exact staged bytes. Keep those large executable assets out of ordinary source commits; upload them as release assets.

Review the notes and manifest, compare hashes, and prepare a **draft prerelease** on `imranelak1/GitSomething` at the verified source commit. Use the matching `docs/releases/v<version>.md` as the body and upload only the 15 staged named assets. When updating an existing draft through the API, explicitly retain `tag_name`, `draft: true`, and `prerelease: true` alongside its exact `target_commitish` and notes. To publish an approved beta, retain its tag and source target, set `draft: false`, keep `prerelease: true`, and do not mark it Latest (`make_latest: "false"` through the API). Verify the published page and downloads without credentials. The repository is public, so published release assets are publicly accessible. Never move a published release tag or replace its assets; ship a new version for changed binaries.

## Immutable release and asset verification

Enable repository release immutability **before publishing** the draft, with all 15 assets already attached. The setting applies to future releases, not retroactively to beta.1. Publication locks the associated tag and assets and creates GitHub's release attestation binding the tag, commit, and asset digests. Release titles and notes can still be edited. [GitHub documents these immutability boundaries.](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

After publication, verify the attestation and a local copy of an attached executable with GitHub CLI:

```powershell
gh release verify v1.0.0-beta.2 --repo imranelak1/GitSomething
gh release verify-asset v1.0.0-beta.2 .\artifacts\releases\v1.0.0-beta.2\GitSomething_1.0.0-beta.2_windows-x64.exe --repo imranelak1/GitSomething
gh release verify-asset v1.0.0-beta.2 .\artifacts\releases\v1.0.0-beta.2\GitSomething_1.0.0-beta.2_x64-setup.exe --repo imranelak1/GitSomething
```

Run asset verification against downloaded copies as well, using their actual local paths, and compare the complete asset set with the manifest and SHA-256 list. `verify-asset` checks the local digest against the release attestation; automatically generated source archives are outside that check. Record the command results instead of assuming that publishing alone establishes verification. [GitHub's integrity-verification guide](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity) and the CLI references for [release verification](https://cli.github.com/manual/gh_release_verify) and [asset verification](https://cli.github.com/manual/gh_release_verify-asset) explain the checks.

A GitHub-signed release attestation is separate from a maintainer-signed Git tag or Windows Authenticode signature. Beta.2's Windows executable and installer remain **unsigned**; release verification does not establish either kind of signing or prove installer installation.
