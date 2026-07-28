# Refined Splash CTA Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Click to start` a more distinctive Barlow Condensed treatment and publish version 0.2.5 for auto-update.

**Architecture:** Change only the existing `.start` typography declarations in `styles.css`; keep markup, underline geometry, motion, accessibility, and route behavior untouched. Use rendered computed-style and screenshot checks for the visual contract, then run the existing automated suite for regression coverage.

**Tech Stack:** React 19, CSS, Vite, Vitest, Electron Builder, Browser/IAB, GitHub Releases

## Global Constraints

- Keep visible copy exactly `Click to start`.
- Use `"Barlow Condensed", "Arial Narrow", sans-serif`, weight `400`, normal style, and `font-synthesis: none`.
- Use `clamp(18px, 1.65vw, 20px)`, `0.1em` letter spacing, and line height `1`.
- Keep text solid white with no shadow, filter, gradient, or glow.
- Preserve the version 0.2.4 underline dimensions and interaction behavior.
- Add no dependency and change no React markup or launcher navigation behavior.
- Publish exactly version `0.2.5` with setup, blockmap, portable, and `latest.yml`.

---

### Task 1: Refine CTA typography

**Files:**
- Modify: `src/renderer/styles.css:209-227`

**Interfaces:**
- Consumes: existing `.start` button markup and the already-loaded Barlow Condensed family
- Produces: the same interactive CTA with a more distinctive computed typography style

- [ ] **Step 1: Capture the failing visual baseline**

Run the renderer at `http://127.0.0.1:5173`, open the splash at 1280×720, and read `.start` computed styles.

Expected pre-change values:

```json
{
  "fontFamily": "\"Inter Tight\", \"Segoe UI Variable Display\", \"Segoe UI\", Arial, sans-serif",
  "fontSize": "17px",
  "fontWeight": "500",
  "letterSpacing": "1.36px",
  "lineHeight": "20.4px"
}
```

Save the desktop screenshot outside the repository as the “before” reference. This is RED because it does not match the approved Barlow Condensed design.

- [ ] **Step 2: Apply the selected typography**

In `.start`, replace only the typography declarations:

```css
font-family: "Barlow Condensed", "Arial Narrow", sans-serif;
font-size: clamp(18px, 1.65vw, 20px);
font-style: normal;
font-weight: 400;
font-synthesis: none;
letter-spacing: 0.1em;
line-height: 1;
```

Leave width, margin, padding, color, underline, hover, focus, active, and reduced-motion rules unchanged.

- [ ] **Step 3: Verify GREEN in the rendered app**

Reload at 1280×720 and confirm:

```json
{
  "fontFamilyIncludes": "Barlow Condensed",
  "fontSize": "20px",
  "fontWeight": "400",
  "letterSpacing": "2px",
  "lineHeight": "20px",
  "color": "rgb(255, 255, 255)",
  "textShadow": "none",
  "filter": "none"
}
```

At 390×700, confirm the font size is `18px`, the CTA stays on one line, `body.scrollWidth` equals `390`, and no legacy decorations render.

- [ ] **Step 4: Perform visual and interaction QA**

Capture desktop and mobile screenshots outside the repository. Compare them with the version 0.2.4 screenshots for:

- stronger font personality without competing with the wordmark;
- optical centering over the underline;
- unchanged vertical spacing and underline geometry;
- solid-white, glow-free treatment;
- no mobile overflow or wrapping.

Click `Click to start` and confirm the splash transitions to auth/main. Confirm Browser console error/warning logs are empty.

- [ ] **Step 5: Run renderer regression tests**

Run:

```powershell
npx vitest run src/renderer/App.test.tsx
```

Expected: all renderer tests pass.

- [ ] **Step 6: Commit the typography refinement**

```powershell
git add -- src/renderer/styles.css
git commit -m "feat: refine splash start typography"
```

---

### Task 2: Version and publish 0.2.5

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/electron-build.test.ts`
- Create: `docs/superpowers/plans/2026-07-28-refined-splash-cta-typography.md`
- Generated outside repository: `D:/BBTLauncher-release/*`

**Interfaces:**
- Consumes: verified Task 1 source and existing GitHub Release publisher
- Produces: public latest Release `v0.2.5` and auto-update metadata

- [ ] **Step 1: Increment package metadata**

Run:

```powershell
npm version 0.2.5 --no-git-tag-version
```

Expected: `package.json`, `package-lock.json`, and `package-lock.json` root package metadata report `0.2.5`.

- [ ] **Step 2: Update and verify the release metadata test**

Change the test name and three expectations in `src/renderer/electron-build.test.ts` from `0.2.4` to `0.2.5`, then run:

```powershell
npx vitest run src/renderer/electron-build.test.ts -t "version 0.2.5"
```

Expected: the matching test passes.

- [ ] **Step 3: Run full verification sequentially**

Run in this exact order:

```powershell
npm test
npm run build
git diff --check
```

Expected: 165 tests pass, the TypeScript/Vite production build exits 0, and Git reports no whitespace errors.

- [ ] **Step 4: Commit and push**

```powershell
git add -- package.json package-lock.json src/renderer/electron-build.test.ts docs/superpowers/plans/2026-07-28-refined-splash-cta-typography.md
git commit -m "chore: release 0.2.5"
git push origin main
```

- [ ] **Step 5: Build and publish Windows assets**

Run:

```powershell
npm run publish:win
```

Expected uploads:

```text
BeforeBedtime-Launcher-Setup-0.2.5.exe
BeforeBedtime-Launcher-Setup-0.2.5.exe.blockmap
BeforeBedtime-Launcher-Portable-0.2.5.exe
latest.yml
```

- [ ] **Step 6: Verify public release and auto-update metadata**

Use `gh release view v0.2.5` and download `latest.yml`. Confirm:

```yaml
version: 0.2.5
path: BeforeBedtime-Launcher-Setup-0.2.5.exe
```

Confirm the release is public, non-prerelease, marked Latest, all four assets are uploaded, `main` matches `origin/main`, and the worktree is clean.
