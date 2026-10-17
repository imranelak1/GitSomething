# GitSomething brand assets

GitSomething's mark is an original **branch cat**: an angular silver head with asymmetric ears, commit-node eyes joined by a Git fork, and a blue tail that branches into two commit endpoints. Its flat geometry stays recognizable at small application sizes and gives GitSomething a friendly developer mascot.

The brand uses the application's existing GitHub-inspired colors: near-black `#0d1117`, blue `#58a6ff`, silver `#f0f6fc`, and a restrained purple `#bc8cff` for learning. Purple appears in the release banner's teaching copy; the core application mark stays blue and silver.

The artwork was drawn from original paths for GitSomething. It does not contain, trace, or modify GitHub's Octocat or Git logo assets, and it does not imply GitHub endorsement. GitHub's [logo rules](https://brand.github.com/foundations/logo) prohibit modifying its logo or using it as another product's brand; the cat concept is therefore expressed through a separate silhouette and drawing. This describes the asset's source and design choices, rather than legal clearance.

All files below are in [public/brand](../public/brand). SVG files are the editable originals; the PNG exports are ready to upload or distribute.

| File                              | Use                                                   |
| --------------------------------- | ----------------------------------------------------- |
| `gitsomething-app-icon.svg`       | Master 1024 × 1024 application tile                   |
| `gitsomething-app-icon-1024.png`  | Input for Tauri's native icon generator               |
| `github-oauth-logo-256.png`       | GitHub OAuth App logo upload, 256 × 256               |
| `github-oauth-logo-512.png`       | Larger GitHub/provider logo, 512 × 512                |
| `gitsomething-mark.svg`           | Transparent mark for dark backgrounds                 |
| `gitsomething-mark-light.svg`     | Transparent mark for light backgrounds                |
| `gitsomething-wordmark-dark.svg`  | Transparent blue/silver wordmark for dark backgrounds |
| `gitsomething-wordmark-light.svg` | Transparent blue/ink wordmark for light backgrounds   |
| `gitsomething-release-banner.svg` | Editable 1280 × 640 social and release image          |
| `gitsomething-release-banner.png` | Ready-to-upload 1280 × 640 release image              |

The favicon is [public/gitsomething.svg](../public/gitsomething.svg). The application title bar and welcome guide share the master tile. Wordmark and banner lettering uses outlined **Space Grotesk Semibold**, the project's existing display typeface, so exported files do not depend on installed fonts. The typeface's SIL Open Font License is included in the project's font dependency; no new font or artwork dependency was introduced.

Keep the artwork square and preserve its aspect ratio. Do not recolor the cat or fork as a warning/status indicator. Leave at least one commit endpoint's width around a standalone mark. Use the solid tile for desktop, dock, taskbar, browser, and provider icons; use the transparent mark on a controlled background. The favicon uses the same artwork with its own square view box.

To regenerate native platform icons from the checked-in master PNG:

```powershell
npm run tauri -- icon public/brand/gitsomething-app-icon-1024.png
```

To add the provider logo, open the registered GitSomething OAuth App's settings on GitHub and upload `github-oauth-logo-256.png`. This changes the registered application's presentation; it does not change its public Client ID or create another registration.
