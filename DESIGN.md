# Branchline design system

The October redesign replaces the restrained first milestone with a vivid, kinetic desktop interface. The user explicitly requested a much bolder, modern UI using Vengeance and Skiper. Preserve Git behavior while making selection, branches, and publishing visible through color, spatial organization, and movement.

## Visual identity

| Token         | Value     | Purpose                                             |
| ------------- | --------- | --------------------------------------------------- |
| Canvas        | `#0a0b0e` | Deep black application ground                       |
| Surface       | `#15151c` | Working panels                                      |
| Text          | `#f5f5f7` | Readable primary text                               |
| Muted         | `#a1a1af` | Supporting metadata                                 |
| Electric lime | `#d7ff63` | Primary actions, staged changes, current graph lane |
| Ultraviolet   | `#a68bff` | Branch context, selection, spatial focus            |
| Peach         | `#ffb88c` | Secondary branches and changed-file markers         |

Use self-hosted **Manrope**, including its 700 and 800 weights, for application typography. Geist Mono remains for code, paths, command tokens, and commit hashes. Titles use a distinct scale and compact leading. Do not shrink interaction text into decorative microtype.

## Composition

The activity rail makes major destinations immediate. The repository sidebar establishes context through a saturated violet project selector, while the main workspace stays dark enough for code. The masthead pairs expressive typography with a compact graph built from actual commit parent relationships.

Changed files and Monaco share the central working surface. The commit composer spans their combined width at the bottom, preserving space for reviewing the file list. The Glass-Box console remains attached to the workspace and uses lime and violet token colors.

On narrow screens, the activity rail, sidebar, and compact graph yield to the task: changed files, diff, then commit composer. Controls must fit without overlapping the editor. Dialogs remain independently scrollable.

`src/styles.css` retains base styles for shared primitives. `src/workspace.css` defines the new workspace composition and palette. History and publishing use scoped style files alongside their components.

## Motion

- Actual **Skiper TextRoll** animates headline and dialog-title characters on hover or keyboard focus.
- Actual **Vengeance AnimatedButton** provides the primary action's spring press and animated highlight.
- File selection moves with shared Framer Motion layout; staging gives direct checkbox feedback.
- Branch paths draw from their real topology. Selection and expanded commit details animate in place.
- The publishing pipeline moves transfer particles only during actual native progress or its explicitly labeled preview.
- Console entries animate when commands arrive. Tooltips explain tokens on focus and hover.

Respect `prefers-reduced-motion`. Spatial movement must be removable without losing status, focus, progress, or access to a control. Motion never changes Git state by itself.

## Registry source and credit

`src/components/registry/skiper/TextRoll.tsx` is adapted from Skiper's free `skiper58` registry source. The registry's free-use attribution is preserved in its provenance file and the application's help dialog. The surrounding Radix modal is project-owned code.

`src/components/registry/vengeance` includes attributed, MIT-licensed AnimatedButton and tooltip adaptations. Keep their original license and source links. Source-owned shadcn Button composition delegates the primary variant to the Vengeance component.

## Truth and interaction

The browser remains an explicit demo. History gestures explain proposed operations without pretending unsupported mutations are implemented. Publishing tokens remain transient. New visual components display real repository facts; no invented metrics or decorative commits are added.

Keyboard focus must remain visible. Disabled controls must communicate their state. A native operation's errors and completed steps remain readable even when an animation is active.
