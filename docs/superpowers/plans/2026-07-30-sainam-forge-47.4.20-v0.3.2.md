# SaiNam Forge 47.4.20 and Launcher v0.3.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release Launcher `v0.3.2` so normal players and the SaiNam owner accept and launch the production SaiNam pack with Forge `47.4.20`.

**Architecture:** Change the Launcher’s project metadata contract and renderer fallback from SaiNam Forge `47.4.10` to `47.4.20`. Preserve owner file-sync bypass while proving runtime installation/launch still consumes the refreshed manifest loader version, then publish a standard GitHub auto-update release.

**Tech Stack:** Electron, TypeScript, Vitest, electron-builder, GitHub Releases.

## Global Constraints

- Launcher release version is exactly `0.3.2`.
- SaiNam and Northvale both require Minecraft `1.20.1`, Forge `47.4.20`, and Java 17.
- SaiNam Forge `47.4.10` must be rejected by the main-process manifest validator.
- Existing SaiNam owner sync bypass remains unchanged; owner runtime install and launch use Forge `47.4.20`.
- No changes to project files, manifest schema, IPC, artwork, mods, configs, maps, or Northvale behavior.
- Publish Setup, blockmap, `latest.yml`, and Portable assets as GitHub Latest without force-push.

---

### Task 1: SaiNam Forge Runtime Contract

**Files:**
- Modify: `src/main/services/manifest-client.ts`
- Modify: `src/main/services/manifest-client.test.ts`
- Modify: `src/renderer/launcherApi.ts`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/main/services/launcher.test.ts`
- Modify representative SaiNam fixtures that still encode `47.4.10`

**Interfaces:**
- Consumes: production manifest project metadata for `sainam`.
- Produces: validated `LauncherManifest` entries and launch options whose `loaderVersion` is `47.4.20`.

- [ ] **Step 1: Write failing manifest-contract tests**

Change the valid SaiNam fixture to `47.4.20`, add a mutation with
`loaderVersion: '47.4.10'`, and require rejection matching `/47\.4\.20/`.
Add an assertion that `fallbackManifest` exposes SaiNam `47.4.20`.

- [ ] **Step 2: Write a failing SaiNam launch test**

Add a SaiNam manifest fixture and invoke `launchProject` with mocked
`ensureInstalled` and `launchMinecraft`. Require both calls to contain:

```ts
expect.objectContaining({
  projectId: 'sainam',
  minecraftVersion: '1.20.1',
  loaderVersion: '47.4.20',
  javaMajor: 17
})
```

The existing owner sync no-op test must remain green.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm test -- --maxWorkers=1 src/main/services/manifest-client.test.ts src/main/services/launcher.test.ts src/renderer/App.test.tsx
```

Expected: failure because the validator and renderer fallback still encode
SaiNam Forge `47.4.10`.

- [ ] **Step 4: Implement the minimal contract update**

Change only the SaiNam loader-version literal in `projectMetadata` and
`fallbackManifest` to `47.4.20`. Update stale representative test fixtures to
match the current production contract without changing sync behavior.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused tests, then:

```powershell
npm test -- --maxWorkers=1
npm run build
git diff --check
```

Commit the runtime-contract changes.

---

### Task 2: Launcher v0.3.2 Auto-update Release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/electron-build.test.ts`

**Interfaces:**
- Consumes: Task 1’s validated SaiNam Forge `47.4.20` runtime contract.
- Produces: GitHub Latest release `v0.3.2` and electron-updater metadata.

- [ ] **Step 1: Write the failing release-version test**

Change package and lockfile assertions in `electron-build.test.ts` from
`0.3.1` to literal `0.3.2`, then run that test and require RED.

- [ ] **Step 2: Bump package metadata**

Set the root `version` in `package.json`, `package-lock.json`, and
`package-lock.json`’s root package entry to `0.3.2`.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm test -- --maxWorkers=1
npm run build
git diff --check
```

Commit the version bump. Fetch `origin/main`, require it to remain the
published `v0.3.1` commit `0ddb011c184c0702cda02a6ff027cbf140839990`,
verify a fast-forward, and push `HEAD:main` without force.

- [ ] **Step 4: Package and publish**

Run `npm run publish:win`. Publish exactly:

- `BeforeBedtime-Launcher-Setup-0.3.2.exe`
- `BeforeBedtime-Launcher-Setup-0.3.2.exe.blockmap`
- `latest.yml`
- `BeforeBedtime-Launcher-Portable-0.3.2.exe`

- [ ] **Step 5: Verify production auto-update**

Require GitHub Latest to be `v0.3.2`, `latest.yml` to report `0.3.2` and the
`0.3.2` Setup path, and all four GitHub asset sizes/SHA-256 digests to equal
the local outputs. Require release tag, Launcher `HEAD`, and `origin/main` to
resolve to the same commit. Recheck the production SaiNam manifest still has
Forge `47.4.20` and the corrected BBTPhone SHA-256
`D6335C9AF1DED60EC7499C2261FBAFAD952DDF2A4920BBEA37288FE0DA9D161A`.
