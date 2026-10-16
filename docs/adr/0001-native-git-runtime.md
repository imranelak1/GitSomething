# ADR 0001: Native Git runtime, serialized mutations, and explicit recovery

Status: accepted for the first milestone and subsequent native engine work.

## Context

Git index mutation, filesystem refresh, remote transport, and provider API creation can overlap. libgit2 objects borrow their repository, notify callbacks can arrive in bursts, and a publish workflow spans local and remote systems without a shared transaction. A fluid UI requires safe lifetimes and honest partial failure behavior.

## Decision

Use `git2-rs` for every application Git operation and `reqwest` for provider APIs. Do not invoke `git`, a shell, or a third-party Git process from the application. The Glass-Box log is a redacted explanatory representation of a native operation, not executable output.

Run blocking libgit2 and disk work inside a blocking worker. An async Tauri command alone does not make blocking C code asynchronous. Move owned request data into the worker, create and drop repository handles there, and return owned serializable values. Async provider calls may use the async runtime; do not hold a blocking mutex guard across an `.await`.

Serialize mutations per repository using the implemented async gate keyed by canonical worktree root. An operation covers all steps that must not interleave, including provider requests during publishing; a short mutex for individual data structures is insufficient to protect the workflow. Worktrees share a common Git directory, so future gate keys must account for shared refs and object storage as well as separate indexes.

Watch both relevant worktree and Git metadata changes. `notify` callbacks enqueue or mark invalidation; they do not read the entire repository. A refresh worker coalesces bursts and publishes a new revision. Ignore irrelevant build/cache activity for UI refresh where safe, while continuing to account for relevant ignored-file and ignore-rule changes. A failed watcher must be visible, with manual refresh available.

The starter retains one watcher and coalescing channel/worker for each opened canonical root until application shutdown. Frontend refresh logic filters inactive repository events and discards stale results. Frontend listeners and Monaco resources are released with their views. Explicit repository-session closing and earlier watcher disposal remain future lifecycle work; switching the visible repository does not currently remove its watcher.

## Validation and filesystem security

Tauri capabilities grant only the native functionality needed by the main application window. Backend validation remains necessary: custom commands have filesystem privileges that browser code does not. [Tauri's security model](https://v2.tauri.app/security/) makes the backend/frontend trust boundary explicit.

Canonicalize the selected root and independently validate each requested relative path. Reject absolute paths, traversal components, `.git` internals, and paths resolving outside the selected worktree. Canonicalization must handle deletion/missing-file operations carefully by validating the existing parent; rejecting all missing files would prevent staging deletions. Do not follow symlinks or Windows reparse points into an unrelated directory when scanning candidate content. A checked path can change before use, so sensitive operations must revalidate and avoid unsafe traversal assumptions.

Publishing must respect ignore rules and guard obvious credential files, private keys, and generated dependency/build directories before automatic initial staging. Filename and content checks reduce accidental disclosure but are not a complete secret scanner. Keep this protection in Rust because frontend-only checks are bypassable. Do not upload suspicious content merely because a UI checkbox exists; provide a reviewable resolution path.

Do not put provider credentials into remote URLs or command explanations. Keep operation credentials transient and clear owned sensitive buffers where possible. Publishing checks the effective push target and each credential callback against the selected provider's HTTPS host on port 443, rejects userinfo/query/fragment, and disables redirects so URL rewriting or a changed `pushurl` cannot redirect a PAT elsewhere. Provider errors exclude raw response bodies and network errors exclude raw remote diagnostics. A future remembered-login feature requires explicit OS credential-store integration and a separate threat-model review; JSON preferences and webview localStorage are unsuitable.

## Publish failures and recovery

Account authentication and repository-name availability checks run before local initialization. They reduce predictable failures without creating a transaction or reserving a remote name. Local initialization, initial commit, remote creation, remote configuration, push, and upstream tracking are separate durable steps. Retain completed phases and hosted identity in progress and recovery messages if a later phase fails. Do not roll back by deleting a remote repository, deleting local files, or resetting a user's pre-existing history. A watcher setup failure after a successful push is a refresh warning and does not turn publication into failure.

Recovery after initialization is currently manual: inspect the provider account, open the preserved local repository, and configure its remote/credentials before synchronizing. The publishing dialog rejects existing repositories and does not offer automatic resume. A future resume flow must inspect the local repository and intended remote, identify whether the operation created that remote, and never adopt an unrelated repository solely because its name matches. Do not retry non-idempotent provider creation blindly after a timeout; first resolve whether creation succeeded.

User cancellation is cooperative at safe boundaries. Closing a dialog does not terminate an in-progress libgit2 push and does not undo a remote creation. The operation's result must remain discoverable after its initiating view closes.

## Consequences

The UI stays responsive without giving C-backed repository objects unsafe shared lifetimes. Mutation order is predictable and watcher bursts do not multiply index scans. The engine needs explicit operation and session state, and partial-failure recovery is more detailed than a single success boolean.

Before adding rebase, squash, hard reset, worktree removal, or force push, introduce a fresh backend plan, stale-plan detection, recovery references where appropriate, and tests of failures between phases. Safe preview UI cannot substitute for these engine guarantees.
