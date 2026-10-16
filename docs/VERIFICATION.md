# Verification and handoff

Use this checklist to assess the first milestone. Record actual command results in the implementation handoff; unchecked items here are not evidence that they passed.

## Automated checks

```powershell
npm run check
npm run test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

The frontend production build verifies bundled TypeScript and Monaco assets. Rust tests should use temporary repositories and verify observable index/commit behavior rather than mirroring internal function calls. Native platform dependencies can block a Rust build before tests run; report that limitation explicitly.

Useful focused engine coverage includes initial repository state, stage/unstage including deletions, commit parent/identity behavior, invalid paths, secret-file rejection during automatic publishing, command redaction, and progress/result correlation. Do not count a unit test of a fixture as proof of provider integration.

## Desktop checks

| Check | Expected result |
| --- | --- |
| Open an existing local repository | Native branch, files, history, and selected diff replace the browser fixture. |
| Edit a tracked file outside the app | Coalesced watcher refresh displays the changed file without repeated reloads. |
| Stage and unstage a file | Index state changes and the console shows the corresponding equivalent command. |
| Commit staged files | A new commit appears; unstaged content is preserved. |
| Native folder drop | One publishing dialog opens with the correct native folder path. |
| Publish a disposable folder | Initialize, commit, provider creation, remote configuration, first push, and upstream complete in sequence. |
| Reject provider credentials | The operation fails visibly without printing or persisting the token. |
| Fail the first push | The local commit and created remote remain; completed steps and recovery context are visible. |
| Switch repositories during refresh | Stale data from the old repository does not replace the new selection. |
| Keyboard-only navigation | Focus remains visible and dialogs restore focus on close; Ctrl/Cmd+K works. |
| Reduced motion | Information and progress remain available without spatial animation. |
| History drag preview | A proposed squash/rebase is explained; unimplemented mutation cannot execute. |

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
