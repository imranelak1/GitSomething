# GitSomething

A desktop Git client built around a clear working directory, readable diffs, and transparent Git operations. Tauri 2 and Rust run Git through `git2`/libgit2; React, TypeScript, Monaco, and Motion for React provide the interface.

This is a beta preview of a larger product. Advanced history operations are documented and previewed before they are enabled. See [PRODUCT.md](PRODUCT.md) for the delivery boundary and [DESIGN.md](DESIGN.md) for the visual system.

The Windows x64 **1.0.0-beta.2** prerelease is available on GitHub. **[Download the Windows installer](https://github.com/imranelak1/GitSomething/releases/download/v1.0.0-beta.2/GitSomething_1.0.0-beta.2_x64-setup.exe)** or see [all release assets](https://github.com/imranelak1/GitSomething/releases/tag/v1.0.0-beta.2). GitHub's signed release attestation protects the published tag and assets; the Windows packages themselves are unsigned. See [release notes and download verification](docs/releases/v1.0.0-beta.2.md), [test evidence](docs/VERIFICATION.md), and the [brand and motion guide](docs/BRAND.md). The original prompt-cat mark has a brief Motion animation with a static reduced-motion alternative; the [standalone preview](public/brand/gitsomething-logo-preview.html) also works offline.

[Windows checks](https://github.com/imranelak1/GitSomething/actions/workflows/windows-checks.yml) validates code changes on GitHub. See the [CI guide](docs/CI.md) for reproducible candidate builds and use the [bug report form](https://github.com/imranelak1/GitSomething/issues/new?template=bug_report.yml) when testing the beta.

**1.0.0-beta.2** adds **Clone & open** to GitHub repository rows. Choose a parent folder to download a working copy and open it in the workspace using your existing sign-in. Update from beta.1 to use this action. See the [cloning guide](docs/GITHUB_AUTH.md#clone-a-github-repository) and [beta.2 notes](docs/releases/v1.0.0-beta.2.md).

Home opens first, with real recent repositories, open/create actions, a guide, and an explicit demo entry. The interface uses GitHub's dark palette with shared colors in `src/theme.css`. Purple teaching surfaces explain staging, local commits, and sharing. The glassy Glass Box shows Git commands and results, operation failures, and real account or publishing events. Guided Git commands use the same engine. Navigation, scrolling, resizing, appearance controls, and lesson openings stay out of the transcript. Drag its separator to resize it or use Terminal appearance to adjust text size; preferences are remembered. See [Learn with the Glass Box](docs/GLASS_BOX.md).

## Run locally

Install Node.js **22.12.0 or newer**, npm, and Rust **1.88 or newer**. Native development also needs the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/); on Windows these include Microsoft C++ build tools and WebView2.

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal for the browser preview. The browser uses a clearly identified demonstration repository: a browser cannot supply a trusted native folder path or run the Rust Git engine. Open the desktop app for real filesystem and provider operations:

```powershell
npm run tauri dev
```

The first native build compiles libgit2 and platform dependencies and takes longer than subsequent builds. Before creating a production desktop bundle, the maintainer configures GitSomething's shared public OAuth Client ID once in the project's ignored `.env.local`. Release builds require that setting; installed users only sign in and approve access. See [maintainer configuration](docs/GITHUB_AUTH.md#maintainer-configuration-before-distribution).

```powershell
npm run tauri build
```

## First-use flow

The app opens **Home** after a brief branded startup animation. Select **Skip intro**, press Escape or Enter, or enable system reduced motion to go straight to Home. Account restoration starts immediately underneath the intro; navigation does not replay it. Choose **Show me around** for the interactive guide, open a project, or select **Try demo** to practice safely. The guide explains each step in plain language and can also be opened from **A little help** or **Getting started** in the command palette. You can explore locally before connecting an account. Use **Home** to leave the workspace and **Continue workspace** to return to its current draft.

1. **Open a folder.** Open an existing Git repository, or drop a new project folder onto the desktop app to publish it.
2. **Connect GitHub.** Select **Sign in with GitHub**, approve access in your browser using the one-time code, and return to your repositories. No app registration or configuration is needed from users. Browse All, Public, or Private repositories, search loaded metadata, and sort by recent updates or name. The list loads up to 100 repositories per page and offers Load more for larger accounts.
3. **Review before sharing.** Choose a repository name and Public or Private visibility. Publishing creates the initial local commit, creates the hosted repository, and pushes the first version. GitLab keeps its operation-specific token flow.
4. **Save your next change.** Review a changed file, pick the files for this save (**stage**), and describe the change before creating a **commit**. A commit saves a version on your computer; **Slide to push** uploads saved versions to GitHub. Drag the handle to the end and release, or focus it, press End, then Enter. Publishing a new folder uses the same deliberate confirmation before creating the cloud repository and pushing.

Local review, staging, and commits work offline. Connecting accounts and synchronizing with a remote require the network. The Glass-Box console explains each equivalent Git command, with hosted repository creation clearly labeled as an API action.

Publishing changes the selected local folder and creates a remote repository. Account and name checks happen before initialization. A later provider race, network failure, or failed push can leave the local commit and remote in place. Recovery after initialization is currently manual: inspect the provider account, open the preserved local repository, and configure the appropriate remote/credentials before retrying synchronization. The publishing dialog does not automatically resume an existing repository. [The runtime ADR](docs/adr/0001-native-git-runtime.md) describes this boundary.

## Repository layout

```text
gitsomething/
├── src/
│   ├── main.tsx                       # React entry point
│   ├── App.tsx                        # Desktop workspace and view composition
│   ├── styles.css                     # Tailwind and application design tokens
│   ├── components/
│   │   ├── publish/
│   │   │   ├── DropzoneToGitHub.tsx     # Folder-to-provider publishing flow
│   │   │   └── publish.css             # Publishing dialog and step presentation
│   │   ├── auth/GitHubConnectCard.tsx   # Browser sign-in and connected-account surface
│   │   ├── onboarding/FirstRunGuide.tsx # Welcome, account connection, and Git practice
│   │   ├── DiffViewer.tsx              # Monaco diff surface
│   │   ├── HistoryGraph.tsx            # Commit graph and guarded drag previews
│   │   ├── GlassBox.tsx                # Equivalent CLI operation log
│   │   ├── CommandPalette.tsx          # Progressive disclosure with Ctrl/Cmd+K
│   │   ├── ui/                        # Source-owned shadcn-style primitives
│   │   └── registry/
│   │       ├── skiper/                 # Attributed TextRoll and original kinetic modal
│   │       └── vengeance/              # Attributed animated buttons and tooltips
│   ├── hooks/useRepository.ts         # Native IPC, event lifecycle, demo boundary
│   ├── hooks/useGitHubAuth.tsx         # Account state and device authorization lifecycle
│   └── lib/
│       ├── types.ts                    # Frontend DTOs and operation types
│       ├── console.ts                  # Command token explanations
│       ├── demo.ts                     # Explicit browser preview fixture
│       └── utils.ts                    # Component utilities
├── src-tauri/
│   ├── src/main.rs                    # Desktop binary entry point
│   ├── src/lib.rs                     # Tauri builder, state, and command registration
│   ├── src/git_engine.rs              # libgit2 operations and repository state
│   ├── src/github_auth.rs             # GitHub OAuth and OS credential storage
│   ├── Cargo.toml                     # Rust dependency manifest
│   ├── tauri.conf.json                # Window, bundle, and CSP configuration
│   ├── capabilities/                 # Native access granted to the main window
│   └── build.rs
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPENDENCIES.md
│   ├── GITHUB_AUTH.md                 # One-time app owner setup and user sign-in
│   ├── VERIFICATION.md
│   └── adr/0001-native-git-runtime.md
├── components.json                    # shadcn CLI paths and component conventions
├── scripts/
│   ├── verify-ui.mjs                  # Browser interactions and mocked IPC contracts
│   ├── verify-onboarding.mjs          # First launch, Git practice, and mocked GitHub consent
│   └── verify-native.mjs              # Prepared real-WebView IPC smoke check
├── artifacts/                         # Recorded reports and review screenshots
├── package.json
├── PRODUCT.md
└── DESIGN.md
```

Registries contain reviewed component source and attribution. The Skiper directory contains the actual free TextRoll source adaptation, credited in the application, alongside a project-owned kinetic modal. Vengeance AnimatedButton and tooltip adaptations preserve their MIT notices. The Studio redesign uses Motion for React and original components inspired by AnimMaster's public examples, without including paid source. [Motion sources](docs/MOTION_SOURCES.md) and [dependency rationale](docs/DEPENDENCIES.md) explain these choices.

## Checks

```powershell
npm run check
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

`npm run check` already includes the frontend unit tests; `npm run test` is available separately for a focused rerun. Native integration and remote publishing require a desktop session and an account with suitable permissions. Use a disposable folder and private test repository to verify publishing. [VERIFICATION.md](docs/VERIFICATION.md) separates automated checks, manual desktop checks, and the deferred plugin installation.

With `npm run dev` running in another terminal, run the browser checks:

```powershell
npm run test:ui
npm run test:onboarding
```

The runner uses Microsoft Edge when available on Windows; otherwise install Playwright's Chromium with `npx playwright install chromium`. Set `BRANCHLINE_TEST_URL` to test a different development-server URL. Reports and screenshots are written to `artifacts/`.

The publishing flow accepts an unversioned folder, a connected GitHub.com account, or an operation-scoped GitLab.com token. GitHub credentials stay in the native backend and the OS credential store, and are reused for GitHub HTTPS synchronization. It rejects existing/nested repositories, obvious credential files, individual files above 50 MiB, and scans above 100,000 files. Provider credentials are restricted to their provider's HTTPS host and checked again at each credential request; existing SSH-agent/default credential support remains available. GitLab publishing tokens are not retained for later pushes. Pull is fast-forward only and refuses dirty or divergent state. Text diffs currently require UTF-8 and are limited to 2 MiB per file.

A file with staged and unstaged changes appears in both groups, with a separate diff for each version. File counts use unique paths. The detached-HEAD Guardian can create a new rescue branch without changing working files; merge/rebase conflicts must currently be completed outside the app.

## Architecture boundaries

Git commands shown in the console are explanations of `git2` calls. The application does not execute those strings or spawn a Git child process. Git hosting uses `reqwest` HTTPS requests. Tokens must never appear in command strings, events, errors, frontend preferences, or credential-bearing remote URLs. Remembered GitHub credentials belong in the OS credential store.

Native work executes off the UI runtime; mutations are serialized so status refreshes and filesystem events cannot race index changes. `notify` invalidates repository snapshots, with refresh coalescing instead of one full scan per filesystem event. These choices avoid process startup overhead but do not imply every Git operation, large diff, filesystem scan, or network request takes less than a millisecond.

Read the [architecture](docs/ARCHITECTURE.md) and [runtime ADR](docs/adr/0001-native-git-runtime.md) before adding native commands or advanced history mutation.

## After user verification: Brag

The requested Brag plugin installation is deliberately deferred until the user verifies this milestone. The installed Codex CLI's read-only help confirms these command forms:

```powershell
codex plugin marketplace add latent-spaces/brag
codex plugin add brag@brag
```

After adding the marketplace, check its reported name before using the second selector. No marketplace registration or plugin installation is part of this milestone's implementation checks.
