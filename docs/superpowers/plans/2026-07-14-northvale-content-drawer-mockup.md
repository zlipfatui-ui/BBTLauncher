# Northvale Content Drawer Mockup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one interactive single-page HTML mockup for the responsive Northvale content drawer.

**Architecture:** Add a standalone page under Vite's `public` surface so it can be opened directly or served by the existing development server. Keep all styling and behavior embedded in the HTML; use existing launcher imagery and no new runtime dependencies.

**Tech Stack:** Semantic HTML, embedded CSS, vanilla JavaScript, Vitest contract test

## Global Constraints

- Normal windowed layout expands the simulated launcher to the right when the drawer opens.
- Wide/full-screen layout keeps the simulated launcher width unchanged and overlays the drawer internally.
- Tabs are exactly `MODS`, `RESOURCE PACKS`, and `SHADERS`; `MODS` starts active.
- The edge handle, tabs, close control, and enable switches must be interactive and keyboard accessible.
- Preserve the near-black Northvale launcher visual language and use existing project assets.

---

### Task 1: Define the HTML Contract

**Files:**
- Create: `src/renderer/northvale-mockup.test.ts`
- Create: `public/mockups/northvale-content-drawer.html`

- [ ] Write a Vitest test that loads the HTML and asserts the landmark, exact tab labels, drawer controls, responsive breakpoint, and state-changing JavaScript contract.
- [ ] Run `npm test -- src/renderer/northvale-mockup.test.ts` and verify failure because the HTML file is missing.

### Task 2: Build the Standalone Mockup

**Files:**
- Create: `public/mockups/northvale-content-drawer.html`

- [ ] Implement the full launcher composition with embedded CSS and existing Northvale assets.
- [ ] Add responsive windowed-expansion and wide-screen-overlay layouts.
- [ ] Add vanilla JavaScript for open/close, tab selection, switches, and Escape-to-close behavior.
- [ ] Run `npm test -- src/renderer/northvale-mockup.test.ts` and verify the contract passes.

### Task 3: Verify the Deliverable

**Files:**
- Verify: `public/mockups/northvale-content-drawer.html`

- [ ] Run the full `npm test -- --run` suite.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Confirm the HTML is self-contained apart from existing project images and report the direct file path.

