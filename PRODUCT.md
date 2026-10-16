# Branchline product brief

Branchline makes the next Git action clear for a beginner and keeps expert tools one command away. Its default workspace answers three questions: what changed, which branch am I on, and what will my next commit contain?

## Product decisions

The project name is **Branchline**. The first project remote is assumed to be private, under the authenticated owner's account; the implementation handoff should report the actual URL and visibility. That project repository is separate from repositories users later publish with the app.

The product is a native desktop application built with Tauri 2, Rust, React, Vite, TypeScript, Tailwind, Framer Motion, and Monaco. Git operations use libgit2 through `git2-rs`; a Git executable is not an application runtime dependency. A browser preview demonstrates the interface with labeled fixtures and does not claim access to native folders.

The interface starts in dark mode. Mint marks successful and primary work; lavender marks branch context and advanced focus. The surface stays quiet enough for dense code, while movement makes focus and operation progress legible.

## First milestone

The starter establishes the application architecture, Rust IPC engine, filesystem observation, visual workspace, Monaco diff surface, equivalent-command console, and a native folder-to-cloud publishing flow. The native commands support repository opening, file staging/unstaging, committing, fetch, push, fast-forward-only pull, and safe rescue-branch creation. Files with both staged and unstaged edits have separate rows and diffs; displayed file counts deduplicate paths. The delivered manifest and command registration are the source of truth for the available operations.

The publishing interaction collects an unversioned folder, repository name, visibility, operation-scoped personal access token, and commit identity. It authenticates the account and checks name availability before initializing the folder, then explains local initialization, initial commit, remote creation, and first push as separate steps. GitHub.com and GitLab.com use provider-specific API adapters; a provider API request is shown honestly as an API action. Each successful step remains visible if a later step fails. Credentials are bound to the selected provider's HTTPS destination. Recovery after partial publication is currently manual. OAuth, automatic resume, self-hosted instances, and remembered provider authentication are subsequent work.

The history graph supports direct manipulation as a preview of future rebase and squash operations. A drag must not silently rewrite history. The starter may display the proposed relationship and explain the operation, but confirmation remains unavailable until the underlying safe mutation engine exists.

The Guardian derives advice from real repository state in the native application. A detached-HEAD rescue creates a new branch at the current commit and preserves working edits. Existing branch names are never overwritten. Merge/rebase conflicts must currently be finished outside the app. Advice identifies the state and a meaningful next step; a banner does not claim a rescue action was performed unless the backend completed it.

## Subsequent milestones

| Capability          | Expected behavior before release                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Hunk staging        | Apply selected hunks to the index against a checked baseline; show changed selection if the file changes underneath the user. |
| Line staging        | Build and validate a patch containing only selected lines; handle context, newline, deletion, and rename cases explicitly.    |
| Three-way merge     | Show base, ours, theirs, and result; write the resolved file and resolve the index only after the user accepts it.            |
| Worktrees           | Create, open, lock, prune, and remove worktrees with separate working-directory state and shared-repository coordination.     |
| Interactive rebase  | Plan, preview, execute, pause for conflicts, continue, and abort; preserve a recovery reference before rewriting commits.     |
| Destructive actions | Show affected files and commits from a fresh backend plan; require confirmation and reject a plan if the repository changed.  |
| Submodules          | Expose initialized/uninitialized state, nested status, and explicit update behavior through the command palette.              |
| Provider sign-in    | Replace operation-scoped manual credentials with a complete OAuth/device flow and OS credential storage.                      |
| Large repositories  | Virtualize changes/history, page diffs, cancel superseded reads, and measure real repository workloads.                       |

These are roadmap capabilities, not promises that the starter already implements safe history rewriting or merge resolution.

## UX acceptance rules

- A beginner can find the changed files, read a diff, stage a file, and create a commit without opening an advanced panel.
- Every mutation has a pending, success, and actionable failure state. Repeated clicks cannot start overlapping mutations.
- The console teaches the equivalent CLI without exposing credentials or claiming a shell command was executed.
- Folder publishing subscribes to progress before starting work and cannot confuse updates from another operation.
- Keyboard users can open and close dialogs, invoke the command palette, inspect token explanations, and return to their previous focus.
- Reduced-motion users receive the same information without spring movement, parallax, or animated reordering.
- Browser fixtures and native results are distinguishable. UI polish never stands in for verified Git behavior.

## Performance position

Removing child-process startup is valuable, particularly for repeated index and object reads. It does not guarantee sub-millisecond status, diff, fetch, push, or large-tree work. Measure cold and warm status, visible-diff latency, memory, watcher bursts, and time to first interaction on representative repositories before publishing performance claims.
