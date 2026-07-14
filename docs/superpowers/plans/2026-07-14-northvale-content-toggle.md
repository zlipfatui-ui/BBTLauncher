# Northvale Content Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real enable/disable and delete controls to every visible Northvale content row, remove Resource Pack managed UI, and preserve Resource Pack user choices across sync.

**Architecture:** Represent disabled content by renaming the file in place with a `.disabled` suffix. Keep path validation, ownership decisions, and renames in the main process; expose one narrow toggle IPC method through preload. Treat manifest Resource Packs as one-time seeds and use the existing managed index as the seeded marker so disabled or deleted packs are not restored by later syncs.

**Tech Stack:** Electron 37, Node.js filesystem APIs, TypeScript, React 19, CSS

## Global Constraints

- Recognize only direct regular files ending in `.jar`, `.jar.disabled`, `.zip`, or `.zip.disabled` for their matching content kind.
- Manifest Mods remain hidden and protected.
- Resource Packs and Shaders are user-controllable and never show `MANAGED` or a lock.
- Toggle renames must reject collisions and symlinks without overwriting either state.
- Successful toggles play one grayscale white-star burst lasting no more than 520 ms.
- Disable particles under `prefers-reduced-motion: reduce`.
- Do not add or modify automated tests; run only `npm run build`.
- Deliver the hotfix as launcher version `0.1.8` through the existing GitHub release pipeline.

---

### Task 1: Disabled File Model and Toggle IPC

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/project-content.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/launcherApi.ts`

**Interfaces:**
- Consumes: `ProjectContentKind`, existing content list/import/trash methods, existing path-safety helpers
- Produces: `ProjectContentEntry.enabled` and `project.content.setEnabled(projectId, kind, relativePath, enabled)`

- [ ] **Step 1: Add enabled state to shared entries**

Add `enabled: boolean` to `ProjectContentEntry`. Keep `relativePath` as the actual enabled or disabled disk path and expose the logical filename through `name`.

- [ ] **Step 2: Parse enabled and disabled filenames in the main service**

Replace extension-only checks with a helper returning `{ name, enabled }` for the active extension or the same extension plus `.disabled`. Use the logical active path when comparing a Mod against manifest and managed-index paths.

- [ ] **Step 3: Make list and trash ownership match the approved rules**

List user Mods plus all Resource Packs and Shaders. Hide manifest Mods, return `enabled`, allow trash for both enabled and disabled user paths, and stop treating Resource Packs as protected managed rows.

- [ ] **Step 4: Make imports conflict with either state**

Check the active and disabled destination before copying. Return `needs-confirmation` when either exists. On confirmed replacement, back up the one existing state and leave one enabled imported file. Reject an externally-created active/disabled pair as an ambiguous duplicate instead of overwriting it.

- [ ] **Step 5: Implement safe toggling and IPC wiring**

Add `setProjectContentEnabled()` to validate the actual relative path, reject managed Mods and unknown Mod ownership, inspect both source and target with `lstat`, reject target collisions, and rename the source. Wire `project:content:setEnabled` through main, preload, `LauncherApi`, and the browser fallback.

- [ ] **Step 6: Commit the file-model slice**

```powershell
git add -- src/shared/types.ts src/main/services/project-content.ts src/main/index.ts src/preload/index.ts src/renderer/launcherApi.ts
git commit -m "feat: add Northvale content file toggles"
```

### Task 2: Resource Pack Seed Persistence

**Files:**
- Modify: `src/main/services/managed-project-index.ts`
- Modify: `src/main/services/sync.ts`
- Modify: `src/main/services/project-state.ts`

**Interfaces:**
- Consumes: manifest file paths and `managed-files.json`
- Produces: Resource Pack seed behavior respected by project inspection and sync

- [ ] **Step 1: Classify Resource Pack paths as effective seeds**

Add `isResourcePackPath()` and return `seed` from both `effectiveSyncMode()` and `effectiveManagedIndexSyncMode()` for `resourcepacks/` paths, including old index records marked `required`.

- [ ] **Step 2: Teach sync about disabled and previously-seeded packs**

For a manifest Resource Pack, count the active file, `.disabled` sibling, or an existing managed-index record as clean. A missing record on a fresh install still downloads the pack once.

- [ ] **Step 3: Preserve the seeded marker after deletion**

Write Resource Pack manifest records to the managed index even when neither state exists. Keep the manifest hash and size so the existing index remains self-describing.

- [ ] **Step 4: Align project-state inspection**

Treat the active file, disabled sibling, or previous Resource Pack index record as present. Continue strict required-file checks for manifest Mods and other managed files.

- [ ] **Step 5: Commit sync persistence**

```powershell
git add -- src/main/services/managed-project-index.ts src/main/services/sync.ts src/main/services/project-state.ts
git commit -m "fix: preserve Resource Pack choices during sync"
```

### Task 3: Two Row Controls and Toggle Stars

**Files:**
- Modify: `src/renderer/ProjectContentDrawer.tsx`
- Modify: `src/renderer/project-content-drawer.css`

**Interfaces:**
- Consumes: `ProjectContentEntry.enabled`, `api.project.content.setEnabled()`
- Produces: a grayscale switch, delete button, disabled-row treatment, and one-shot toggle particles

- [ ] **Step 1: Add the row toggle action**

Call `setEnabled()` with the current actual `relativePath` and the inverse state. Refresh the active tab from disk after success, show the existing notice on failure, and disable row actions while a mutation is running.

- [ ] **Step 2: Replace the managed badge with two controls**

Render a `role="switch"` button with `aria-checked`, followed by the existing delete button, for every visible row. Remove the managed badge and lock markup completely.

- [ ] **Step 3: Add the successful-toggle star burst**

Render eight `aria-hidden` 1–3 px stars around the affected switch after the refreshed row appears. Move them 6–18 px, fade once within 520 ms, and suppress them under reduced motion.

- [ ] **Step 4: Finish grayscale styling**

Use only equal-channel grayscale colors for switches, hover, focus, disabled rows, and stars. Keep disabled filenames readable and leave controls at full opacity.

- [ ] **Step 5: Commit the drawer behavior**

```powershell
git add -- src/renderer/ProjectContentDrawer.tsx src/renderer/project-content-drawer.css
git commit -m "feat: add content switches and toggle stars"
```

### Task 4: Build and Publish Hotfix 0.1.8

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: completed content toggle implementation
- Produces: GitHub Release `v0.1.8` and auto-update metadata

- [ ] **Step 1: Bump the patch version**

Change the root package versions from `0.1.7` to `0.1.8` in `package.json` and both root occurrences in `package-lock.json`.

- [ ] **Step 2: Run the only approved verification command**

Run `npm run build`. Require TypeScript and Vite to exit with code 0. Do not run Vitest.

- [ ] **Step 3: Commit and push the hotfix**

```powershell
git add -- package.json package-lock.json
git commit -m "chore: release launcher 0.1.8"
git push origin HEAD:main
git push -u origin codex/northvale-content-drawer
```

- [ ] **Step 4: Publish the Windows release**

Run `npm run publish:win`. Require creation and upload of Setup, Portable, blockmap, and `latest.yml` for `0.1.8`.

- [ ] **Step 5: Verify GitHub release metadata**

Read the latest release from GitHub and require tag `v0.1.8`, four assets, `draft: false`, `prerelease: false`, and remote `latest.yml` values `version: 0.1.8` and `path: BeforeBedtime-Launcher-Setup-0.1.8.exe`.
