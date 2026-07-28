# Refined Splash CTA Typography Design

## Scope

Refine only the typography of the minimal `Click to start` call to action introduced in version 0.2.4. Preserve the black splash, white straight underline, interaction timing, layout, accessible label, route transition, and complete absence of stars or glow.

## Options Considered

- **Barlow Condensed 400 — selected.** It shares the wordmark’s type family while using a lighter weight and mixed case, giving the CTA more character without competing with the logo.
- **IBM Plex Sans Thai Medium.** It is bundled and reliable but reads like general application UI rather than a distinctive launch prompt.
- **Cormorant Garamond.** It would add a cinematic editorial quality, but its serif character moves the splash back toward the decorative style the minimal redesign removed and would add another font dependency.

## Selected Typography

- Use `"Barlow Condensed", "Arial Narrow", sans-serif`.
- Use weight `400`, normal style, and `font-synthesis: none`.
- Use `clamp(18px, 1.65vw, 20px)` so the label gains presence on desktop while remaining balanced on narrow windows.
- Use `0.1em` letter spacing and `1` line height for a crisp, restrained silhouette.
- Keep the exact visible copy `Click to start` in title case.
- Keep the text solid white with no shadow, filter, gradient, or glow.
- Keep the underline dimensions and expansion behavior from version 0.2.4 unchanged.

## Verification and Release

- Confirm the browser’s computed style resolves to Barlow Condensed at 20px on 1280×720 and 18px on 390×700.
- Compare desktop and mobile screenshots against version 0.2.4, checking hierarchy, optical centering, spacing, line relationship, and readability.
- Confirm no overflow, wrapping, console errors, added copy, decorative effects, or interaction regressions.
- Run the full Vitest suite and production build.
- Publish version `0.2.5` with setup, blockmap, portable, and `latest.yml` assets so existing installations receive the typography refinement through auto-update.
