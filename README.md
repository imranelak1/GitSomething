# Branchline

A desktop Git client built around a calm working directory, readable diffs, and a transparent explanation of every action. Tauri 2 and Rust run Git through `git2`/libgit2; React, TypeScript, Monaco, and Framer Motion provide the interface.

This is the first implementation milestone of a larger product. Advanced history operations are documented and previewed before they are enabled. See [PRODUCT.md](PRODUCT.md) for the delivery boundary and [DESIGN.md](DESIGN.md) for the visual system.

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

The first native build compiles libgit2 and platform dependencies and takes longer than subsequent builds. To create a production desktop bundle:

```powershell
npm run tauri build
```

## First-use flow

1. Open an existing local repository in the desktop app, or drop an unversioned folder onto it.
2. Review the folder, repository name, visibility, and provider in the publishing dialog. Supply a provider token for this operation; it is not saved as an application preference.
3. Publish. The native workflow validates the folder, authenticates the provider account, checks name availability, initializes Git, creates an initial commit, creates the remote through the provider API, configures `origin`, pushes `main`, and establishes its upstream.
4. Follow the progress and equivalent Git commands in the Glass-Box console. The API creation step is identified as an API action rather than disguised as a Git command.

Publishing changes the selected local folder and creates a remote repository. Account and name checks happen before initialization. A later provider race, network failure, or failed push can leave the local commit and remote in place. Recovery after initialization is currently manual: inspect the provider account, open the preserved local repository, and configure the appropriate remote/credentials before retrying synchronization. The publishing dialog does not automatically resume an existing repository. [The runtime ADR](docs/adr/0001-native-git-runtime.md) describes this boundary.

## Repository layout

```text
branchline/
├── src/
│   ├── main.tsx                       # React entry point
│   ├── App.tsx                        # Desktop workspace and view composition
│   ├── styles.css                     # Tailwind and application design tokens
│   ├── components/
│   │   ├── publish/
│   │   │   ├── DropzoneToGitHub.tsx     # Folder-to-provider publishing flow
│   │   │   └── publish.css             # Publishing dialog and step presentation
│   │   ├── DiffViewer.tsx              # Monaco diff surface
│   │   ├── HistoryGraph.tsx            # Commit graph and guarded drag previews
│   │   ├── GlassBox.tsx                # Equivalent CLI operation log
│   │   ├── CommandPalette.tsx          # Progressive disclosure with Ctrl/Cmd+K
│   │   ├── ui/                        # Source-owned shadcn-style primitives
│   │   └── registry/
│   │       ├── skiper/                 # Source-owned animated inputs/drop surfaces
│   │       └── vengeance/              # Source-owned animated tooltip surfaces
│   ├── hooks/useRepository.ts         # Native IPC, event lifecycle, demo boundary
│   └── lib/
│       ├── types.ts                    # Frontend DTOs and operation types
│       ├── console.ts                  # Command token explanations
│       ├── demo.ts                     # Explicit browser preview fixture
│       └── utils.ts                    # Component utilities
├── src-tauri/
│   ├── src/main.rs                    # Desktop binary entry point
│   ├── src/lib.rs                     # Tauri builder, state, and command registration
│   ├── src/git_engine.rs              # libgit2 operations and repository state
│   ├── Cargo.toml                     # Rust dependency manifest
│   ├── tauri.conf.json                # Window, bundle, and CSP configuration
│   ├── capabilities/                 # Native access granted to the main window
│   └── build.rs
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPENDENCIES.md
│   ├── VERIFICATION.md
│   └── adr/0001-native-git-runtime.md
├── components.json                    # shadcn CLI paths and component conventions
├── scripts/
│   ├── verify-ui.mjs                  # Browser interactions and mocked IPC contracts
│   └── verify-native.mjs              # Prepared real-WebView IPC smoke check
├── artifacts/                         # Recorded reports and review screenshots
├── package.json
├── PRODUCT.md
└── DESIGN.md
```

Registries contain reviewed component source and attribution. The Skiper directory contains the actual free TextRoll source adaptation, credited in the application, alongside a project-owned kinetic modal. Vengeance AnimatedButton and tooltip adaptations preserve their MIT notices. [Dependency rationale](docs/DEPENDENCIES.md) explains these choices.

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
```

The runner uses Microsoft Edge when available on Windows; otherwise install Playwright's Chromium with `npx playwright install chromium`. Set `BRANCHLINE_TEST_URL` to test a different development-server URL. Reports and screenshots are written to `artifacts/`.

The first publishing flow accepts an unversioned folder and GitHub.com or GitLab.com personal access tokens. It rejects existing/nested repositories, obvious credential files, individual files above 50 MiB, and scans above 100,000 files. Publishing credentials are restricted to the selected provider's HTTPS host and checked again at each credential request. Subsequent synchronization uses libgit2's existing SSH-agent/default credential support; operation-scoped publishing tokens are not retained for later pushes. Pull is fast-forward only and refuses dirty or divergent state. Text diffs currently require UTF-8 and are limited to 2 MiB per file.

A file with staged and unstaged changes appears in both groups, with a separate diff for each version. File counts use unique paths. The detached-HEAD Guardian can create a new rescue branch without changing working files; merge/rebase conflicts must currently be completed outside the app.

## Architecture boundaries

Git commands shown in the console are explanations of `git2` calls. The application does not execute those strings or spawn a Git child process. Git hosting uses `reqwest` HTTPS requests. Tokens must never appear in command strings, events, errors, persisted app state, or credential-bearing remote URLs.

Native work executes off the UI runtime; mutations are serialized so status refreshes and filesystem events cannot race index changes. `notify` invalidates repository snapshots, with refresh coalescing instead of one full scan per filesystem event. These choices avoid process startup overhead but do not imply every Git operation, large diff, filesystem scan, or network request takes less than a millisecond.

Read the [architecture](docs/ARCHITECTURE.md) and [runtime ADR](docs/adr/0001-native-git-runtime.md) before adding native commands or advanced history mutation.

## After user verification: Brag

The requested Brag plugin installation is deliberately deferred until the user verifies this milestone. The installed Codex CLI's read-only help confirms these command forms:

```powershell
codex plugin marketplace add latent-spaces/brag
codex plugin add brag@brag
```

After adding the marketplace, check its reported name before using the second selector. No marketplace registration or plugin installation is part of this milestone's implementation checks.
