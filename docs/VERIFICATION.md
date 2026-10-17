# Verification and handoff

Use this checklist to assess the application. Record actual command results in the implementation handoff; unchecked items here are not evidence that they passed.

## Windows beta 1: October 17, 2026

All six version values are **1.0.0-beta.1**. The locked Tauri release build produced the Windows x64 executable and current-user NSIS installer. The actual executable reports the beta version; both files are **NotSigned**. Native identifiers and the credential-store service are unchanged.

The fresh beta checks passed: **73 frontend unit tests**, **34 Rust tests**, Rust formatting, strict Clippy, the production frontend build, and **12 production startup browser groups**. `npm audit --omit=dev` reported zero vulnerabilities. The browser captures and WebM use explicit fixtures. A tracked-text scan found no credential or private-repository metadata patterns; this is a bounded scan, not a guarantee of exhaustive secret detection.

The [five packaged runtime checks](../artifacts/releases-native-report.json) verified the actual **1.0.0-beta.1** version, shared OAuth configuration, restored account, SVG branding, Monaco worker, and production CSP. The [six native startup checks](../artifacts/startup-native-report.json) passed with natural completion in **1770ms** and Escape dismissal in **38ms**. Runtime, console, security, and blocked-CSP error counts were zero. Native screenshots were skipped for the connected account.

[Actual GitHub repository controls](../artifacts/release/live-github.json) loaded **78 repositories: 51 public and 27 private**, without reauthorization. Visibility counts, Name A–Z sorting, exact search, clearing search, and focus restoration passed. The app is left connected on Home, with All and Recently updated restored. The evidence contains counts and booleans only.

The [GitHub beta draft](https://github.com/imranelak1/GitSomething/releases/tag/untagged-2f47f6bf32e6b0007076) contains **15 assets**: the NSIS installer, application executable, notes, brand exports, manifest, and checksums. The annotated `v1.0.0-beta.1` tag and manifest identify tested source commit [`521f4e6`](https://github.com/imranelak1/GitSomething/commit/521f4e6bdc0a8a917ad613862b88233ca9f03589). [Independent local verification](../artifacts/release/beta-local-assets.json) checked the Windows x64 PE, embedded shared public OAuth configuration, and all 14 checksum entries. [Remote verification](../artifacts/release/beta-remote-assets.json) matched all 15 uploaded names, sizes, and server-reported SHA-256 digests. It also verified the tag target, private repository, and draft/prerelease flags.

The new [Windows workflow](CI.md) repeats locked code checks on GitHub, supports optional manual candidate builds, and never publishes releases. Its [first remote run](https://github.com/imranelak1/GitSomething/actions/runs/39048220023) passed locked dependency installation, TypeScript/unit tests, the production frontend build, Rust formatting/tests, and strict Clippy against the exact tagged source on Windows Server 2022, Node.js 22.21.0, and Rust 1.95.0. The optional manual installer/staging/upload steps were skipped as intended for a push run. The [CI proof](../artifacts/release/beta-github-checks.json) and [beta preparation report](../artifacts/beta-release-preparation-report.json) record the exact source and results.

Installer installation/uninstallation and live GitHub repository publication/pushing remain unverified; this candidate is an unsigned Windows x64 preview in a private **draft prerelease**.

## Startup animation: October 17, 2026

Added a finite startup composition inspired by the supplied AnimMaster catalog and Motion documentation, using the project's actual Skiper TextRoll and Vengeance button. A blue commit path draws around the original prompt cat, its face blinks, the wordmark arrives, and the near-black veil reveals Home. App and account restoration mount immediately beneath an inert wrapper. The intro does not represent loading or a Git operation.

The [12-group production browser suite](../artifacts/startup-report.json) passed after one combined review and fix batch. It covers natural completion, concurrent account restoration through a deferred native fixture, focus containment and handoff, pointer/keyboard skipping, initial and changed reduced motion, hidden-page cleanup, no replay during navigation, no Glass Box activity, and a mocked native folder drop preserving dialog focus. Desktop, 390px, 320px, and short landscape layouts passed. The fixes use fill-box-relative SVG pivots to keep the blink and node pulse anchored and hide the outgoing startup wordmark layer to remove a transient descender fragment. Geometry checks verify the face, neck pivot, and branch node at 170px, 100px, and 32px. The browser suite reported zero errors and zero provider requests.

The [actual packaged native startup smoke](../artifacts/startup-native-report.json) passed **six checks**: mounted/inert Home while the intro owns focus, finite completion in **1779ms**, immediate Escape dismissal in **25ms**, Home focus restoration, no replay during explicit demo/Home navigation, and preserved GitHub connection. Runtime, console, security, and blocked-CSP error counts were all zero. This evidence contains only booleans and timings; no screenshots or private repository metadata.

The final locked Tauri NSIS build and TypeScript passed; all **73 frontend unit tests** passed. The [five-check packaged runtime smoke](../artifacts/releases-native-report.json) again verified version, shared OAuth configuration, SVG branding, Monaco's bundled worker, and the production CSP. [Connected-account controls](../artifacts/release/live-github.json) again loaded **78 repositories**, with working counts, visibility filters, search, clear/focus, and name sorting, without reauthorization. Private names and URLs were not recorded; the native screenshot safeguard stayed enabled.

The [WebM preview](../artifacts/startup/startup-intro.webm), [contact strip](../artifacts/startup/startup-contact-strip.png), and [desktop/mobile captures](../artifacts/startup/) use explicit fixtures or signed-out browser views. Run `npm run test:startup` against the fixed production preview at port 1431. The intro normally ends around 1.6 seconds and has a 2300ms fallback; Skip, Escape, Enter, reduced motion, or hiding the document can dismiss it sooner. It does not start OAuth, publish a repository, run Git, or wait for the network. Installer installation/uninstallation and live publishing/pushing remain unverified; the Windows alpha remains unsigned and its release remains a draft.

## Windows alpha, animated branding, and connected repositories: October 17, 2026

The **0.1.0-alpha.1** Windows x64 executable and NSIS installer were rebuilt with the shared GitSomething OAuth registration, original prompt-cat artwork, a finite Motion animation, and the improved repository list. The app restores the already approved account from the Windows credential store. There are no Client ID or access-token inputs for installed users.

The actual rebuilt application loaded **78 repositories on its first page**, including **51 public and 27 private**. All/Public/Private controls matched their displayed counts; Name A–Z sorting worked; searching one loaded full name returned one row; clearing search restored all rows and keyboard focus. No reauthorization or repository error occurred. Controls were returned to All and Recently updated. The [live proof](../artifacts/release/live-github.json) contains counts and booleans only: no repository names, private URLs, screenshots, tokens, device codes, or account identity. The earlier candidate also verified explicit pagination and restoration after a complete application restart. The final candidate's startup independently restored the same credential.

| Check                                                                  | Result                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                                        | TypeScript and all **73** unit tests passed                                                                                                |
| Locked Tauri Windows NSIS build                                        | Passed; frontend production build and Rust release compilation completed                                                                   |
| [Repository browser](../artifacts/github-repositories-report.json)     | **17** groups passed against the final production preview; explicit provider fixtures                                                      |
| [Logo motion](../artifacts/brand-motion-report.json)                   | **11** groups passed; finite rest pose, real hover, blink/trace, replay, cleanup, runtime and initial reduced motion, and offline controls |
| [Actual packaged native app](../artifacts/releases-native-report.json) | **5** groups passed; version, configured account metadata, SVG mark, bundled Monaco worker, production CSP                                 |
| Live connected repository controls                                     | Passed; actual account/API reads, local filters/search/sort, counts-only evidence                                                          |
| Executable and installer signatures                                    | Both **NotSigned**, accurately labeled unsigned alpha                                                                                      |

The [motion preview](../public/brand/gitsomething-logo-preview.html) is self-contained and works offline. [Desktop/mobile captures, actual 16–128px samples, and a motion contact strip](../artifacts/brand-motion/) show the new mark. Browser captures use signed-out or explicit fixture data. The native harness skips screenshots whenever the actual account is connected. Final runs reported no browser/runtime errors, no blocked production CSP requests, and no provider traffic from fixture suites. Actual GitHub reads were limited to the already authorized native account.

The browser list now requests up to 100 repositories per page, with explicit Load more for larger accounts. Search, visibility, and sorting operate on loaded metadata, with a hint while more pages remain. Those controls stay out of the Glass Box; the real repository request remains visible there. Private metadata is not persisted by the browser feature.

The backend Git/auth implementation is unchanged in this refinement; its earlier **34 Rust tests** and locked checks remain recorded below. Installer installation/uninstallation and live remote publication/pushing are **not verified**. Only Windows x64 was built; generated icon sources do not imply releases for other platforms. Advanced alpha limitations remain in [the release notes](releases/v0.1.0-alpha.1.md). The prepared GitHub release stays an unpublished draft until user review. Remaining sections record earlier milestones and their evidence.

## Direct GitHub sign-in: October 17, 2026

The user flow is now **Sign in with GitHub → browser approval → repositories**. Home, the account launcher, and the GitHub command open a focused account dialog and immediately start authorization when the native build is configured. A successful new sign-in closes that dialog automatically and preserves the current Home/workspace screen. Account management remains available for an existing connection. The four-step learning guide is separate and optional; opening sign-in no longer enters it. Escape restores focus and cancels a pending authorization safely.

Registration instructions, Client ID inputs, and their frontend context methods and native setup commands are removed. The publisher supplies GitSomething's public OAuth Client ID once through the build environment or the project's ignored `.env.local`; the build script reads only that named public setting. A release build rejects missing or invalid configuration. Installed applications use the embedded registration rather than a per-user override. Unconfigured debug builds preserve local Git features and show a disabled sign-in action with a development-build explanation. Existing local configuration is retained only as a debug compatibility fallback.

TypeScript and **71 frontend unit tests**, **34 Rust tests**, locked Cargo checking, formatting, the frontend production build, and the native debug build passed. Five build-script scenarios also verified missing release configuration, local-debug availability, public-only dotenv parsing, source precedence, and invalid-value redaction. At that earlier debug milestone, a live account had not yet been authorized; the final packaged release verification above supersedes that configuration boundary. [Maintainer configuration](GITHUB_AUTH.md#maintainer-configuration-before-distribution) is separate from the end-user instructions.

The final [15 GitHub repository/sign-in checks](../artifacts/github-repositories-report.json), [16 onboarding checks](../artifacts/studio-onboarding-browser-report.json), and [17 terminal-scope checks](../artifacts/terminal-scope-report.json) passed: **48 browser groups**, zero browser errors and zero provider requests. They cover a single Home click starting authorization, no learning-guide detour, automatic dismissal, focus restoration, cancellation, delayed initial account status, closing before that status returns, reconnection, denial/expiry, minimum polling intervals, repository pagination, and isolation of private metadata. Account/provider responses are explicit browser fixtures. The focused dialog was reviewed at desktop and mobile widths; [the Home approval capture](../artifacts/github-repositories/home-github-approval.png) records the direct path.

Four [actual rebuilt native checks](../artifacts/github-repositories-native-report.json) also passed. They verify credential-free status, removal of the old registration/configuration IPC commands, rejection of unauthenticated repository reads and unsafe destinations, and a focused development sign-in dialog with no registration or Client ID controls. The native smoke uses no provider requests or Git mutations. The disabled development state is intentional until the publisher supplies the real shared app identifier; none was fabricated for testing.

## Previous owner setup design and repository browsing: October 17, 2026

The in-app owner configuration described in this previous milestone was superseded by publisher-only build configuration above.

The desktop connection panel now offers one-time OAuth App registration instructions and saves the owner's public Client ID in the native application configuration directory. Device Flow approval remains a separate user action. No GitHub access token or client secret is requested in the interface. Once connected, Home loads the account's public, private, and shared repositories through authenticated Rust HTTP requests. The list appears directly beneath Home's primary actions, scrolls independently, supports pagination and filtering of loaded metadata, and opens trusted GitHub pages in the system browser. Disconnecting or changing accounts clears the visible list and invalidates late responses. Only actual provider reads enter the Glass Box; filtering and browser navigation remain silent.

TypeScript and all **71 frontend unit tests** passed. All **29 Rust tests**, locked Cargo checks, formatting checks, the frontend production build, and the native debug build passed. Rust coverage includes bounded provider responses, pagination, safe URLs, HTTP authorization/rate/SSO failures, public-only configuration, and stale credential rejection. The existing Monaco bundle-size warning remains.

The [14 GitHub setup and repository browser checks](../artifacts/github-repositories-report.json), 16 OAuth/onboarding checks, 24 general UI checks, and 17 terminal-scope checks passed: **71 browser groups**, with zero browser errors and zero provider requests. Provider responses and authorization in these browser checks are explicit native IPC fixtures. The final combined visual review confirmed readable repository rows and reachable owner setup at desktop, 390px, and 320px; the signed-in list is visible immediately beneath the primary actions. [Screenshots](../artifacts/github-repositories/) record the result. Run `npm run test:github-repositories` against the fixed production preview on port 1431.

Four [actual rebuilt Tauri WebView checks](../artifacts/github-repositories-native-report.json) passed for credential-free status, owner guidance, rejection of token-shaped setup input, unauthenticated repository reads, unsafe browser destinations, and native rendering/input validation. Run `node scripts/verify-native-github-setup.mjs` against an unconfigured desktop session with WebView2 CDP on loopback port 9223. This smoke writes no valid Client ID, changes no saved credentials, and performs no provider or Git operation.

**The owner still needs to register GitSomething, enable Device Flow, save its real public Client ID, and approve sign-in.** Automated fixtures do not establish live consent, a real repository list, credential-store persistence, or a remote push. [The owner setup guide](GITHUB_AUTH.md) describes those manual steps. The app is ready for that setup; no fake registration or GitHub CLI credential was substituted.

## Git and GitHub operations only: October 17, 2026

The Glass Box now contains actual Git logs, guided commands and their output, repository-operation failures, and explicit GitHub authentication or publishing events. The global click/select recorder is removed. Interface requests are discarded before entering the history buffer, and lesson requests only drive the separate teaching panel. Resizing, scrolling, navigation, settings, copying, panel controls, and slider gestures do not create transcript rows. A genuine Git read triggered by reviewing a file remains a Git operation.

The filters are **All operations**, **Commands**, and **Events**. Account and publishing events settle one row from running to success or error. Credentials are redacted, and private authorization codes or session data never enter those rows. Publishing errors remain available after dismissing their dialog. Actual command tokens retain their explanations and operation results.

TypeScript, all **68 unit tests**, and the frontend production build passed. The [17 focused scope checks](../artifacts/terminal-scope-report.json) passed at desktop, 390px, and 320px, including exact transcript and copied-text equality across interface interactions, command safety, Git operations, preflight failures, publication lifecycle, and GitHub sign-in/disconnect fixtures. The 17 teaching-terminal and 24 general UI checks also passed. Browser checks use explicit native IPC fixtures for provider operations and make no real provider requests. [Screenshots](../artifacts/terminal-scope/) show the filtered transcript and operation statuses. Run `npm run test:terminal-scope` against the fixed production preview on port 1431.

The full 16-check OAuth/onboarding suite also passed against the fixed production preview, including cancellation, late polling, denial, expiry, retry, and credential boundaries. All **74 browser checks** reported zero browser errors and zero provider requests.

Two [actual native WebView checks](../artifacts/terminal-scope-native-report.json) also passed: reversible pane controls and navigation leave the transcript unchanged, while a guided Git command still adds its result. This smoke used the explicit demo and performed no native Git mutation or provider request.

## Roomier workspace: October 17, 2026

The workspace now follows the content hierarchy of macOS document tools: a collapsible repository sidebar, resizable changed-files pane, commit form beneath the files, and a continuous full-height diff. The large workspace masthead and duplicate activity rail no longer consume the review canvas. The recent-commit journey lives in History. Teaching tips open over the workspace, the Glass Box lesson inspector starts closed, and the terminal uses a smaller 180px fresh preference while retaining saved settings. Very short windows start with the terminal collapsed; opening it keeps file selection, staging, and commit controls visible. Repository navigation has independent scrolling.

| Viewport                             | Previous code height | Current code height             |
| ------------------------------------ | -------------------- | ------------------------------- |
| 1440 × 1000                          | 67px                 | 434px                           |
| 1280 × 800                           | 80px                 | 242px                           |
| 1440 × 650, initial view             | 80px                 | 313px                           |
| 1440 × 650, terminal explicitly open | Previously clipped   | 153px, fully above the terminal |

The frontend production build, TypeScript, and all **67 unit tests** passed. **86 browser checks** passed: nine [workspace layout checks](../artifacts/workspace-layout-report.json), 24 general UI, 13 Home/terminal-preference, 17 teaching-terminal, and 23 push-slider checks. These cover real pane geometry, pointer and keyboard resizing, interrupted-drag rollback, remembered widths, malformed preferences, sidebar visibility and focus, the 320px/390px layouts, and existing Git action contracts. The mobile code pane is 196px tall and its controls remain reachable through the workspace's scroll region. Browser checks reported zero errors or provider requests; native push/publish requests in existing contract suites remain fixtures. The Rust Git engine is unchanged.

[Before/after screenshots and measured geometry](../artifacts/workspace-layout/) show the changed layout. [DESIGN.md](../DESIGN.md) records the official Apple Layout, Split Views, Sidebars, and WWDC inspector/AppKit references and their application to this web interface. Run `npm run test:workspace` against the fixed production preview on port 1431 to repeat the focused checks.

The [actual native WebView smoke](../artifacts/workspace-layout-native-report.json) passed three checks for the full-height canvas, keyboard pane resizing/restoration, and sidebar visibility without losing the selected diff. Its code viewport measured 434px tall. This smoke used the explicit demo and performed no Git or provider mutation; the desktop app is left in that workspace for review.

## GitSomething rename: October 17, 2026

Renamed the app, welcome guide, educational and authentication copy, document title, icon asset, npm package, Rust crate/binary, Tauri product/window metadata, and project documentation to **GitSomething**. The private project repository is now [imranelak1/GitSomething](https://github.com/imranelak1/GitSomething); the local remote points to the new URL. Compatibility identifiers remain stable so saved preferences and GitHub credentials stay available.

TypeScript, all **67 unit tests**, the frontend production build, `cargo check --locked`, and `cargo build --locked` passed. [Targeted browser verification](../artifacts/rename-report.json) confirmed the longer name, icon, page title, Home and guide at 1440px, 390px and 320px, with zero browser errors or provider requests. The [rebuilt native application](../artifacts/rename-native-report.json) opened on Home with the GitSomething wordmark and window title, without WebView errors. [Screenshots](../artifacts/rename/) show the current branding. Previous milestone artifacts remain historical evidence.

## Push confirmation sliders: October 17, 2026

Both visual push actions now require a deliberate slider confirmation: the workspace's **Slide to push** and publishing's final **Slide to create & push**. The control uses GitHub green, a directly dragged handle, a short return spring, reduced-motion behavior, explicit keyboard confirmation, and an educational Vengeance tooltip. Enter in a publishing text field cannot bypass confirmation. Context changes reset an armed slider without exposing credentials.

The production build and TypeScript passed, along with all **67 unit tests**. The latest browser run passed **77 checks**: 23 dedicated slider checks, 24 general UI checks, 17 learning-terminal checks, and 13 Home/terminal-preference checks. The final slider confirmation pass also verified that notifications do not cover the control and the complete publishing footer fits its scrollable dialog.

[Slider report](../artifacts/push-slider-report.json) and [six desktop/mobile screenshots](../artifacts/push-slider/) cover pointer and touch release, early cancellation, track clicks, keyboard arming versus confirmation, interruption and resizing, duplicate prevention, pending operations, errors and retries, publication validation, account gating, context reset, and credential-free GitHub IPC. Native push/publish operations in this browser suite are explicit fixtures; no live remote was created or pushed. The browser suites reported zero browser errors or provider requests. The existing Monaco chunk-size warning remains.

Run `npm run test:push-slider` against the production preview on port 1431 to repeat the focused checks. The existing native Git engine is unchanged by this UI update.

A separate [three-check native smoke](../artifacts/native-push-slider-report.json) passed in the actual Tauri WebView: workspace keyboard arming/cancellation, presence of the final publishing slider, and returning to Home without WebView errors. This smoke used the demo workspace and performed no Git network or provider operation. The desktop app is left on Home for review.

## Home and adjustable terminal: October 17, 2026

Home is the initial route, with no automatic guide overlay and no Monaco mount until a workspace is entered. Actual local repository metadata populates recents only after a successful open. The workspace stays mounted but hidden and inert when returning Home, preserving its in-memory commit draft, selection, active view, and terminal session.

The terminal has pointer and keyboard resizing, local height/font preferences, a 12–18px type control, and reset/expand behavior. The keyboard separator supports Up/Down, Shift for smaller steps, and Home/End. Preference validation and recent-repository metadata tests cover malformed or blocked storage, bounded lists/settings, Windows path deduplication, and removal without filesystem mutation. `npm run check` passed TypeScript and **67 unit checks**; the production build passed with the existing Monaco chunk-size warning.

The browser entry helpers now explicitly choose the demo or guide from Home. [The Home/terminal report](../artifacts/home-terminal-report.json) records fresh launch, guide and publishing entry, workspace preservation, resizing, font persistence, responsive layouts, and mocked native open/recents contracts. The native route fixture is limited to browser contract verification; it does not prove filesystem access. [The separate native report](../artifacts/learning-native-report.json) exercises the actual Rust engine with the previously documented picker-only fixture boundary.

| Current checks                 | Result                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Home and adjustments           | 13 groups passed, no geometry issues, browser errors, or provider calls.              |
| Guided terminal                | 17 groups passed after the layout fix.                                                |
| Workspace regression           | 24 groups passed after the layout fix.                                                |
| Guide and OAuth fixtures       | 16 groups passed, including explicit Home entry and final guide-to-workspace handoff. |
| Palette and guide presentation | 7 groups passed; 81 sampled text/background combinations met AA.                      |
| Actual native Git terminal     | 8 groups passed, temporary-file cleanup succeeded, no WebView errors.                 |

The total is 77 browser groups plus 8 actual native groups. Browser provider operations use fixtures or explicit demo data; live OAuth consent and remote publication remain outside these checks. The final short-window checks cover both resizing from a larger window and entering the demo directly at 1440×650: Monaco mounts and the input ends at 599px, inside the 650px viewport.

A separate [actual native launch check](../artifacts/native-home-report.json) confirms Home is visible after reloading the WebView, with zero Monaco mounts, zero automatic guide overlays, and the real recent-repository shortcut. The desktop app is left on [Home](../artifacts/home-terminal/native-home.png) for review.

Short windows use the available viewport rather than the previous minimum canvas height, omit the decorative workspace overview, and allow the work area to scroll. The terminal measures its host and reserves 180px for the workspace where possible. This keeps its input reachable while allowing access to files, diffs, and commit controls. Home remains independently scrollable. [Screenshots](../artifacts/home-terminal/) cover the new entry and adjustment surfaces. A separate screenshot review found no material visual defects in the six desktop/mobile Home and adjusted-terminal captures; interaction claims come from the browser checks.

## Current teaching terminal results: October 17, 2026

The Glass Box now records interface requests and settled Git operations, accepts a supported subset of Git commands, and explains the workflow in separate purple teaching surfaces. See [the terminal guide](GLASS_BOX.md) for syntax and behavior.

The readability refinement uses 13px Geist Mono for commands, output, and input, 12px action labels, and readable 10px metadata. Output has a brighter foreground, a stable dark reading surface, and guides that connect each command to its results. The production build and all 17 terminal browser interaction checks passed again. [Desktop, 390px, and 320px measurements](../artifacts/terminal-clarity-report.json) confirm the reading scale and no horizontal document overflow. Conservative contrast across the terminal's background colors is at least 10.71:1 for output, 14.05:1 for input, and 5.25:1 for metadata. Reference choices are recorded in [the design system](../DESIGN.md#glass-box-readability); visual proofs are in [terminal clarity](../artifacts/terminal-clarity/). This pass changes presentation only; prior unit and native Git evidence below remains applicable.

| Check                          | Result                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                | TypeScript and 59 unit checks passed, including command parsing, rejected shell/destructive syntax, exact file-version selection, operation errors, output limits, and activity credential redaction.                                                        |
| `npm run build`                | Passed. Monaco remains a separate large chunk with the existing size warning.                                                                                                                                                                                |
| Guided terminal browser checks | [17 checks passed](../artifacts/learning-browser-report.json): typed reads, stage/unstage/diff/commit, rejection without mutation, action filters, command history, clear, scroll following, lessons, portal buttons, mobile layouts, and reduced motion.    |
| Actual native guided terminal  | [Eight checks passed](../artifacts/learning-native-report.json), with zero WebView errors: real status/history/branch reads, filesystem watching, actual index stage/unstage, Rust diff content, and hard-reset rejection preserving HEAD and file contents. |

Native verification substitutes only the folder-picker IPC response with this workspace path. Tauri's native invoke and every other request remain real. It creates one unique temporary file, verifies its exact content after stage/unstage, cleans up only that file, and leaves GitSomething open. It does not test native picker interaction, commits, remote Git operations, OAuth consent, or provider publication. The Rust implementation is unchanged in this milestone; the existing Rust engine tests remain prior evidence.

The final layout makes the mobile workspace independently scrollable so files, Monaco, and the commit composer stay reachable beside an open terminal. Lesson handoffs collapse the top tip, returning space to the editor. Notifications sit above the workspace instead of covering command input. Screenshots are in [the learning proof directory](../artifacts/learning/).

## GitHub palette regression results: October 17, 2026

The interface retains GitHub's dark palette with purple teaching content. The following workflow and palette checks were rerun against the final teaching-terminal production build. Shared semantic colors live in `src/theme.css`; [the design system](../DESIGN.md) records the palette and educational intent.

| Check                                  | Result                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                        | TypeScript and 59 frontend unit checks passed.                                                                                        |
| `npm run build`                        | Production build passed.                                                                                                              |
| Native debug build                     | Previous build retained; Rust and native dependencies are unchanged. The current frontend was exercised in the actual native WebView. |
| Production workflow suite              | 24 checks passed, zero browser errors or provider requests. [Report](../artifacts/github-dark-browser-report.json).                   |
| Focused palette and presentation suite | 7 checks passed, zero browser errors or provider requests. [Report](../artifacts/github-dark-palette-report.json).                    |

The production suites ran against `http://127.0.0.1:1431`. The focused runner sampled **81 text/background combinations**, all meeting WCAG AA. Primary button text measured at least **4.63:1**, the empty checkbox boundary **3.26:1**, the sampled control icon **4.82:1**, and keyboard focus **6.85:1**. It checks the workspace, first-use guide, practice, browser publishing/progress, and mocked device-code presentation at desktop, 320px, and 390px widths.

The batched review found no clipping, overflow, or contrast defects. [Workspace](../artifacts/github-dark/desktop-working-directory.png), [guide](../artifacts/github-dark-guide/1440-welcome.png), and [320px GitHub approval](../artifacts/github-dark-guide/320-device-code.png) show the final palette. The small educational changes describe what staging selects, distinguish local commits from pushing, and explain Push through the existing accessible tooltip.

To reproduce, build first, start `npm run preview -- --port 1431`, set `BRANCHLINE_TEST_URL=http://127.0.0.1:1431`, and run `npm run test:ui` and `node scripts/verify-palette.mjs`. This pass changes presentation and teaching copy; the engine and OAuth implementation are unchanged. Live OAuth, credential-store round trips, and provider pushes remain outside these browser tests. Prior backend and native IPC proof is retained below.

## Previous Studio results: October 16, 2026

The Studio redesign replaces the previous lime/violet palette with an ink editor, warm paper panels, cobalt navigation, coral project creation, butter-yellow committing, and mint success states. Motion for React powers the actual SVG, layout, spring, and gesture interactions. [Source ownership](MOTION_SOURCES.md) distinguishes original AnimMaster-inspired components from the paid catalog.

| Check                                              | Studio result                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                    | TypeScript and 2 frontend unit tests passed.                                                                                                              |
| `npm run build`                                    | Final production bundle passed. Monaco remains a separate local chunk.                                                                                    |
| `cargo build --manifest-path src-tauri/Cargo.toml` | Native debug build passed with the updated application icon.                                                                                              |
| Workspace browser verification                     | 24 checks passed, zero browser errors and zero provider requests. [Report](../artifacts/studio-browser-report.json).                                      |
| Guide and consent verification                     | 16 checks passed on the production preview, zero browser errors and zero provider requests. [Report](../artifacts/studio-onboarding-browser-report.json). |
| Real native WebView/Rust smoke                     | 5 checks passed, zero errors. [Report](../artifacts/studio-native-report.json).                                                                           |

The final visual batch covered the [workspace](../artifacts/studio/desktop-working-directory.png), [history ledger](../artifacts/studio/desktop-history.png), [focus mode](../artifacts/studio/desktop-focus-mode.png), [illustrated guide](../artifacts/studio-onboarding/desktop-welcome.png), and narrow publishing/auth layouts. The confirmation fixed a clipped sidebar action, preserved visible mobile preview headers by resetting dialog scroll on screen changes, and corrected SVG path scaling in the expanded focus graph. HEAD is checked against a fixture where the current branch target is the second commit rather than the newest row.

Consent uses native IPC mocks rather than real credentials. The guide suite verifies first launch, practice, persistence, replay, focus restoration, reduced motion, cancellation, denial, expiry, interrupted transport, late approvals, connected identity, and credential-free publishing IPC. Measured frontend polling gaps were **5018 ms** before the first poll, **5002 ms** after pending, and **10004 ms** after slow-down. A 320px regression scrolls setup to the bottom before submitting and confirms progress restores the header at scroll position zero.

The native smoke reads the actual repository, changes and restores the index for a temporary file, and receives Rust command events. It checks native account-status serialization and a missing Client ID rejecting sign-in with owner guidance. Live OAuth consent, secure-store round trips, refresh, native folder selection/drop, and actual GitHub publication remain outside this automated proof. The backend engine and OAuth implementation were unchanged in this visual pass; their 18 tests and strict Clippy result below are retained from the preceding milestone.

For stable final browser verification, build first, start `npm run preview -- --port 1430`, then run both suites with `BRANCHLINE_TEST_URL=http://127.0.0.1:1430`. This avoids development hot reload during long consent scenarios. The native smoke still targets the prepared debug WebView on port 9223.

## Previous GitHub sign-in milestone: October 16, 2026

The first-use guide and GitHub OAuth milestone passed these checks. [GitHub sign-in setup](GITHUB_AUTH.md) records the application owner's one-time OAuth registration; this build still needs the owner's Client ID before real account consent is available.

| Check                                                                            | Current result                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                                                  | Passed TypeScript checking and 2 frontend unit tests.                                                                    |
| `npm run build`                                                                  | Passed the production frontend build.                                                                                    |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 18 tests passed.                                                                                                         |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed with warnings denied.                                                                                             |
| Native debug build                                                               | Passed.                                                                                                                  |
| `npm run test:ui`                                                                | 20 checks passed; zero browser errors and zero provider requests. [Report](../artifacts/workflow-browser-report.json).   |
| `npm run test:onboarding`                                                        | 15 checks passed; zero browser errors and zero provider requests. [Report](../artifacts/onboarding-browser-report.json). |
| `node scripts/verify-native.mjs`                                                 | 5 real WebView/Rust IPC checks passed; zero errors. [Report](../artifacts/native-report.json).                           |

The guide suite verifies first launch, local-only continuation, practice file selection/commit/push, completion persistence, replay from Help and the command palette, and Escape returning focus to the account launcher. It checks every guide step at 320px and 390px with reduced motion. The captured [welcome](../artifacts/onboarding/desktop-welcome.png), [practice result](../artifacts/onboarding/desktop-practice-complete.png), and [320px project chooser](../artifacts/onboarding/mobile-320-choose-project.png) were visually inspected for readability and clipping.

The consent checks use mocked native IPC: they verify [one-time code presentation](../artifacts/onboarding/desktop-github-approval.png), [connected account presentation](../artifacts/onboarding/desktop-github-connected.png), denial, expiry, interrupted requests, cancellation, disconnect, and a late poll that cannot reconnect after cancellation. Pending polls respect the five-second interval; a slow-down response raises the next interval to ten seconds. Authenticated publication fills the commit identity and sends an empty GitHub token field. The baseline suite also checks GitLab token clearing, subscription lifecycles, safe result URLs, staging/commit behavior, and responsive publishing.

The current native smoke check proves credential-free auth status, a missing Client ID rejecting sign-in with owner setup guidance, real repository/history reads, stage/unstage preserving working content, and Rust command events reaching the actual WebView. It does not approve GitHub consent or exercise a credential-store round trip. The Rust tests include device polling gates, interval increases, expiry/cancellation, scope normalization, token-response redaction, destination restrictions, and local Git behavior.

Live consent, keychain persistence, token refresh, and GitHub publication remain manual checks requiring a configured owner Client ID and real account approval. Use a disposable project; verify a private initial publication and a later push after restarting the app. Confirm that denied, revoked, or expired access gives a useful reconnect action. Disconnect should remove the local credential while provider-side revocation remains available through GitHub settings. No automated browser result establishes these provider operations.

## Previous milestone evidence

### Kinetic redesign

The user-requested redesign is recorded in [the redesign browser report](../artifacts/redesign-browser-report.json): **20 checks passed, zero browser errors, zero provider requests**. It verifies actual Skiper/Vengeance source integration, animated focus mode and its keyboard restore, staging/commit behavior, history gestures, publishing previews, transient credentials through mocked native IPC, and full dialog-title/close-button geometry at 320px and 390px.

The [workspace](../artifacts/redesign/desktop-working-directory.png), [focus mode](../artifacts/redesign/desktop-focus-mode.png), [history](../artifacts/redesign/desktop-history.png), and [publishing dialog](../artifacts/redesign/desktop-publish.png) capture the lime/violet redesign. At that milestone, the check runner wrote evidence into `artifacts/redesign/` and preserved the first milestone's screenshots separately. The frontend TypeScript/unit checks and production build also passed. The native Git engine was unchanged by that design pass; live provider publishing remained outside browser verification.

| Check                                                                            | Result                                                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run check`                                                                  | Passed TypeScript checking and 2 frontend unit tests.                                        |
| `npm run build`                                                                  | Passed the frontend production build with local Monaco assets.                               |
| `cargo test --manifest-path src-tauri/Cargo.toml`                                | 9 engine tests passed.                                                                       |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Passed with warnings denied.                                                                 |
| Native debug build                                                               | Passed.                                                                                      |
| `npm audit`                                                                      | 0 vulnerabilities after updating Vitest to 5.0.5 and applying the DOMPurify 3.4.17 override. |
| Browser verification                                                             | 17 checks passed, 0 browser errors, 0 provider API requests, and 11 screenshots.             |
| Native WebView IPC smoke                                                         | 3 checks passed against the actual Tauri WebView and Rust engine, with 0 errors.             |

The [browser report](../artifacts/browser-report.json) records the individual checks and screenshot paths. Representative captures show the [working directory](../artifacts/screenshots/desktop-working-directory.png), [history](../artifacts/screenshots/desktop-history.png), and [publishing dialog](../artifacts/screenshots/desktop-publish.png). The browser suite covers real rendering and interactions plus mocked native IPC contracts; it does not prove live provider publication.

The Rust tests cover real temporary repositories, staged/unstaged versions of the same file, commit/diff behavior, publishing preflight, detached-HEAD rescue with working edits preserved, provider-token destination restrictions and hostile push URLs, and fetch/push/fast-forward pull against a local bare remote.

The original native smoke milestone recorded three checks: opening this workspace through Rust IPC and reading its branch/history, staging then unstaging a temporary test file while preserving its working content, and rendering Rust-generated command events in the native console. The current native report extends those checks to five, as recorded above. The [native smoke script](../scripts/verify-native.mjs) targets a prepared development instance with WebView2 inspection on loopback; it is separate from the browser fixture suite. Native folder selection, native drag/drop, and live GitHub/GitLab publication still require manual verification; no live provider publication is claimed.

## Automated checks

```powershell
npm run check
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

The frontend production build verifies bundled TypeScript and Monaco assets. Rust tests should use temporary repositories and verify observable index/commit behavior rather than mirroring internal function calls. Native platform dependencies can block a Rust build before tests run; report that limitation explicitly.

Useful focused engine coverage includes initial repository state, stage/unstage including deletions, commit parent/identity behavior, invalid paths, secret-file rejection during automatic publishing, command redaction, and progress/result correlation. Do not count a unit test of a fixture as proof of provider integration.

Start the development server with `npm run dev` in another terminal, then run `npm run test:ui` and `npm run test:onboarding`. The default URL is `http://127.0.0.1:1420`; override it with `BRANCHLINE_TEST_URL` when needed. The runners use installed Microsoft Edge on Windows when available and otherwise Playwright's Chromium (`npx playwright install chromium`). The baseline runner writes `artifacts/studio-browser-report.json` and screenshots under `artifacts/studio/`; the guide runner writes `artifacts/studio-onboarding-browser-report.json` and screenshots under `artifacts/studio-onboarding/`. Earlier milestone artifacts are retained separately.

## Desktop checks

| Check                               | Expected result                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Open an existing local repository   | Native branch, files, history, and selected diff replace the browser fixture.                               |
| Edit a tracked file outside the app | Coalesced watcher refresh displays the changed file without repeated reloads.                               |
| Stage and unstage a file            | Index state changes and the console shows the corresponding equivalent command.                             |
| Edit a staged file again            | The path appears in both groups with distinct diffs and a single unique-file count.                         |
| Commit staged files                 | A new commit appears; unstaged content is preserved.                                                        |
| Rescue detached HEAD                | A new non-overwriting branch attaches to the current commit without changing working files.                 |
| Native folder drop                  | One publishing dialog opens with the correct native folder path.                                            |
| Publish a disposable folder         | Initialize, commit, provider creation, remote configuration, first push, and upstream complete in sequence. |
| Reject provider credentials         | Account/name preflight fails before initialization, without printing or persisting the token.               |
| Fail the first push                 | The local commit and created remote remain; completed steps and recovery context are visible.               |
| Fail watcher setup after push       | Publication remains successful and explains how to reopen the repository for automatic refresh.             |
| Switch repositories during refresh  | Stale data from the old repository does not replace the new selection.                                      |
| Keyboard-only navigation            | Focus remains visible and dialogs restore focus on close; Ctrl/Cmd+K works.                                 |
| Reduced motion                      | Information and progress remain available without spatial animation.                                        |
| History drag preview                | A proposed squash/rebase is explained; unimplemented mutation cannot execute.                               |

Test provider integration with an explicitly selected disposable folder and a private repository. Delete that test repository only when the person running the test chooses to do so. Never use a production project's first push as an automated smoke test.

## Browser preview

Confirm the demonstration label is visible. Changes, history, diff selection, console tooltips, command palette, responsive layout, and publish-dialog previews should be reviewable without native permissions. A browser preview must not claim it pushed a repository or read a real folder.

Inspect the workspace at common desktop widths and at a narrow window width. Confirm long paths, error messages, and provider progress do not obscure the primary action. Capture the actual interface only after fonts and Monaco have loaded.

## Deferred Brag installation

The user requested plugin installation **after they verify the application**. That condition is still required even though the CLI syntax is valid. The read-only local commands `codex plugin --help`, `codex plugin marketplace add --help`, and `codex plugin add --help` were inspected to establish the available syntax.

After user verification:

```powershell
codex plugin marketplace add latent-spaces/brag
codex plugin add brag@brag
```

Check the marketplace name returned by the first command before choosing the second selector. These commands register external code and install a plugin; do not run them as part of builds, tests, onboarding, or project scripts. A trailing backslash from the original request is not part of the marketplace name or command.
