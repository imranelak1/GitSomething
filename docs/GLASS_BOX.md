# Learn with the Glass Box

Open the Glass Box with the terminal button or Ctrl/Cmd+J. It shows Git operations, their results, and short explanations. Purple marks lessons and practice; blue remains the workspace action color and green marks successful Git state.

GitSomething starts on Home. Open a repository, select a recent project, or choose Try demo to enter a workspace. Return Home with the logo or Home button; the active workspace and its commit draft stay available through Continue workspace. Recent shortcuts contain only local path, repository name, branch, and last-opened time. Removing a shortcut leaves files on disk untouched.

## Adjust the terminal

Drag the top separator to change the Glass Box height. Keyboard users can focus the separator and use Up/Down, with Shift for smaller steps; Home/End selects the smallest/largest allowed height. A fresh terminal body starts at 180px; existing saved heights are retained. Windows shorter than 720px initially show the collapsed heading, which remains available to reopen the terminal.

The terminal adapts its allowed height to the current window while reserving room for the workspace. Open Terminal appearance to choose 12–18px text or reset the display settings. Font size and height are remembered locally; the controls still work if persistent storage is unavailable. The repository sidebar and file pane have their own pointer and keyboard dividers, allowing more room for code without shrinking its text.

## Operations and results

The transcript contains native Git logs, guided commands and output, operation failures, and real GitHub sign-in, disconnect, or folder-publishing events. Git operations retain their running, success, or error state and equivalent command tokens. Hover or focus a token to read its Vengeance tooltip. Account and provider API events are labeled as operations rather than invented Git commands.

Scrolling, resizing, navigation, settings, copying, opening panels, and slider confirmations add no rows. Opening a lesson changes the learning inspector without entering the transcript. Reviewing a file can still show the actual Git read needed to load its diff.

Use All operations, Commands, or Events to filter the stream. Events contains provider operations and operation failures; Commands contains native equivalent commands and guided input. Clear hides the entries currently present; future operations still appear. Copy exports the visible filtered entries. Logs stay in memory and are bounded to 200 Git entries and 200 explicit activity entries. Interface events are discarded before storage, and there is no global button recorder. Authentication codes and credentials stay out of operation messages; common provider token and credential-bearing URL patterns are also redacted before storage.

## Guided command input

This is a supported subset of Git syntax. It dispatches to the same application operations as the buttons; it never launches a shell or a Git child process. Opening a real repository in the desktop app makes these actions real. The browser workspace is explicitly practice data.

| Command                                   | What it does                                                        |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `help`                                    | Lists supported syntax                                              |
| `git status [--short]`                    | Summarizes working and staged changes                               |
| `git log [--oneline]`                     | Lists the recent commits loaded by GitSomething                     |
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

The compact Learn by doing strip explains the working folder, staging, committing, and pushing. Choose a step to open an anchored tip showing where data lives, why the step matters, and a safe command to try. The tip overlays the workspace without reducing its code-reading height. Close it to return to reviewing files.

The terminal's learning panel starts closed. Choose Learn or request a full lesson to open additional explanations about branches, diffs, and the supported-command boundary. It can be hidden again while keeping the command stream and input available. The first-run practice guide remains available from Help or the command palette.

## Implementation

- `src/hooks/useActivity.tsx` stores explicit operations and guided commands, settles their outcomes, and retains the latest lesson for inspector context. Interface events are discarded.
- `src/lib/activity.ts` defines eligible terminal event kinds and bounds, merges, and redacts stored activity.
- `src/lib/guided-commands.ts` parses the allowlisted syntax and dispatches through typed callbacks.
- `src/lib/learning.ts` owns reusable lesson content.
- `src/components/GlassBox.tsx` renders the terminal, filters, command input, and learning panel.
- `src/components/LearningFlow.tsx` provides contextual guidance in the workspace.

The existing Rust engine remains the only application Git runtime. Advanced history editing and three-way conflict resolution keep their previously documented preview or roadmap status.

## Confirming a push

The workspace **Slide to push** and publishing's **Slide to create & push** controls require a completed confirmation before starting work. The terminal records the resulting Git or publishing operation and its outcome, with no separate slider-interaction row. Releasing early, cancelling, or changing the repository or publication details resets the slider without starting work. The confirmation tooltip explains what will be uploaded and how to use the keyboard: arrows or End to move, Enter or Space at the end to confirm, and Escape to cancel. Pressing Enter in a publishing text field never starts publication.

Guided commands retain their explicit Run or Enter behavior. Typing a supported `git push` uses the same Git engine and records its own result.
