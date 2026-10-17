# GitSomething design system

Use GitHub's familiar dark palette with a small GitSomething touch. The user's latest direction replaces the rejected multicolor and violet palettes: make the client educational and functional, with restrained character in the existing typography, branch illustration, and direct interactions.

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
| Teaching       | `#bc8cff` | Lessons, practice, and explanations    |

Keep large surfaces dark and neutral. Blue identifies interaction; green identifies saving and positive Git state. Branch colors may distinguish real graph lanes but must not turn the workspace into competing decorative color blocks. All native controls use a dark color scheme.

## Educational function

Teach Git beside the action: staging selects files for the next commit, committing saves a checkpoint locally, and pushing uploads saved commits. The diff footer describes whether its file is selected; the composer distinguishes commit from push; Push has a keyboard-accessible explanation of what is uploaded. The Glass-Box console explains the equivalent command tokens.

The purple Learn by doing strip stays compact until expanded. Its steps distinguish working files, selected changes, local checkpoints, and sharing. The Glass Box uses a dark translucent material, a readable mono stream, a guided input, and a separate teaching panel. Every button activation records interface intent; actual Git rows report running, success, or failure. Pure interface actions never receive invented Git commands. See [the terminal guide](docs/GLASS_BOX.md).

The first-use guide and practice flow remain skippable and replayable. Keep advanced features behind the command palette. Educational copy should be short and specific, and examples prepare commands for review before execution.

## Glass Box readability

Home is the initial application screen. Keep project actions and real recents prominent, with a separate purple guide column. The first launch starts with a useful empty recent list; demo data enters only when requested. Native desktop conventions and short, actionable copy take precedence over marketing sections. The workspace remains available through Continue without losing its in-memory draft.

The terminal combines command-and-output grouping with GitHub's dark surfaces. Keep the glass effect in the header and framing; put transcript text over a stable, sufficiently opaque reading surface. Blue identifies the prompt and Git interactions, while purple distinguishes teaching content. Give commands more space than interface activity so results remain connected to the operation that produced them.

| Reference                                                                             | Relevant principle                                                                 | GitSomething direction                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Warp blocks](https://docs.warp.dev/terminal/blocks/)                                 | Groups commands with their output.                                                 | Use a subtle guide and spacing to connect each command to its results.                       |
| [Ghostty configuration](https://ghostty.org/docs/config/reference#minimum-contrast)   | Exposes minimum contrast and font preferences.                                     | Prioritize clear foregrounds and a consistent reading scale.                                 |
| [VS Code terminal appearance](https://code.visualstudio.com/docs/terminal/appearance) | Documents terminal fonts, line height, and a default 4.5:1 minimum contrast ratio. | Use readable mono text, comfortable line spacing, and clear contrast on the actual backdrop. |

Use Geist Mono at 13px by default for commands, output, and input; use 12px for interface actions and terminal messages, and 10px for metadata. Terminal appearance lets the user choose 12–18px reading text. A visible top separator supports pointer and keyboard resizing, with saved preferences and limits based on the actual workspace. Lesson copy uses 12px with 11px tips. Preserve reading sizes on narrow viewports, allow wrapping, and give the prompt a 43px row. Command tokens remain discoverable through tooltips, with underlines emphasized on hover or keyboard focus. Contrast preferences remain a reference idea rather than an implemented setting.

## Character and motion

Space Grotesk headings, Manrope controls, Geist Mono code, and the existing layout remain. Preserve the small GitSomething touches: state-driven branch drawing, file selection, animated folder illustration, and saved-commit feedback. The reading surface stays still while the user reviews code.

Respect reduced motion and visible keyboard focus. Filled-control hover states use darker emphasis colors so white labels retain contrast. Body text and placeholders meet AA contrast on their actual composed surfaces; control boundaries and focus cues meet non-text contrast requirements.

The workspace Push action and publishing's final Create & push action use a green confirmation slider. The handle follows the pointer directly; releasing before the end returns it with a short spring. Releasing at the end confirms once. Keyboard users move with arrows or End, then confirm with Enter or Space; Escape cancels. Taps, track clicks, and moving to the end without confirming never start work. Changes to the repository, publication details, or account reset an armed slider. The compact workspace control gets its own full-width row on narrow screens; publishing keeps its final slider across the footer.

## Product truth and source ownership

Motion does not mutate Git state or imply an unsupported operation succeeded. The browser remains an explicit demo; history gestures remain previews; credentials stay in Rust and the OS credential store. [Motion sources](docs/MOTION_SOURCES.md) records the original AnimMaster-inspired effects and their paid-source boundary. Skiper attribution and Vengeance MIT notices remain in source and in-app credits.
