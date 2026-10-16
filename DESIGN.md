# Branchline design system

Branchline is a focused desktop workbench. Its strongest visual element is the code and the relationship between changes, branches, and commits. The interface uses precise borders, restrained color, and physical motion to make those relationships readable.

## Color and typography

| Token             | Value     | Use                                             |
| ----------------- | --------- | ----------------------------------------------- |
| `background`      | `#101114` | Application canvas                              |
| `surface`         | `#131417` | Primary workspace surfaces                      |
| `surface-raised`  | `#17181c` | Raised controls, dialogs, and active areas      |
| `border`          | `#2a2c32` | Separators and control boundaries               |
| `text`            | `#e9e9ed` | Main text and code                              |
| `text-muted`      | `#92959f` | Secondary labels and metadata                   |
| `accent-mint`     | `#b8f2c9` | Primary action, additions, and successful work  |
| `accent-lavender` | `#c5afff` | Branches, selection context, and advanced focus |

Use **Geist** for the application and **Geist Mono** for paths, branch references, command tokens, commit IDs, and code. Font sizes and letter spacing should support dense reading at normal desktop scaling. Use weight and spacing before adding more colors. Uppercase micro-labels are sparse; controls and errors use sentence case.

## Workspace

The navigation rail establishes the repository and destination. The changes column contains grouped files and the commit composer. The central diff surface receives the most horizontal space. History and the Glass-Box console are useful secondary views, revealed in place without turning the main workspace into a card grid.

Keep repeated rows aligned, use fixed icon slots, and place file status close to its filename. A selected file has one clear selection treatment. The commit action remains visually connected to the staged selection. Branch and synchronization controls retain stable positions as counts change.

The first screen should look like an application already being used: readable file changes, an informative diff, and a current branch. Native onboarding and empty states use the same typography and surface system. Avoid a marketing hero inside the workbench.

## Motion

Framer Motion handles short state transitions, dialogs, tooltips, and drag feedback. Use motion to show origin, destination, selection, and progress. A dialog can enter with a small translation and opacity transition; a tooltip can arrive with a short delay and a subtle scale change. Large decorative loops do not belong behind code.

Drag previews attach to the dragged object and show a valid target. Branch-to-branch and commit-to-commit interactions explain the proposed operation before any history mutation becomes available. Escape and pointer cancellation return the object to its original position.

Respect `prefers-reduced-motion` through a shared motion configuration. Remove spatial travel and spring overshoot; preserve progress, focus, selection, and success through static state or a brief opacity change. Animation must never delay keyboard focus or hide a failure.

## Registry ownership

`src/components/ui` holds the accessible source-owned primitives used by the application. The shadcn configuration defines their paths; this is an editable component system, not a required runtime package called `shadcn-ui`.

`src/components/registry/skiper` contains reviewed Skiper-style motion patterns for the folder publishing dialog, drop target, and kinetic inputs. `src/components/registry/vengeance` contains reviewed Vengeance-style animated explanations used by the console. Preserve source provenance and applicable license requirements beside any copied third-party component. A hand-built implementation inspired by a pattern must say so; do not claim it is upstream source.

These registries stay local so motion behavior, accessibility, dependency cost, and reduced-motion support can be reviewed with the application. Adding a component should not introduce unrelated gallery dependencies or an unreviewed remote registry into the production build.

## Interaction requirements

Folder publishing uses one focused dialog with a readable folder path, repository name, privacy selection, and a primary publish action. Errors remain near the relevant input or step. During publishing, progress explains initialization, commit creation, provider creation, remote configuration, and push. Closing a dialog cannot pretend an in-flight native operation was cancelled.

Command tokens receive individual explanations. A tooltip must appear on keyboard focus as well as hover, stay readable near a viewport edge, and close on Escape. Do not put an entire sentence inside an inaccessible hover-only wrapper.

Guardian banners use direct language: the repository state, its consequence, and a safe next action. A destructive-operation preview lists the actual affected files and commits from a backend plan, with a clearly labeled confirmation button. A future plan preview must be visually distinguishable from an executable operation.

## Accessibility and desktop behavior

Use semantic buttons and labels, visible focus rings, sufficient contrast, and complete dialog focus management. Avoid color as the sole file-status cue. Keyboard shortcuts should display the platform modifier, with Ctrl+K on Windows/Linux and Cmd+K on macOS.

The workspace supports narrow windows through progressive collapse rather than compressing every column into unreadable text. Preserve the active diff and current action. Resize Monaco with its container and dispose editor models/listeners when their views close.
