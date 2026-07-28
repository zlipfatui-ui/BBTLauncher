# Minimal Splash CTA Design

## Scope

Replace the animated star field and the decorative “Dream Trail” treatment around `Click to start` with a restrained, responsive call to action. Keep the splash-to-auth/main navigation behavior, wordmark, family label, social links, and window controls unchanged.

## Visual Direction

- The splash background remains pure black with no stars, particles, comets, sparks, glows, or light effects.
- `Click to start` uses solid white text (`#fff`), the existing UI sans-serif stack, normal style, medium weight, and responsive sizing between 15px and 17px.
- A centered, straight, 1px white rule sits below the text.
- The button owns a stable responsive width so the rule can grow without moving surrounding content.
- The rule is approximately 88–112px wide at rest and 132–168px wide on hover or keyboard focus.
- No text shadow, drop shadow, filter, gradient, or curved SVG remains in the CTA.

## Interaction and Accessibility

- Hover and `:focus-visible` expand the underline over 220ms with a restrained easing curve.
- Active press feedback uses a small scale reduction and does not introduce light effects.
- Keyboard focus remains visible through a thin white outline with spacing around the button.
- `prefers-reduced-motion: reduce` disables the underline and transform transitions while preserving the final focused state.
- The accessible button name remains `Click to start`, and clicking it retains the existing route transition behavior.

## Implementation

- Remove the generated splash-star data and star SVG tree from `src/renderer/App.tsx`.
- Replace the trail, comet, and spark SVG children with only the code-native button label.
- Remove star, trail, comet, spark, glow, and related keyframe CSS from `src/renderer/styles.css`.
- Build the straight underline with `.start::after`; no additional asset or dependency is required.
- Update renderer tests to assert the absence of legacy decorative elements and the presence of the minimal CSS interaction contract.

## Release and Verification

- Increment the application from `0.2.3` to `0.2.4`.
- Run the targeted renderer test, full Vitest suite, TypeScript/Vite production build, and Windows release packaging.
- Visually verify the splash at desktop and narrow responsive sizes, including hover and keyboard focus.
- Publish the setup executable, blockmap, portable executable, and `latest.yml` to GitHub Release `v0.2.4` so existing installations receive the update through the configured updater.
