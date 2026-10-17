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

## Workspace layout

Give reviewing code the largest continuous surface. The working view has a repository source list, a changed-file list with the commit composer beneath it, and a diff spanning the full height beside both. The former activity rail and large workspace slogan are removed from this view; the branch journey belongs to History. Primary file labels are 13px, code is 14px, and file rows provide more space for selection.

The repository pane starts at 224px and resizes between 190–320px. The file pane starts at 304px and resizes between 248–420px, with its upper bound reduced when needed to reserve 440px for the editor. Pointer and keyboard separators resize the panes; widths and desktop sidebar visibility are remembered. The sidebar hides automatically at widths of 1000px or less. At 760px or less, files, diff, and composer stack into a scrollable workspace.

These are web interpretations of macOS layout patterns, not native AppKit controls:

| Apple reference                                                                          | Applied principle                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)           | Give essential content sufficient space and disclose secondary information when needed.                            |
| [Split views](https://developer.apple.com/design/human-interface-guidelines/split-views) | Provide adjacent panes with draggable dividers on desktop.                                                         |
| [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars/)      | Offer a discoverable show/hide control when users need more room for content.                                      |
| [Inspectors, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10161/)            | Keep supplementary detail contextual and allow users to reveal it deliberately.                                    |
| [AppKit design, WWDC25](https://developer.apple.com/videos/play/wwdc2025/310/)           | Group controls logically, give them breathing room, and distinguish navigation materials from the content surface. |

## Educational function

On desktop windows at most 720px tall, the inline teaching strip yields space to the review panes; lessons remain available in the Glass Box. The commit form uses two compact rows, and repository navigation scrolls independently, so opening the terminal keeps file selection and commit controls reachable.

Teach Git beside the action: staging selects files for the next commit, committing saves a checkpoint locally, and pushing uploads saved commits. The diff footer describes whether its file is selected; the composer distinguishes commit from push; Push has a keyboard-accessible explanation of what is uploaded. The Glass-Box console explains the equivalent command tokens.

The purple Learn by doing strip opens an anchored contextual tip without shrinking the diff. Its steps distinguish working files, selected changes, local checkpoints, and sharing. The Glass Box uses a dark translucent material, a readable mono stream, a guided input, and a separate teaching panel that starts closed and opens through Learn or a requested lesson. Its transcript shows Git operations, guided commands, failures, and real account or publishing events. Lessons change the inspector context without adding transcript rows. Resizing, scrolling, navigation, settings, copying, panel openings, and slider confirmations remain quiet. See [the terminal guide](docs/GLASS_BOX.md).

The first-use guide and practice flow remain skippable and replayable. Keep advanced features behind the command palette. Educational copy should be short and specific, and examples prepare commands for review before execution.

## Glass Box readability

Home is the initial application screen. Keep project actions and real recents prominent, with a separate purple guide column. The first launch starts with a useful empty recent list; demo data enters only when requested. Native desktop conventions and short, actionable copy take precedence over marketing sections. The workspace remains available through Continue without losing its in-memory draft.

The terminal combines command-and-output grouping with GitHub's dark surfaces. Keep the glass effect in the header and framing; put transcript text over a stable, sufficiently opaque reading surface. Blue identifies the prompt and Git interactions, while purple distinguishes teaching content. Group each command with its results; All operations, Commands, and Events separate commands from provider events and operation failures.

| Reference                                                                             | Relevant principle                                                                 | GitSomething direction                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Warp blocks](https://docs.warp.dev/terminal/blocks/)                                 | Groups commands with their output.                                                 | Use a subtle guide and spacing to connect each command to its results.                       |
| [Ghostty configuration](https://ghostty.org/docs/config/reference#minimum-contrast)   | Exposes minimum contrast and font preferences.                                     | Prioritize clear foregrounds and a consistent reading scale.                                 |
| [VS Code terminal appearance](https://code.visualstudio.com/docs/terminal/appearance) | Documents terminal fonts, line height, and a default 4.5:1 minimum contrast ratio. | Use readable mono text, comfortable line spacing, and clear contrast on the actual backdrop. |

Use Geist Mono at 13px by default for commands, output, and input; use 12px for operation events and terminal messages, and 10px for metadata. Terminal appearance lets the user choose 12–18px reading text. A visible top separator supports pointer and keyboard resizing, with saved preferences and limits based on the actual workspace. Lesson copy uses 12px with 11px tips. Preserve reading sizes on narrow viewports, allow wrapping, and give the prompt a 43px row. Command tokens remain discoverable through tooltips, with underlines emphasized on hover or keyboard focus. Contrast preferences remain a reference idea rather than an implemented setting.

The fresh terminal body is 180px high; existing saved heights remain valid. Host measurements reserve 260px for the desktop workspace and 200px on narrow screens before setting the terminal's upper resize bound. A fresh window shorter than 720px starts with the terminal collapsed, retaining its visible heading and shortcut so users can reopen it.

## Character and motion

Space Grotesk headings, Manrope controls, and Geist Mono code preserve the product's character. Keep the small GitSomething touches: state-driven branch drawing, file selection, animated folder illustration, and saved-commit feedback. The reading surface stays still while the user reviews code.

Respect reduced motion and visible keyboard focus. Filled-control hover states use darker emphasis colors so white labels retain contrast. Body text and placeholders meet AA contrast on their actual composed surfaces; control boundaries and focus cues meet non-text contrast requirements.

The workspace Push action and publishing's final Create & push action use a green confirmation slider. The handle follows the pointer directly; releasing before the end returns it with a short spring. Releasing at the end confirms once. Keyboard users move with arrows or End, then confirm with Enter or Space; Escape cancels. Taps, track clicks, and moving to the end without confirming never start work. Changes to the repository, publication details, or account reset an armed slider. The compact workspace control gets its own full-width row on narrow screens; publishing keeps its final slider across the footer.

## Startup motion

The launch sequence is one authored brand moment in the existing GitHub palette. An original thin blue commit graph draws outward around the prompt cat; its blink and tilt overlap a Skiper TextRoll wordmark. The near-black veil lifts into the already mounted Home. The graph is decorative and does not depict repository history or progress. The existing Vengeance button provides a visible **Skip intro** control.

The path drawing lasts at most 900ms, the composition begins to recede at 1170ms, and the veil lifts from 1220–1640ms. No repeated loop, splash delay based on network, simulated command, spinner, percentage, or sound is used. Animation failure cannot trap the app: a 2300ms fallback dismisses it. The system's reduced-motion preference bypasses the intro before mount and dismisses active playback when it changes. Hidden documents also dismiss it.

Home and the auth providers mount beneath an inert, accessibility-hidden wrapper. Keyboard focus stays on Skip during the intro; Skip, Escape, Enter, or an app shortcut dismisses it without executing a hidden action. The handoff focuses **Open repository** when appropriate and preserves a real dialog's focus, including native folder drops. The startup context suppresses duplicate automatic logo playback behind the veil. Navigation does not replay the sequence and all intro controls stay out of the Glass Box.

The references are [AnimMaster's Page Transitions and SVG Animations](https://animmasterlib.dev/), [Motion SVG drawing](https://motion.dev/docs/react-svg-animation), and [Motion's scoped animation cleanup](https://motion.dev/docs/react-use-animate). This is original code using the existing Motion dependency and attributed Skiper/Vengeance components.

## Product truth and source ownership

Motion does not mutate Git state or imply an unsupported operation succeeded. The browser remains an explicit demo; history gestures remain previews; credentials stay in Rust and the OS credential store. [Motion sources](docs/MOTION_SOURCES.md) records the original AnimMaster-inspired effects and their paid-source boundary. Skiper attribution and Vengeance MIT notices remain in source and in-app credits.
