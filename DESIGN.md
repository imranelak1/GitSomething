# Branchline Studio design system

The Studio redesign follows the user's request for a mix of fun and serious design, stronger personality, a better palette, and motion informed by AnimMaster and Motion.dev. It replaces the previous lime/violet identity. Git remains a dependable editing task; personality comes from physical interactions, authored branch illustrations, and distinct materials for different jobs.

## Palette and type

| Token  | Value     | Use                                                       |
| ------ | --------- | --------------------------------------------------------- |
| Ink    | `#171c26` | Main canvas, strong text on paper                         |
| Editor | `#18202e` | Quiet Monaco background                                   |
| Cobalt | `#4263eb` | Navigation rail, selected controls, primary action        |
| Paper  | `#f4f1e8` | Files, repository context, history ledger, form fields    |
| Coral  | `#ff8768` | Project creation, folder illustration, expressive heading |
| Butter | `#f2d75c` | Commit composer, current branch, onboarding illustration  |
| Mint   | `#9fe6c3` | Added lines, successful operations, healthy state         |

Self-hosted **Space Grotesk** gives display text its character. **Manrope** handles controls and interface copy; **Geist Mono** handles code, paths, command tokens, and hashes. Large text has compact leading; file names and labels remain readable at their actual working scale.

The cobalt rail anchors the interface. A warm paper sidebar and file list contrast with the ink code canvas. The butter composer makes the next commit tangible, while a dark console keeps equivalent commands visually attached to the editing task. On narrow screens, files, diff, and composer keep their task order. Panels do not overlap and dialogs scroll within the viewport.

## Signature interactions

- The real commit graph draws paths derived from parent IDs. Branch pills and commit nodes spring into position; HEAD follows the actual checked-out branch target.
- The four-step guide combines a paper reading surface with a butter illustration panel. An original **BranchBloom** SVG grows from editing to saving and sharing; it is a conceptual illustration, not invented repository data.
- The publishing folder lifts its document on hover and responds to press. Native progress and its explicitly labeled preview drive the upload pipeline.
- File selections and tabs use shared Motion layout. A successful commit briefly turns the composer mark into a spring-driven check; a failed operation cannot trigger it.
- Existing **Skiper TextRoll** and **Vengeance AnimatedButton/tooltips** remain attributed and active.
- New magnetic interactions keep their hit targets stable and stop following the pointer during keyboard focus, touch, or reduced motion.

Animation uses `motion/react`, the current Motion for React entry point. Drawing and transitions run on state changes or direct interaction. The diff itself stays still while being read. There are no perpetual ornamental effects.

## Source ownership

AnimMaster's public mouse, SVG, and physics examples informed the direction. Its component source is paid and no licensed files were supplied. The components in `registry/animmaster` are original Branchline code, not an installation or copy of the paid catalog. [Motion sources and licensing](docs/MOTION_SOURCES.md) records this boundary.

Skiper's free TextRoll attribution and Vengeance's MIT notices remain in their source directories and in-app credits. Do not label original components as upstream library source.

## Accessibility and product truth

Keyboard focus uses cobalt on paper and a bright contrasting outline on ink. Reduced-motion users receive the same state, progress, and controls without spatial springs or path-drawing entrances. Dialog focus returns to its launcher; opening another protected flow does not steal that flow's focus.

The browser remains an explicit demo. OAuth credentials stay in Rust and the OS credential store. History gestures preview unsupported mutations and cannot rewrite history. The visual system must not turn planned features into apparent working controls or imply that a practice push uploaded files.
