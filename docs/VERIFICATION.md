# Verification and handoff

Use this checklist to assess the first milestone. Record actual command results in the implementation handoff; unchecked items here are not evidence that they passed.

## Recorded results: October 16, 2026

### Kinetic redesign

The user-requested redesign is recorded in [the redesign browser report](../artifacts/redesign-browser-report.json): **20 checks passed, zero browser errors, zero provider requests**. It verifies actual Skiper/Vengeance source integration, animated focus mode and its keyboard restore, staging/commit behavior, history gestures, publishing previews, transient credentials through mocked native IPC, and full dialog-title/close-button geometry at 320px and 390px.

The updated [workspace](../artifacts/redesign/desktop-working-directory.png), [focus mode](../artifacts/redesign/desktop-focus-mode.png), [history](../artifacts/redesign/desktop-history.png), and [publishing dialog](../artifacts/redesign/desktop-publish.png) capture the new lime/violet interface. The check runner now writes new evidence into `artifacts/redesign/` and preserves the first milestone's screenshots separately. The frontend TypeScript/unit checks and production build also pass. The native Git engine was unchanged by this design pass; live provider publishing remains outside browser verification.

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

The [native report](../artifacts/native-report.json) records three real WebView checks: opening this workspace through Rust IPC and reading its branch/history, staging then unstaging a temporary test file while preserving its working content, and rendering Rust-generated command events in the native console. The [native smoke script](../scripts/verify-native.mjs) targets a prepared development instance with WebView2 inspection on loopback; it is separate from the browser fixture suite. Native folder selection, native drag/drop, and live GitHub/GitLab publication still require manual verification; no live provider publication is claimed.

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

Start the development server with `npm run dev` in another terminal, then run `npm run test:ui`. The default URL is `http://127.0.0.1:1420`; override it with `BRANCHLINE_TEST_URL` when needed. The runner uses installed Microsoft Edge on Windows when available and otherwise Playwright's Chromium (`npx playwright install chromium`). It writes `artifacts/browser-report.json` and screenshots under `artifacts/screenshots/`.

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
