# Learn with the Glass Box

Open the Glass Box with the terminal button or Ctrl/Cmd+J. It connects three views of the same workflow: what you clicked, the equivalent Git operation, and a short explanation. Purple marks lessons and practice; blue remains the workspace action color and green marks successful Git state.

Branchline starts on Home. Open a repository, select a recent project, or choose Try demo to enter a workspace. Return Home with the logo or Home button; the active workspace and its commit draft stay available through Continue workspace. Recent shortcuts contain only local path, repository name, branch, and last-opened time. Removing a shortcut leaves files on disk untouched.

## Adjust the terminal

Drag the top separator to change the Glass Box height. Keyboard users can focus the separator and use Up/Down, with Shift for smaller steps; Home/End selects the smallest/largest allowed height. The terminal adapts its allowed height to the current window. Open Terminal appearance to choose 12–18px text or reset the display settings. Font size and height are remembered locally; the controls still work if persistent storage is unavailable.

## Buttons and results

Every activated button is recorded as an interface request, including controls inside dialogs. Keyboard shortcuts, command-palette selections, native folder drops, and history drag previews also enter the activity stream. An interface row explains the intent; it does not claim the Git operation succeeded. Git operations retain their separate running, success, or error state and equivalent command tokens. Hover or focus a token to read its Vengeance tooltip.

Use All, Commands, or Actions to filter the stream. Clear hides the entries currently present; new actions still appear. Copy exports the visible filtered entries. These logs stay in memory and are bounded to 200 Git entries and 200 activity entries. No field values or authentication codes are collected by the button recorder. Common provider token and credential-bearing URL patterns are redacted from activity before storage.

## Guided command input

This is a supported subset of Git syntax. It dispatches to the same application operations as the buttons; it never launches a shell or a Git child process. Opening a real repository in the desktop app makes these actions real. The browser workspace is explicitly practice data.

| Command                                   | What it does                                                        |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `help`                                    | Lists supported syntax                                              |
| `git status [--short]`                    | Summarizes working and staged changes                               |
| `git log [--oneline]`                     | Lists the recent commits loaded by Branchline                       |
| `git branch`                              | Lists loaded local branches; a star marks the current branch        |
| `git diff [--staged] [-- "path/to/file"]` | Reviews working or staged content                                   |
| `git add -- "path/to/file"`               | Stages one exact changed file                                       |
| `git restore --staged -- "path/to/file"`  | Unstages one file while preserving edits                            |
| `git commit -m "Describe what changed"`   | Saves staged changes as a local commit                              |
| `git fetch [origin]`                      | Downloads remote references                                         |
| `git pull [--ff-only]`                    | Pulls from the configured upstream only when a fast-forward is safe |
| `git push [origin]`                       | Uploads local commits                                               |

Paths must match a file shown in Changes. Quote paths with spaces. Shell operators, substitutions, globs, path traversal, arbitrary executables, branch mutations, reset, and force push are rejected with guidance. Use Up/Down in the input to recall commands. Suggestions and lesson examples prepare a command for review; pressing Run or Enter executes it. Large output is clipped with an explanation.

Native reads refresh the repository snapshot before producing status, branch, or recent-history output. These are readable summaries of the application data, not captured Git CLI stdout. Diff content is read through the existing native diff command. Native writes emit their existing libgit2 equivalent-command events, including failure details. Sync uses the existing authenticated Git path.

## Learning beside the work

The compact Learn by doing strip explains the working folder, staging, committing, and pushing. Expand a step to see where data lives, why the step matters, and a safe command to try. The terminal has additional lessons about branches, diffs, and its supported-command boundary. The first-run practice guide remains available from Help or the command palette.

## Implementation

- `src/hooks/useActivity.tsx` captures control activations across portal dialogs and provides settled command activity.
- `src/lib/activity.ts` bounds, merges, and redacts the activity stream.
- `src/lib/guided-commands.ts` parses the allowlisted syntax and dispatches through typed callbacks.
- `src/lib/learning.ts` owns reusable lesson content.
- `src/components/GlassBox.tsx` renders the terminal, filters, command input, and learning panel.
- `src/components/LearningFlow.tsx` provides contextual guidance in the workspace.

The existing Rust engine remains the only application Git runtime. Advanced history editing and three-way conflict resolution keep their previously documented preview or roadmap status.

## Confirming a push

The workspace **Slide to push** and publishing's **Slide to create & push** controls record a completed confirmation as an interface request. The existing Git operation rows report execution and its actual outcome separately. Releasing early, cancelling, or changing the repository or publication details resets the slider without starting work. The confirmation tooltip explains what will be uploaded and how to use the keyboard: arrows or End to move, Enter or Space at the end to confirm, and Escape to cancel. Pressing Enter in a publishing text field never starts publication.

Guided commands retain their explicit Run or Enter behavior. Typing a supported `git push` uses the same Git engine and records its own result.
