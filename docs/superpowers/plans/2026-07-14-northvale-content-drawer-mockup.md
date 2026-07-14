# Northvale Content Drawer Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one polished landscape mockup showing the Northvale launcher in normal windowed mode with its content drawer expanded to the right.

**Architecture:** Treat the two supplied screenshots as visual references rather than pixel-perfect edit targets. Generate one cohesive high-fidelity UI composition, inspect it for layout and copy accuracy, then persist the accepted image under the project documentation assets.

**Tech Stack:** Built-in OpenAI image generation, local image inspection, PNG output

## Global Constraints

- Preserve the existing near-black launcher, Northvale gallery, top navigation, project selector, gallery dots, Play control, settings control, and window chrome.
- Show the normal windowed state expanded to the right with a 300–340 px drawer; do not use the full-screen overlay state in this deliverable.
- Render the tabs exactly as `MODS`, `RESOURCE PACKS`, and `SHADERS`, with `MODS` active.
- Include a refined edge handle, compact content rows, enable switches, and `OPEN FOLDER`.
- Do not add branding, watermark, neon effects, oversized headings, or unrelated controls.

---

### Task 1: Generate the High-Fidelity Mockup

**Files:**
- Reference: `C:/Users/zLip/AppData/Local/Temp/codex-clipboard-533dd44b-c5ce-49c2-bfc0-d7419d01f5bd.png`
- Reference: `C:/Users/zLip/AppData/Local/Temp/codex-clipboard-89cc1157-465c-4ba2-8e70-be98b41a4070.png`
- Create: `docs/mockups/northvale-content-drawer-windowed.png`

**Interfaces:**
- Consumes: the approved design spec and both launcher screenshots
- Produces: a landscape PNG mockup suitable for design review

- [ ] **Step 1: Make both references visible to the image workflow**

Inspect the screenshots at their original resolution. Treat the first as the open-state composition reference and the second as the closed-state handle and launcher-style reference.

- [ ] **Step 2: Generate one mockup with the built-in image tool**

Use the following production prompt:

```text
Use case: ui-mockup
Asset type: high-fidelity desktop game launcher feature mockup
Primary request: Create a polished open-state mockup of the supplied BeforeBedtime Launcher Northvale project screen. In normal windowed mode, the existing launcher expands to the right and reveals an integrated content drawer beside the unchanged project view.
Input images: Image 1 is the rough open-state composition reference; Image 2 is the launcher visual-style and closed edge-handle reference.
Composition/framing: Wide landscape desktop app screenshot. Preserve the original launcher on the left at approximately its existing size. Add a 320 px drawer on the right inside the expanded rounded outer window. Put a refined compact left-pointing chevron capsule at the seam, vertically centered.
Drawer: layered near-black surfaces, thin charcoal borders, mild glass blur, generous spacing. Header text "NORTHVALE LIBRARY" with a small Northvale badge and close icon. Equal tab row with exact labels "MODS", "RESOURCE PACKS", "SHADERS". Make "MODS" active using a restrained white-to-lavender highlight and thin indicator. Below it, show three tasteful compact mod rows with small icons, short names, muted version metadata, and right-aligned enable switches. Add a subtle footer control labeled "OPEN FOLDER".
Style/medium: shippable high-fidelity desktop UI mockup, matching the existing minimal black BeforeBedtime launcher, condensed uppercase labels, fine borders, pill controls, restrained lavender accent.
Constraints: Keep the Northvale gallery, top navigation, project pill, gallery dots, PLAY button, settings button, app logo, and window controls recognizable and in their original hierarchy. Text listed above must be verbatim. The result should look like one coherent application, not a panel pasted beside a screenshot.
Avoid: bright dashboard cards, large white areas, neon glow, oversized type, extra navigation, extra branding, watermark, malformed text.
```

- [ ] **Step 3: Save the generated PNG in the project**

Copy the selected built-in output to `docs/mockups/northvale-content-drawer-windowed.png` without overwriting a pre-existing file; use a `-v2` suffix if needed.

### Task 2: Visual Verification and Handoff

**Files:**
- Inspect: `docs/mockups/northvale-content-drawer-windowed.png`

**Interfaces:**
- Consumes: the PNG produced by Task 1
- Produces: a visually verified final mockup and its exact project path

- [ ] **Step 1: Inspect the final file at original detail**

Verify that the launcher remains readable, the drawer is attached on the right, the seam handle is vertically centered, all three tab labels exist, `MODS` is active, and the drawer contains content rows plus `OPEN FOLDER`.

- [ ] **Step 2: Perform one targeted regeneration only if needed**

If a required label or major layout relationship is wrong, repeat Task 1 while changing only that failed requirement and preserve all correct visual decisions.

- [ ] **Step 3: Validate the saved artifact**

Confirm the file is a readable PNG with landscape dimensions and no accidental overwrite of an unrelated asset.

- [ ] **Step 4: Commit the accepted mockup**

```powershell
git add -- docs/mockups/northvale-content-drawer-windowed.png
git commit -m "docs: add Northvale content drawer mockup"
```

