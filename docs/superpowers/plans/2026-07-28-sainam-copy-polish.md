# SaiNam Copy Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display SaiNam's approved season subtitle and Thai hero tagline, then publish Launcher v0.2.8 through the existing GitHub auto-update feed.

**Architecture:** Keep operational `statusText` unchanged and derive the display-only copy in the existing Renderer components from the known project ID. Reuse the current project-selection integration test so the assertions exercise the real header, menu, and hero together.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Testing Library, electron-builder, GitHub Releases

## Global Constraints

- SaiNam selected trigger and menu row: `SEASON TEST · UP TO DATE`.
- SaiNam hero tagline: `สายน้ำไหลหลาก`.
- Northvale copy remains unchanged.
- Manifest, Forge, sync, installation, launch, and storage behavior remain unchanged.
- Release version is `0.2.8`.

---

### Task 1: SaiNam Display Copy

**Files:**
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/LauncherHeader.tsx`
- Modify: `src/renderer/ProjectPanel.tsx`

**Interfaces:**
- Consumes: `LauncherProject.id`, `LauncherProject.statusText`, and `NORTHVALE_PROJECT_ID`.
- Produces: display-only subtitles and hero tagline; no public interface changes.

- [ ] **Step 1: Write the failing integration assertions**

In the existing SaiNam selection test, assert the menu item subtitle before
selection, then the selected trigger subtitle and hero tagline after selection:

```tsx
const sainamMenuItem = within(projectMenu).getByRole('menuitem', { name: /SAINAM/i });
expect(sainamMenuItem).toHaveTextContent('SEASON TEST · UP TO DATE');
await user.click(sainamMenuItem);

expect(projectTrigger).toHaveTextContent('SEASON TEST · UP TO DATE');
expect(screen.getByText('สายน้ำไหลหลาก')).toBeInTheDocument();
```

After switching back, assert the selected trigger contains
`SEASON 01 · UP TO DATE`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm test -- --run src/renderer/App.test.tsx -t "selects SaiNam"
```

Expected: fail because SaiNam still renders only `UP TO DATE` and the hero
does not contain `สายน้ำไหลหลาก`.

- [ ] **Step 3: Implement the minimal copy derivation**

Update `projectSubtitle()` so Northvale returns
`SEASON 01 · ${entry.statusText}` and SaiNam returns
`SEASON TEST · ${entry.statusText}`. Update the non-Northvale hero paragraph
to render `สายน้ำไหลหลาก`. Do not introduce state, effects, memoization, or
manifest changes for these constant display strings.

- [ ] **Step 4: Verify GREEN**

Run the same focused command and expect the SaiNam selection test to pass.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/App.test.tsx src/renderer/LauncherHeader.tsx src/renderer/ProjectPanel.tsx
git commit -m "feat: polish SaiNam project copy"
```

### Task 2: Release v0.2.8

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/electron-build.test.ts`

**Interfaces:**
- Consumes: existing GitHub Release publisher and electron-updater configuration.
- Produces: Setup, Portable, blockmap, and `latest.yml` assets for v0.2.8.

- [ ] **Step 1: Update the release contract**

Change all root package versions and the Electron build contract test from
`0.2.7` to `0.2.8`.

- [ ] **Step 2: Run verification**

```powershell
npm test
npm run build
```

Expected: all tests pass and the production Renderer/Electron build succeeds.

- [ ] **Step 3: Commit and fast-forward main**

```powershell
git add package.json package-lock.json src/renderer/electron-build.test.ts
git commit -m "chore: release 0.2.8"
git fetch origin main --tags
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
```

- [ ] **Step 4: Package and publish**

Set `GH_TOKEN` from the authenticated GitHub CLI, then run:

```powershell
npm run publish:win
```

Expected: GitHub Release `v0.2.8` contains Setup, Portable, blockmap, and
`latest.yml`, and is marked Latest.

- [ ] **Step 5: Verify auto-update metadata**

Download the published `latest.yml` and require an exact match with the local
file, `version: 0.2.8`, and the Setup artifact path. Compare GitHub asset sizes
and SHA-256 digests against the four local release files.
