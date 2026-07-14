# Static Project Background Performance Design

## Goal

Make the Northvale project screen as smooth as possible by removing decorative full-screen motion that runs continuously after the screen has loaded.

## Scope

- Remove the infinite `project-grid-drift` animation from the project panel background grid.
- Remove the infinite `project-image-drift` animation and its `will-change` hint from the gallery image.
- Keep the current static grid, gallery image, image filter, layout, drawer, gallery controls, and screen-entry transitions unchanged.
- Do not change project synchronization, content management, launching, or Electron window behavior.

## Implementation

The change is CSS-only. The project grid and active gallery image will render at their existing resting appearance without continuous `background-position` or `transform` updates. Unused drift keyframes will be removed so the stylesheet cannot accidentally retain dead performance-heavy behavior.

## Regression Protection

Extend the renderer stylesheet test to assert that the project grid and gallery image do not use infinite animations. The existing transition tests will continue to protect the short entrance animations that remain allowed.

## Verification

1. Run the focused renderer test and confirm the new regression assertion fails before the CSS change.
2. Apply the minimal CSS change and confirm the focused test passes.
3. Run the complete test suite and production build.
4. Re-measure the Electron renderer on the main project screen and confirm that no continuous project-grid or project-image animation remains and renderer work is materially lower than the original baseline.

## Acceptance Criteria

- The main project background and gallery image remain visually present but static.
- Gallery navigation, drawer behavior, and page-entry transitions continue to work.
- No `project-grid-drift` or `project-image-drift` animation is running after the main screen settles.
- Tests and production build pass.
