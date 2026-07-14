# Northvale Content Drawer Mockup Design

## Goal

Create a polished launcher mockup that adds a contextual content drawer to the
Northvale project screen. The drawer provides three sections: `MODS`,
`RESOURCE PACKS`, and `SHADERS`, while preserving the launcher's existing dark,
minimal visual language.

## Closed State

- Place a small drawer handle at the vertical center of the right edge of the
  Northvale project view.
- Use a compact rounded capsule with a subtle border instead of a bare `>`
  character.
- The chevron points right when the drawer is closed and left when it is open.
- Keep the handle visually quiet so the gallery image and Play action retain
  primary emphasis.

## Responsive Open State

The interaction switches on the native launcher window state:

- **Normal windowed launcher:** expand the launcher window to the right and
  reveal the drawer beside the existing Northvale view. The project view keeps
  its current dimensions.
- **Maximized or full-screen launcher:** keep the outer window size
  unchanged and slide the drawer over the right side of the project view. Add a
  subtle dark scrim behind the drawer without obscuring the launcher chrome.

The transition should feel continuous: approximately 280 ms with a smooth
ease-out curve. The mockup must show the compact/windowed expanded state,
matching the user's first reference image.

## Drawer Layout

- Target width: 320 px, adjustable within 300–340 px to preserve spacing.
- Header: `NORTHVALE LIBRARY`, a small project badge, and a close button.
- Tab row: `MODS`, `RESOURCE PACKS`, `SHADERS` in equal-width segments.
- Default active tab: `MODS`.
- Active tab: restrained white-to-lavender highlight, brighter label, and a
  thin indicator line; inactive tabs remain muted.
- Body: compact content cards with icon, title, version or metadata, and a
  right-aligned enable switch.
- Footer action: a low-emphasis `OPEN FOLDER` control.

## Visual Language

- Continue the existing near-black surfaces, thin gray borders, pill shapes,
  and restrained lavender accent from the launcher icon.
- Use layered black surfaces and a mild backdrop blur to separate the drawer
  without introducing a bright block.
- Match the existing condensed uppercase labels and generous letter spacing.
- Preserve the current Northvale gallery, project selector, gallery dots, Play
  button, settings button, top navigation, and window controls.
- Avoid oversized headings, neon glows, dense decoration, or a generic web
  dashboard appearance.

## Mockup Deliverable

Produce one high-fidelity landscape raster mockup of the compact/windowed open
state. It should clearly show the original launcher expanded to the right, the
edge handle in its open state, and all three drawer tabs. Text must be rendered
verbatim, with no added branding or watermark.

## Implementation Notes

The future interactive version should keep drawer state independent from the
active content tab. Normal windowed mode expands the window; maximized or
full-screen mode uses the internal overlay. Closing the drawer in windowed mode
restores the exact previous window bounds.
