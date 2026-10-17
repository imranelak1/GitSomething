# Branchline design system

Use GitHub's familiar dark palette with a small Branchline touch. The user's latest direction replaces the rejected multicolor and violet palettes: make the client educational and functional, with restrained character in the existing typography, branch illustration, and direct interactions.

## Shared colors

`src/theme.css` owns the semantic color tokens. The foundation follows [Primer's dark palette](https://github.com/primer/primitives/blob/main/src/tokens/base/color/dark/dark.json5) and [GitHub's color roles](https://primer.style/product/primitives/color/).

| Role           | Value     | Purpose                                |
| -------------- | --------- | -------------------------------------- |
| Canvas/editor  | `#0d1117` | Application ground and Monaco          |
| Panel/composer | `#151b23` | Files, forms, dialogs, commit composer |
| Raised         | `#212830` | Elevated controls and cards            |
| Hover          | `#262c36` | Neutral interactive state              |
| Border         | `#3d444d` | Structural separators                  |
| Strong border  | `#656c76` | Visible control boundaries             |
| Text           | `#f0f6fc` | Primary reading text                   |
| Muted          | `#9198a1` | Secondary labels and metadata          |
| Accent/link    | `#58a6ff` | Links, focus, selection, graph context |
| Accent fill    | `#1f6feb` | Blue primary controls                  |
| On accent      | `#ffffff` | Text/icons on blue and green fills     |
| Positive fill  | `#238636` | Familiar green Commit action           |
| Success        | `#3fb950` | Git additions and completed operations |
| Danger         | `#ff7b72` | Git removals and error copy            |
| Warning        | `#d29922` | Warnings and modified-file metadata    |

Keep large surfaces dark and neutral. Blue identifies interaction; green identifies saving and positive Git state. Branch colors may distinguish real graph lanes but must not turn the workspace into competing decorative color blocks. All native controls use a dark color scheme.

## Educational function

Teach Git beside the action: staging selects files for the next commit, committing saves a checkpoint locally, and pushing uploads saved commits. The diff footer describes whether its file is selected; the composer distinguishes commit from push; Push has a keyboard-accessible explanation of what is uploaded. The Glass-Box console explains the equivalent command tokens.

The first-use guide and practice flow remain skippable and replayable. Keep advanced features behind the command palette. Educational copy should be short and specific; avoid permanent tutorial banners across the working area.

## Character and motion

Space Grotesk headings, Manrope controls, Geist Mono code, and the existing layout remain. Preserve the small Branchline touches: state-driven branch drawing, file selection, animated folder illustration, and saved-commit feedback. The reading surface stays still while the user reviews code.

Respect reduced motion and visible keyboard focus. Filled-control hover states use darker emphasis colors so white labels retain contrast. Body text and placeholders meet AA contrast on their actual composed surfaces; control boundaries and focus cues meet non-text contrast requirements.

## Product truth and source ownership

Motion does not mutate Git state or imply an unsupported operation succeeded. The browser remains an explicit demo; history gestures remain previews; credentials stay in Rust and the OS credential store. [Motion sources](docs/MOTION_SOURCES.md) records the original AnimMaster-inspired effects and their paid-source boundary. Skiper attribution and Vengeance MIT notices remain in source and in-app credits.
