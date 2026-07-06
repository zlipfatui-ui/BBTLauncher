# Northvale Pack State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the live Northvale pack to R2 and make the launcher show and execute INSTALL, UPDATE, or PLAY based on verified local files.

**Architecture:** A pure project-state inspector compares the manifest against the managed project roots. Electron exposes that state through preload IPC. BBTWeb stages only approved profile roots, uploads them to R2, generates R2-backed URLs, and streams downloads through a guarded Worker route.

**Tech Stack:** Electron, React, TypeScript, Vitest, Node.js, Cloudflare Workers, R2, Wrangler.

---

### Task 1: Project State Inspector

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/main/services/project-state.ts`
- Create: `src/main/services/project-state.test.ts`

- [ ] Write failing tests for fresh install, changed files, stale files, and ready state.
- [ ] Run `npm test -- src/main/services/project-state.test.ts` and verify the tests fail because the inspector is missing.
- [ ] Implement `inspectProjectState()` using the same path and hash rules as sync.
- [ ] Run the focused tests and verify they pass.

### Task 2: State IPC and Renderer Behavior

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/launcherApi.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`

- [ ] Write failing renderer and static IPC tests for INSTALL, UPDATE, and PLAY behavior.
- [ ] Run focused tests and verify expected failures.
- [ ] Add `project.getState(projectId)` IPC and preload contract.
- [ ] Make INSTALL/UPDATE call sync only and PLAY call launch.
- [ ] Show `NOT INSTALLED`, `UPDATE !`, or `UP TO DATE` in the stage badge.
- [ ] Run focused tests and verify they pass.

### Task 3: Safe Pack Import

**Files:**
- Create: `BBTWeb/tools/import-northvale-pack.mjs`
- Create: `BBTWeb/tests/unit/import-northvale-pack.test.ts`
- Modify: `BBTWeb/package.json`

- [ ] Write a failing test proving only mods, config, and resourcepacks are copied.
- [ ] Verify the test fails because the importer is missing.
- [ ] Implement validated root selection and clean staging replacement.
- [ ] Run the importer against the live profile.
- [ ] Verify shaderpacks, saves, logs, and account files are absent from staging.

### Task 4: R2 Upload and Download Route

**Files:**
- Modify: `BBTWeb/wrangler.toml`
- Modify: `BBTWeb/src/worker.ts`
- Create: `BBTWeb/src/lib/launcher-files.ts`
- Create: `BBTWeb/tests/unit/launcher-files.test.ts`
- Create: `BBTWeb/tools/upload-launcher-pack.mjs`
- Modify: `BBTWeb/tools/build-launcher-manifest.mjs`
- Modify: `BBTWeb/package.json`

- [ ] Write failing tests for guarded R2 file routing and manifest URLs.
- [ ] Verify focused tests fail.
- [ ] Add the `LAUNCHER_PACKS` R2 binding and streaming route.
- [ ] Add an upload script that puts staged files at `northvale/<path>`.
- [ ] Generate manifest URLs under `/api/launcher/files/northvale/<path>`.
- [ ] Run focused tests and verify they pass.

### Task 5: Verification

- [ ] Run launcher tests with `npm test -- --reporter=dot`.
- [ ] Run launcher build with `npm run build`.
- [ ] Run BBTWeb tests with `npm test -- --reporter=dot`.
- [ ] Run BBTWeb build with `npm run build`.
- [ ] Run Wrangler dry run and inspect output.
- [ ] Open the launcher and verify the initial state label.

