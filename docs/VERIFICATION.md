# Verification and handoff

Use this checklist to assess the application. Record actual command results in the implementation handoff; unchecked items here are not evidence that they passed.

## Current teaching terminal results: October 17, 2026

The Glass Box now records interface requests and settled Git operations, accepts a supported subset of Git commands, and explains the workflow in separate purple teaching surfaces. See [the terminal guide](GLASS_BOX.md) for syntax and behavior.

The readability refinement uses 13px Geist Mono for commands, output, and input, 12px action labels, and readable 10px metadata. Output has a brighter foreground, a stable dark reading surface, and guides that connect each command to its results. The production build and all 17 terminal browser interaction checks passed again. [Desktop, 390px, and 320px measurements](../artifacts/terminal-clarity-report.json) confirm the reading scale and no horizontal document overflow. Conservative contrast across the terminal's background colors is at least 10.71:1 for output, 14.05:1 for input, and 5.25:1 for metadata. Reference choices are recorded in [the design system](../DESIGN.md#glass-box-readability); visual proofs are in [terminal clarity](../artifacts/terminal-clarity/). This pass changes presentation only; prior unit and native Git evidence below remains applicable.

| Check                          | Result                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                | TypeScript and 59 unit checks passed, including command parsing, rejected shell/destructive syntax, exact file-version selection, operation errors, output limits, and activity credential redaction.                                                        |
| `npm run build`                | Passed. Monaco remains a separate large chunk with the existing size warning.                                                                                                                                                                                |
| Guided terminal browser checks | [17 checks passed](../artifacts/learning-browser-report.json): typed reads, stage/unstage/diff/commit, rejection without mutation, action filters, command history, clear, scroll following, lessons, portal buttons, mobile layouts, and reduced motion.    |
| Actual native guided terminal  | [Eight checks passed](../artifacts/learning-native-report.json), with zero WebView errors: real status/history/branch reads, filesystem watching, actual index stage/unstage, Rust diff content, and hard-reset rejection preserving HEAD and file contents. |

Native verification substitutes only the folder-picker IPC response with this workspace path. Tauri's native invoke and every other request remain real. It creates one unique temporary file, verifies its exact content after stage/unstage, cleans up only that file, and leaves Branchline open. It does not test native picker interaction, commits, remote Git operations, OAuth consent, or provider publication. The Rust implementation is unchanged in this milestone; the existing Rust engine tests remain prior evidence.

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
