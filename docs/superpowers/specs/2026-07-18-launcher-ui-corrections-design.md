# Launcher UI Corrections Design

## Scope

Correct the six launcher UI regressions identified from the 0.2.0 screenshots without changing project installation, synchronization, launch, or update behavior.

## Project Picker

- Replace the `01 / 02` trigger text with the current project's `artwork.cover`.
- Keep the project title, season, and status text beside the artwork.
- Keep `01` and `02` inside the expanded season menu because those values identify menu entries rather than the currently selected project.
- If the user is in Shop or Settings, clicking Project returns directly to the Project page and keeps the season menu closed.
- If the user is already on the Project page, clicking the project trigger toggles the season menu.
- Season 2 remains disabled and renderer-only.

## Application Chrome

- Minimize, Maximize, and Close must always be visible and clickable on Project, Shop, and Settings.
- The same controls remain available while an update status or `RESTART TO UPDATE` action is present.
- Keep the controls fixed above the connected header; `window-chrome` must use a higher stacking layer than `topbar`.
- Window controls remain outside draggable regions and each button keeps its accessible label.
- The header reserves enough right-side space so navigation and update actions never sit underneath the controls at supported window sizes.

## Content Drawer

- Remove the edge drawer handle and its arrow completely.
- `MANAGE CONTENT` is the only control that opens the drawer.
- The close button inside the drawer remains available.
- Drawer import, drag-and-drop, enable/disable, trash, and open-folder behavior remains unchanged.

## Typography

- Bundle IBM Plex Sans Thai with the application so Thai rendering is identical on every Windows installation.
- Use IBM Plex Sans Thai for the Thai hero headline and supporting copy.
- Use regular and semibold weights with Thai-safe line height and zero negative letter spacing.
- Keep the existing condensed Latin type for English labels and status text.

## Icons and Interaction

- Replace the Shop diamond with a 16px shopping-bag SVG.
- Replace the Manage Content square glyph with a matching 16px folder SVG.
- Both icons use the same stroke width, rounded caps, neutral color, and pale-blue interactive accent.
- PLAY remains high contrast in idle, hover, pressed, focus, progress, and disabled states.
- Hover must not invert the button into an unreadable dark surface.
- Focus remains keyboard-visible without glow.

## Verification

- Renderer tests cover project artwork, navigation/menu behavior, absence of the drawer handle, window-control stacking and click behavior on every main tab, IBM Plex Sans Thai usage, SVG icons, and PLAY contrast states.
- Visually inspect 1280×720, 1366×768, and 920×600.
- Run the full test suite, renderer typecheck, and production build.
