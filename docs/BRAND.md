# GitSomething brand assets

GitSomething's original **prompt cat** has a silver, asymmetric head, a `>_` expression, and a blue tail that splits into two commit nodes. The prompt makes the character feel at home in a developer tool; the branching tail gives it a motion vocabulary that belongs to GitSomething. The larger head and fewer facial details replace the previous fork-faced cat.

The palette remains the application's GitHub-inspired near-black `#0d1117`, blue `#58a6ff`, and silver `#f0f6fc`. Light artwork uses ink and `#0969da`. Purple `#bc8cff` remains reserved for teaching surfaces. The cat does not change color to communicate operation status.

The paths were drawn for this project. They do not contain, trace, or modify Octocat or Git logo artwork and do not imply GitHub endorsement. GitHub's [logo rules](https://brand.github.com/foundations/logo) prohibit modifying its logo or adopting it as another product's brand. This describes the source of our artwork, rather than providing legal clearance.

## Source and exports

The small shared [geometry file](../src/components/brand/logo-shapes.json) supplies the React component and the export generator. All generated files live in [public/brand](../public/brand).

| File                                                                 | Use                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `gitsomething-app-icon.svg`                                          | Static 1024 × 1024 application tile                                          |
| `gitsomething-app-icon-1024.png`                                     | Input to Tauri's native icon generator                                       |
| `github-oauth-logo-256.png`                                          | Ready to upload to the registered GitHub OAuth app                           |
| `github-oauth-logo-512.png`                                          | Larger provider icon and Apple touch icon                                    |
| `gitsomething-mark.svg` / `gitsomething-mark-light.svg`              | Transparent static marks                                                     |
| `gitsomething-wordmark-dark.svg` / `gitsomething-wordmark-light.svg` | Transparent horizontal lockups                                               |
| `gitsomething-mark-animated.svg`                                     | Standalone vector animation; one short playback                              |
| `gitsomething-logo-preview.html`                                     | Offline motion preview with replay, pause, speed, theme, and static controls |
| `gitsomething-release-banner.svg` / `.png`                           | 1280 × 640 release image                                                     |

The [favicon](../public/gitsomething.svg), native icons, provider images, wordmarks, and banner share the same resting drawing. Wordmark and banner typography uses the existing outlined Space Grotesk Semibold, licensed under the SIL Open Font License through the project's font dependency. The [typography source](../scripts/brand-typography.json) contains those outlines; exports need no installed font.

## Motion specification

The app's [LogoMark](../src/components/brand/LogoMark.tsx) uses the existing Motion for React dependency. Home has a larger mark beside its existing introduction; the title bar and guide use small decorative instances. One roughly one-second sequence runs on entry. Hover can replay it after it settles. The mark never blocks navigation and never loops continuously.

| Part        | Geometry and role                       | Motion                                                      |
| ----------- | --------------------------------------- | ----------------------------------------------------------- |
| Head        | Asymmetric ears and a broad silver face | A six-degree curious tilt, returning to the exact rest pose |
| Prompt      | Two thick, dark strokes forming `>_`    | Brief blink; the face remains recognizable at rest          |
| Tail        | Continuous blue trunk and branch        | Silver trace follows the tail toward the new commit         |
| Commit node | Open ring at the branch tip             | Small arrival pulse, then its original size                 |
| Body        | Broad blue seated silhouette            | Fixed anchor throughout the sequence                        |

The head starts immediately, the blink begins at 280ms, and the tail trace runs from 120–960ms. The final node settles by 990ms. Deceleration uses `cubic-bezier(.22, 1, .36, 1)`; there is no random motion, global logo spin, or unbounded particle system. The static figure is visible before animation starts.

Reduced motion gives the complete static mark, including when the preference changes while the app is open. Hidden documents cancel active motion; effects and listeners are cleaned up on unmount. Repeated hover during playback does not enqueue more sequences. The mark is decorative wherever nearby text already names GitSomething. A standalone labeled instance exposes one accessible name.

The standalone preview is self-contained and works offline. It includes actual 16, 24, 32, 48, 64, and 128px samples, a light background, 0.5×/0.25× speed, pause/resume, and a static preview. Its exported SVG uses CSS keyframes; the app uses Motion so interactive interruption can be canceled cleanly. Native desktop and OAuth images stay static because those platforms do not display our web animation.

## Application startup

[StartupExperience](../src/components/startup/StartupExperience.tsx) introduces each full app launch with a drawn branch graph, the prompt cat, the attributed Skiper TextRoll wordmark, and a Vengeance **Skip intro** button. A mask lifts to reveal Home after approximately 1.64 seconds. A 2.3-second failsafe dismisses the screen if the animation completion is interrupted. It runs once per full launch and does not replay when navigating between Home and the workspace.

Home and account restoration mount immediately behind the introduction. Its timing does not wait for fonts, a repository read, or the network, and it displays no invented loading progress. The introduction itself starts no Git/provider operation and adds no Glass Box entries.

**Skip intro**, Escape, or Enter dismisses it immediately. A native folder drag/drop also dismisses it so publishing can take over. The background remains inert while the introduction is visible; keyboard focus starts on Skip and passes to Home's open-repository action afterward, unless an opened dialog already owns focus. Hidden documents bypass or dismiss it. Reduced-motion preference bypasses the entire introduction, including when the preference changes during playback, and all animation controls, timers, and listeners are cleaned up on dismissal.

The startup composition reuses the existing vector geometry and component source. It does not add another public brand export or change the static native/OAuth icon files.

## Regenerate and use

```powershell
npm run brand:build
npm run tauri -- icon public/brand/gitsomething-app-icon-1024.png --output src-tauri/icons
```

The generator uses Playwright and an installed Edge on Windows, or Playwright's Chromium elsewhere. Keep the mark square, preserve its proportions, and leave at least one commit-node diameter around a standalone symbol. Use the solid tile for native/provider icons and transparent marks on controlled backgrounds.

Open the registered OAuth application's settings on GitHub and upload `github-oauth-logo-256.png` to update its consent-screen presentation. This does not change its public Client ID or create another app registration. GitSomething cannot update that owner-only setting through ordinary user sign-in.

## Design references

The skill search found [SVG Logo Designer](https://github.com/rknall/claude-skills/tree/main/svg-logo-designer), [Logo Design](https://github.com/kaankiziltug/logo-design-skill), and [Animated Logo Cycle](https://github.com/stianlars1/larsen-skills/tree/main/plugins/larsen-skills/skills/animated-logo-cycle). SVG Logo Designer, the installed Impeccable animation guidance, and Apple Design informed the implemented vector, motion, and accessibility work. The two alternative skills were researched, rather than installed or executed. [Motion's SVG documentation](https://motion.dev/docs/react-svg-animation) informed the path animation implementation. No external mascot artwork was imported.
