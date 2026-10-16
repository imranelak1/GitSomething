# Dependency decisions

The committed `package.json`, lockfile, and `src-tauri/Cargo.toml` define the executable dependency set. This document explains ownership and intent; version changes belong in the manifests and lockfiles.

## Rust

| Dependency                     | Role                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tauri` 2                      | Native application lifecycle, typed commands, events, and managed state.                                                                                              |
| `tauri-build` 2                | Build-time configuration and capabilities integration.                                                                                                                |
| `tauri-plugin-dialog` 2        | Native directory selection with explicit user context.                                                                                                                |
| `git2` 0.21                    | In-process Git object, index, status, diff, commit, branch, and remote operations. HTTPS/SSH support is enabled; vendored libgit2 keeps that C dependency consistent. |
| `notify` 8                     | Platform filesystem events used to invalidate repository snapshots.                                                                                                   |
| `serde` / `serde_json`         | Explicit command, result, error, and progress DTO serialization.                                                                                                      |
| `reqwest` 0.12                 | Provider HTTPS APIs, JSON, and Rustls TLS. It is separate from libgit2 remote transport.                                                                              |
| `keyring`                      | Native GitHub credential storage in Windows Credential Manager, macOS Keychain, or Linux Secret Service. No plaintext preference fallback.                            |
| `tauri-plugin-opener` 2        | Open the validated GitHub device-authorization page in the system browser. It is not a Git command transport.                                                         |
| `tokio` 1                      | Async coordination, synchronization, timers, and blocking-work dispatch.                                                                                              |
| `uuid` 1                       | Operation identifiers that correlate command invocation and streamed events.                                                                                          |
| `ignore` 0.4                   | Ignore-aware folder inspection and candidate-file enumeration.                                                                                                        |
| `zeroize` 1                    | Best-effort clearing of owned sensitive buffers when released. This cannot erase copies held by a webview, transport library, OS, or provider.                        |
| `tempfile` 3, development only | Isolated repository fixtures for engine tests.                                                                                                                        |

Do not add a shell plugin to implement Git operations. Console text is an explanation produced by the backend; no string interpolation should turn it into a command executor. A developer using Git to maintain this project is separate from the app's Git engine.

## Frontend

| Dependency group                                     | Role                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `react`, `react-dom`, TypeScript, Vite               | Application composition, types, and development/build tooling.                    |
| `@tauri-apps/api`, Tauri CLI, dialog plugin          | IPC, native events, native dialogs, and desktop development.                      |
| `tailwindcss` and its Vite integration               | Utility styling backed by the explicit design tokens in `src/styles.css`.         |
| `motion` (`motion/react`)                            | Motion for React layout transitions, springs, SVG drawing, and drag previews.     |
| `@monaco-editor/react`, `monaco-editor`              | Code and diff rendering; editor instances are disposed with their views.          |
| Radix primitives                                     | Accessible low-level dialog, tooltip, selection, and related behavior where used. |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Source-owned component variants and consistent class composition.                 |
| `lucide-react`                                       | One coherent icon family.                                                         |
| `cmdk`                                               | Command-palette search and keyboard navigation.                                   |
| Space Grotesk, Manrope, and Geist Mono font packages | Local display, application, and monospaced typography.                            |
| Vitest / Playwright                                  | Focused unit checks and browser interaction verification.                         |
| Prettier                                             | Consistent source and documentation formatting.                                   |

The project requires Node.js 22.12.0 or newer. Vitest 5.0.5 and the DOMPurify 3.4.17 override are included in the dependency-security update; the recorded audit result is a point-in-time check, not a guarantee about future advisories.

shadcn/ui, Skiper UI, and Vengeance UI are component source/registry systems in this architecture. They do not imply npm packages literally named `shadcn-ui`, `skiper-ui`, or `vengeance-ui`. Source-owned components live in `src/components/ui`, `src/components/registry/skiper`, and `src/components/registry/vengeance`. Review any imported registry component's dependencies and license before copying it.

The project's `KineticModal` is original Radix/Motion code; its heading uses an attributed adaptation of Skiper's actual free TextRoll registry component. Its [provenance note](../src/components/registry/skiper/PROVENANCE.md) records that boundary. `AnimatedTooltip` adapts Vengeance's MIT-licensed tooltip composition and preserves the [upstream license](../src/components/registry/vengeance/LICENSE) and [source attribution](../src/components/registry/vengeance/PROVENANCE.md). Motion is installed through `motion` and imported from `motion/react`; the retired direct `framer-motion` dependency is not a second animation runtime. [Motion sources](MOTION_SOURCES.md) documents the original AnimMaster-inspired components and their licensing boundary.

## Native build considerations

Vendored libgit2 still requires the platform C/C++ build environment. The native WebView and Tauri platform development dependencies are also required. Keeping `reqwest` on Rustls does not automatically remove every TLS, SSH, or C-library requirement from libgit2's separate transport stack.

Bundle Monaco's workers and font assets with the application. Keep a restrictive CSP and explicit Tauri capabilities. A web development server and a production desktop bundle have different allowed origins; an external website must not inherit repository command access.
