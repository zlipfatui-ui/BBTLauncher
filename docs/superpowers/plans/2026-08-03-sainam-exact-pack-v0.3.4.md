# SaiNam Exact Pack and Launcher v0.3.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current SaiNam Owner pack as an exact 173-mod managed pack, ship the finished FancyMenu configuration without private runtime state, and release Launcher v0.3.4 so normal players repair cleanly while player-added mods and Owner files remain untouched.

**Architecture:** Launcher v0.3.4 changes SaiNam stale managed mods from preserve-only to REPAIR-and-remove and adds an explicit six-path migration for clients whose v0.3.3 managed index already forgot those files. BBTWeb imports only direct Owner JARs plus filtered FancyMenu configuration, preserves the four existing staged runtime defaults as seeds, regenerates the manifest, uploads the SaiNam delta to R2, and deploys after the Launcher auto-update release is live.

**Tech Stack:** Electron, React, TypeScript, Vitest, Node.js ESM tooling, electron-builder, GitHub Releases, Cloudflare Workers Static Assets, R2, Wrangler 4.x.

## Global Constraints

- Release Launcher `0.3.4` from current base `0.3.3` and publish GitHub tag `v0.3.4` as Latest.
- SaiNam stays Minecraft `1.20.1`, Forge `47.4.20`, and Java `17`.
- The canonical Owner root is `C:\Users\zLip\AppData\Roaming\.beforebedtime-launcher\projects\sainam`.
- The managed SaiNam mod set is exactly the 173 regular `.jar` files directly inside Owner `mods/` at import time.
- Never import `mods/.connector`, nested mod directories, `.input`, disabled, temporary, or symlink entries.
- Import Owner `config/fancymenu` but exclude `docs/`, files containing `.before-`, temporary files, backup files, disabled files, and symbolic links.
- Preserve the four existing staged `fancymenu_data` default files and emit each as `syncMode: seed`; never publish Owner runtime versions.
- Normal players lose only stale Launcher-managed SaiNam mods and the six exact migration paths; untracked player-added mods remain.
- Existing SaiNam Owner bypass remains a READY/no-op policy.
- NORTHVALE content, counts, hashes, cleanup behavior, Forge metadata, and artwork do not change.
- Do not change manifest schema, IPC types, public shared types, SaiNam artwork, or project copy.
- Use TDD for every code behavior: failing test, observed RED, minimal implementation, observed GREEN.
- Push both repositories fast-forward only; never force-push.

---

### Task 1: Make stale managed SaiNam mods repairable and removable

**Files:**
- Modify: `src/main/services/project-sync-policy.ts`
- Modify: `src/main/services/project-state.ts`
- Modify: `src/main/services/sync.ts`
- Test: `src/main/services/project-state.test.ts`
- Test: `src/main/services/sync.test.ts`

**Interfaces:**
- Produces: `SAINAM_RETIRED_MOD_MIGRATION_PATHS: readonly string[]` containing the six exact retired paths.
- Produces: `shouldTreatStaleManagedFileAsRepair(projectId: string, filePath: string): boolean` returning true only for stale managed SaiNam mods.
- Produces: `retiredSaiNamMigrationPaths(projectId: string): readonly string[]` returning the migration list only for SaiNam.
- Preserves: `shouldBypassExistingProjectSync(rootDir, projectId)` and Owner no-op semantics.

- [ ] **Step 1: Establish a clean Launcher baseline**

Run:

```powershell
cd 'D:\BeforeBedtime Remake\BBTLauncher\.worktrees\sainam-project'
npm install
npm test -- --maxWorkers=1
```

Expected: all v0.3.3 tests pass before behavior changes.

- [ ] **Step 2: Replace the old preservation expectations with failing exact-lock state tests**

In `project-state.test.ts`, replace the ordinary SaiNam stale-mod preservation case and extend the retirement coverage with behavior equivalent to:

```ts
it('reports a stale indexed SaiNam mod as changed so players get REPAIR', async () => {
  await writeFile(join(projectRoot, 'mods', 'removed-managed.jar'), 'old managed mod');
  await writeManagedIndex(root, 'sainam', [
    { path: 'mods/test.jar', syncMode: 'required' },
    { path: 'mods/removed-managed.jar', syncMode: 'required' }
  ]);

  await expect(inspectProjectState(root, 'sainam', asSaiNam(manifestFor('pack')))).resolves.toMatchObject({
    state: 'update',
    missing: 0,
    changed: 1,
    stale: 0
  });
});

it.each([
  'mods/aaa_particles_world-forge-1.20.1-1.0.3.jar',
  'mods/aaa_particles-forge-1.20.1-2.2.0.jar',
  'mods/letsdo-brewery-forge-1.1.9.jar',
  'mods/simplyswords-forge-1.56.0-1.20.1.jar',
  'mods/waystones-forge-1.20.1-14.1.18.jar',
  'mods/waystones-forge-1.20.1-14.1.20.jar'
])('reports migration path %s as changed without an index record', async (retiredPath) => {
  await mkdir(dirname(join(projectRoot, retiredPath)), { recursive: true });
  await writeFile(join(projectRoot, retiredPath), 'retired bytes');
  await expect(inspectProjectState(root, 'sainam', asSaiNam(manifestFor('pack')))).resolves.toMatchObject({
    changed: 1
  });
});

it('ignores an untracked player-added SaiNam mod', async () => {
  await writeFile(join(projectRoot, 'mods', 'player-added.jar'), 'player bytes');
  await expect(inspectProjectState(root, 'sainam', asSaiNam(manifestFor('pack')))).resolves.toEqual({
    state: 'ready', missing: 0, changed: 0, stale: 0
  });
});
```

Keep the existing Owner READY tests and NORTHVALE tests unchanged.

- [ ] **Step 3: Run the state tests and observe RED**

Run:

```powershell
npm test -- src/main/services/project-state.test.ts --maxWorkers=1
```

Expected: stale indexed SaiNam mods are still ignored and the six no-index migration files are not detected.

- [ ] **Step 4: Add failing sync tests for exact deletion and player-content preservation**

In `sync.test.ts`, replace `preserves a removed managed SaiNam mod for normal players` with an assertion that `removed-managed.jar` is deleted. Add a table-driven test that creates each six-path migration file without adding it to `managed-files.json`, calls `syncProject`, and asserts `readFile` rejects with `ENOENT`. Add a separate untracked `player-added.jar` that is not in the index and assert its bytes remain.

The test setup must use a clean required `mods/test.jar` manifest file so no fetch is expected:

```ts
fetchImpl: async () => {
  throw new Error('clean manifest file should not be downloaded');
}
```

- [ ] **Step 5: Run the sync tests and observe RED**

Run:

```powershell
npm test -- src/main/services/sync.test.ts --maxWorkers=1
```

Expected: ordinary stale managed SaiNam mods and no-index migration paths still exist.

- [ ] **Step 6: Implement the minimal SaiNam exact-lock policy**

In `project-sync-policy.ts`, replace the special Epic-only retirement constant with the exact release migration list:

```ts
export const SAINAM_RETIRED_MOD_MIGRATION_PATHS = [
  'mods/aaa_particles_world-forge-1.20.1-1.0.3.jar',
  'mods/aaa_particles-forge-1.20.1-2.2.0.jar',
  'mods/letsdo-brewery-forge-1.1.9.jar',
  'mods/simplyswords-forge-1.56.0-1.20.1.jar',
  'mods/waystones-forge-1.20.1-14.1.18.jar',
  'mods/waystones-forge-1.20.1-14.1.20.jar'
] as const;

export function shouldTreatStaleManagedFileAsRepair(projectId: string, filePath: string): boolean {
  return projectId === SAINAM_PROJECT_ID && isModPath(filePath);
}

export function retiredSaiNamMigrationPaths(projectId: string): readonly string[] {
  return projectId === SAINAM_PROJECT_ID ? SAINAM_RETIRED_MOD_MIGRATION_PATHS : [];
}
```

Remove ordinary SaiNam mod preservation. In `project-state.ts`, count a stale indexed SaiNam mod as `changed`, and scan the six migration paths after the index loop. Use a `Set` of already-counted normalized paths so an indexed migration path counts once. Skip any migration path that is present in the current required manifest.

In `sync.ts`, remove stale indexed required SaiNam mods like other stale required files. After that cleanup, remove each absent-from-manifest migration path using `assertInsideDirectory` and `rm(..., { force: true })`. Do not enumerate or remove any other local mod.

- [ ] **Step 7: Verify GREEN for Launcher sync behavior**

Run:

```powershell
npm test -- src/main/services/project-state.test.ts src/main/services/sync.test.ts src/main/services/project-content.test.ts --maxWorkers=1
npm test -- --maxWorkers=1
npm run build
```

Expected: full Launcher suite and production build pass; Owner and NORTHVALE regression tests stay green.

- [ ] **Step 8: Commit the Launcher behavior**

```powershell
git add src/main/services/project-sync-policy.ts src/main/services/project-state.ts src/main/services/sync.ts src/main/services/project-state.test.ts src/main/services/sync.test.ts
git commit -m "fix: lock SaiNam managed mods to manifest"
```

---

### Task 2: Bump and verify Launcher v0.3.4

**Files:**
- Modify: `src/renderer/electron-build.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: package/release version `0.3.4` consumed by electron-builder, `latest.yml`, artifact names, and GitHub publisher.

- [ ] **Step 1: Change the release assertion first**

Update the test title and all three expected root package versions in `electron-build.test.ts`:

```ts
it('publishes launcher release metadata as version 0.3.4', () => {
  expect(packageJson.version).toBe('0.3.4');
  expect(packageLock.version).toBe('0.3.4');
  expect(packageLock.packages[''].version).toBe('0.3.4');
});
```

- [ ] **Step 2: Run the version test and observe RED**

```powershell
npm test -- src/renderer/electron-build.test.ts --maxWorkers=1
```

Expected: actual package version is `0.3.3`.

- [ ] **Step 3: Apply the minimal package bump**

```powershell
npm version 0.3.4 --no-git-tag-version
```

Confirm only `package.json` and the two root version fields in `package-lock.json` changed.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm test -- src/renderer/electron-build.test.ts --maxWorkers=1
npm test -- --maxWorkers=1
npm run build
git add package.json package-lock.json src/renderer/electron-build.test.ts
git commit -m "chore: release launcher v0.3.4"
```

---

### Task 3: Import only canonical Owner mods and FancyMenu configuration

**Files:**
- Modify: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\tools\import-sainam-pack.mjs`
- Modify: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\tests\unit\import-sainam-pack.test.ts`

**Interfaces:**
- Consumes: Owner direct mods directory and Owner project root.
- Produces: staging roots `mods/`, filtered `config/fancymenu/`, and the four preserved canonical `fancymenu_data/` seed defaults.
- Preserves: atomic staging replacement and rollback on failure.

- [ ] **Step 1: Create the BBTWeb release branch from current origin/main**

```powershell
cd 'D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project'
git fetch origin --prune
git switch -c codex/sainam-exact-pack-v0.3.4 origin/main
npm install
npm test
```

Expected: clean current BBTWeb baseline passes.

- [ ] **Step 2: Write failing importer tests for the Owner layout**

Update the canonical import test so the mod source contains:

```text
mods/approved.jar
mods/fancymenu_forge_3.8.1_MC_1.20.1.jar
mods/readme.txt
mods/.connector/generated.jar
```

and the FancyMenu source contains:

```text
config/fancymenu/customization/SAINAM.txt
config/fancymenu/customization/SAINAM.txt.before-edit
config/fancymenu/docs/private-plan.md
config/fancymenu/assets/sainam.png
```

Prepopulate the old destination with all four canonical seed files. Assert the new destination contains only the two direct JARs, `SAINAM.txt`, `sainam.png`, and the unchanged four seed files. Assert `readme.txt`, `.connector`, `.before-edit`, and `docs` do not exist.

Keep separate tests that reject an unexpected nested mod directory and symbolic links without replacing valid staging.

- [ ] **Step 3: Run importer tests and observe RED**

```powershell
npm test -- tests/unit/import-sainam-pack.test.ts
```

Expected: `.connector` is rejected, non-JAR files are copied, backup/docs files are copied, and Owner runtime data replaces canonical defaults.

- [ ] **Step 4: Implement minimal import filtering**

In `import-sainam-pack.mjs`:

- Copy only direct regular files whose name ends in `.jar` case-insensitively.
- Skip the exact `.connector` directory; reject any other direct mod directory.
- Reject mod symlinks.
- Skip `config/fancymenu/docs` and any file containing `.before-`.
- Skip FancyMenu filenames ending in `.tmp`, `.bak`, `~`, or `.disabled`, case-insensitively.
- Copy the existing destination `fancymenu_data` tree into the temporary staging before the atomic rename; do not read Owner `fancymenu_data`.
- Require all four seed paths to exist before replacing staging:

```js
const requiredSeedPaths = [
  'action_favorites.json',
  'buddy/buddy_leveling.json',
  'buddy/buddy_save.json',
  'last_world.fmdata'
];
```

- Change CLI defaults to Owner paths:

```js
const ownerProject = join(process.env.APPDATA, '.beforebedtime-launcher', 'projects', 'sainam');
const sourceDir = process.argv[2] || process.env.BBT_SAINAM_MODS || join(ownerProject, 'mods');
const fancyMenuSourceDir = process.env.BBT_SAINAM_FANCYMENU_SOURCE || ownerProject;
```

- [ ] **Step 5: Verify GREEN and commit importer behavior**

```powershell
npm test -- tests/unit/import-sainam-pack.test.ts
npm test
git add tools/import-sainam-pack.mjs tests/unit/import-sainam-pack.test.ts
git commit -m "feat: import exact SaiNam Owner pack"
```

---

### Task 4: Emit SaiNam FancyMenu runtime data as seeds

**Files:**
- Modify: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\tools\build-launcher-manifest.mjs`
- Modify: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\tests\unit\launcher-manifest-generator.test.ts`

**Interfaces:**
- Produces: `syncModeForPath(projectId: string, safePath: string)` with project-aware FancyMenu data behavior.
- NORTHVALE `fancymenu_data` remains `required`; SaiNam `fancymenu_data` becomes `seed`.

- [ ] **Step 1: Change the generator test first**

In the SaiNam generator test, assert:

```ts
expect(sainam.files).toEqual(expect.arrayContaining([
  expect.objectContaining({ path: 'mods/Sai Nam Mod.jar', syncMode: 'required' }),
  expect.objectContaining({ path: 'config/fancymenu/menu.txt', syncMode: 'required' }),
  expect.objectContaining({ path: 'fancymenu_data/layout.txt', syncMode: 'seed' })
]));
```

Keep the Northvale fixture expectation for `fancymenu_data/layout.txt: 'required'`.

- [ ] **Step 2: Run generator tests and observe RED**

```powershell
npm test -- tests/unit/launcher-manifest-generator.test.ts
```

Expected: SaiNam FancyMenu data is still `required`.

- [ ] **Step 3: Make sync mode project-aware**

Change the helper and call site to:

```js
function syncModeForPath(projectId, safePath) {
  if (projectId === 'sainam' && safePath.startsWith('fancymenu_data/')) return 'seed';
  if (
    safePath.startsWith('mods/')
    || safePath.startsWith('resourcepacks/')
    || safePath.startsWith('config/fancymenu/')
    || safePath.startsWith('fancymenu_data/')
  ) return 'required';
  return 'seed';
}
```

Pass `project.id` when emitting each file.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm test -- tests/unit/launcher-manifest-generator.test.ts tests/unit/launcher-manifest-verifier.test.ts
git add tools/build-launcher-manifest.mjs tests/unit/launcher-manifest-generator.test.ts
git commit -m "fix: seed SaiNam FancyMenu runtime data"
```

---

### Task 5: Import the live Owner pack and lock the tracked release manifest

**Files:**
- Modify: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\tests\unit\launcher-release-manifest.test.ts`
- Modify: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\public\launcher\manifest.json`
- Generated/ignored staging: `D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project\assets\launcher\projects\sainam\files\`

**Interfaces:**
- Produces: 209 SaiNam manifest files: 173 required mods, 32 required FancyMenu config files, and 4 FancyMenu seed files.
- Produces: exact SaiNam total size `682561625` bytes for this source snapshot.

- [ ] **Step 1: Change tracked release expectations first**

Update `launcher-release-manifest.test.ts` to assert:

```ts
expect(sainam.files).toHaveLength(209);
expect(sainam.files.filter((file) => /^mods\/[^/]+$/.test(file.path))).toHaveLength(173);
expect(sainam.files.reduce((total, file) => total + file.size, 0)).toBe(682561625);
expect(sainam.files.filter((file) => file.path.startsWith('fancymenu_data/'))).toHaveLength(4);
expect(sainam.files.filter((file) => file.path.startsWith('fancymenu_data/')).every((file) => file.syncMode === 'seed')).toBe(true);
```

Assert these exact new entries:

```ts
expect.objectContaining({
  path: 'mods/aaa_particles_world-forge-1.20.1-2.0.0.jar',
  size: 5257257,
  sha256: '9F4ABDFD0BA6F0AD1C4B0039E6DAD0E72CE417A238E01B71723CC1BB85BDF5D7'
}),
expect.objectContaining({
  path: 'mods/aaa_particles-forge-1.20.1-2.2.3.jar',
  size: 5253752,
  sha256: '2D9E540E61FEB5B7795C77014662F1556C73AEE063391F1B0297AD60E62424FC'
}),
expect.objectContaining({
  path: 'mods/fairylights-1.1.5_fabric.jar',
  size: 762608,
  sha256: '6F2BEBBFCC69D1EC26398140C0FB0A25891A56D7C70E41DA50B42DEBD76BC5A2'
}),
expect.objectContaining({
  path: 'mods/BBTSkin-Forge-2.0.0.jar',
  size: 409083,
  sha256: 'F6AD61B66C523BD75B63A5D0E6A72805D1C311893C7EE7BE0C77D5590B91D019'
})
```

Assert the six retired paths, `config/fancymenu/docs/`, and `.before-` files are absent.

- [ ] **Step 2: Run the release-manifest test and observe RED**

```powershell
npm test -- tests/unit/launcher-release-manifest.test.ts
```

Expected: old tracked manifest has 195 files and 176 mods.

- [ ] **Step 3: Snapshot the source inventory before import**

Run a PowerShell inventory of direct Owner JAR name, size, and SHA-256 and save its console output outside both repositories. Confirm the count is 173 immediately before import. Abort if the count or the four specified hashes differ from this plan.

- [ ] **Step 4: Import and regenerate**

```powershell
$env:BBT_SAINAM_MODS='C:\Users\zLip\AppData\Roaming\.beforebedtime-launcher\projects\sainam\mods'
$env:BBT_SAINAM_FANCYMENU_SOURCE='C:\Users\zLip\AppData\Roaming\.beforebedtime-launcher\projects\sainam'
npm run pack:import:sainam
npm run build:launcher-manifest
```

Expected generated SaiNam inventory: 209 files, 173 direct mods, 32 config files, 4 seed files, 682561625 total bytes.

- [ ] **Step 5: Verify generated content and GREEN**

```powershell
npm test -- tests/unit/launcher-release-manifest.test.ts
npm run verify:launcher-manifest
npm run check
```

Expected: 2 projects and 961 total files (`752` NORTHVALE + `209` SaiNam); full BBTWeb suite and production build pass.

- [ ] **Step 6: Commit the web release contract**

```powershell
git add tests/unit/launcher-release-manifest.test.ts public/launcher/manifest.json
git commit -m "release: lock SaiNam Owner pack"
```

Do not force-add ignored `assets/launcher` staging.

---

### Task 6: Publish Launcher v0.3.4 before changing the production pack

**Files:**
- Verify only; release output is generated at `D:\BeforeBedtime Remake\BBTLauncher-release`.

**Interfaces:**
- Produces: GitHub Latest release `v0.3.4` with Setup, blockmap, `latest.yml`, and Portable assets.

- [ ] **Step 1: Rebase and run the final Launcher gate**

```powershell
cd 'D:\BeforeBedtime Remake\BBTLauncher\.worktrees\sainam-project'
git fetch origin --prune
git rebase origin/main
npm test -- --maxWorkers=1
npm run build
git diff --check origin/main...HEAD
```

Expected: clean tests/build and a linear branch based on the current remote main.

- [ ] **Step 2: Fast-forward remote main**

```powershell
git push origin HEAD:main
```

Verify local `HEAD` equals `origin/main`. Do not force.

- [ ] **Step 3: Build and publish all four auto-update assets**

```powershell
npm run publish:win
```

Expected release directory:

```text
BeforeBedtime-Launcher-Setup-0.3.4.exe
BeforeBedtime-Launcher-Setup-0.3.4.exe.blockmap
latest.yml
BeforeBedtime-Launcher-Portable-0.3.4.exe
```

- [ ] **Step 4: Verify GitHub publication**

Use `gh release view v0.3.4 --repo zlipfatui-ui/BBTLauncher --json tagName,isDraft,isPrerelease,isLatest,assets,url` and verify Latest, non-draft, non-prerelease, and exactly four expected assets. Download or query each release asset and compare its size and SHA-256 with the local release output. Parse `latest.yml` and confirm `version: 0.3.4` and the Setup filename.

---

### Task 7: Upload and deploy the exact SaiNam pack

**Files:**
- Verify/publish the committed BBTWeb branch.

**Interfaces:**
- Produces: R2 SaiNam objects/index matching the 209-file manifest.
- Produces: Cloudflare production manifest with NORTHVALE and SAINAM.

- [ ] **Step 1: Rebase and run the final BBTWeb gate**

```powershell
cd 'D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project'
git fetch origin --prune
git rebase origin/main
npm run check
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Fast-forward remote main**

```powershell
git push origin HEAD:main
```

Verify local `HEAD` equals `origin/main`. Do not force.

- [ ] **Step 3: Synchronize SaiNam R2 objects**

```powershell
npm run pack:upload:sainam
```

Record the uploaded, removed, and unchanged counts. Confirm the upload plan affects only the `sainam/` prefix and that every changed object matches the manifest SHA-256 and size.

- [ ] **Step 4: Deploy BBTWeb**

```powershell
npm run deploy
```

Record the new Cloudflare Worker Version ID.

- [ ] **Step 5: Verify production propagation**

Poll both URLs with cache-busting query strings until they return the same new ETag and 209-file SaiNam manifest:

```text
https://webbbt.zlipfatui.workers.dev/launcher/manifest.json
https://webbbt.zlipfatui.workers.dev/api/launcher/manifest
```

Require HTTP 200, project IDs `northvale,sainam`, NORTHVALE 752 files, SaiNam 209 files, and SaiNam Forge 47.4.20. Fetch the four changed/new JAR URLs from the production manifest and verify sizes and SHA-256 locally. Confirm each retired path is absent.

---

### Task 8: End-to-end release audit

**Files:**
- No modifications.

**Interfaces:**
- Produces: final evidence that auto-update, repair manifest, content safety, and repository state agree.

- [ ] **Step 1: Re-run fresh repository verification**

```powershell
cd 'D:\BeforeBedtime Remake\BBTLauncher\.worktrees\sainam-project'
npm test -- --maxWorkers=1
npm run build

cd 'D:\BeforeBedtime Remake\BBTWeb\.worktrees\sainam-project'
npm run check
```

- [ ] **Step 2: Audit the production contracts**

Verify:

- GitHub Latest is v0.3.4 and all four local/release asset SHA-256 values match.
- Production manifest has exactly `northvale:752` and `sainam:209`.
- SaiNam has 173 direct required mods, 32 required FancyMenu config files, and 4 FancyMenu seed files.
- Owner `last_world.fmdata` absolute local path does not appear anywhere in the tracked manifest or downloadable seed object.
- The three added mod paths and new BBTSkin hash are present.
- All six retired paths are absent from the manifest and R2 public route.
- NORTHVALE Forge/version/count/artwork and BBTPhone hash remain unchanged.
- Launcher and BBTWeb worktrees are clean.
- Both repository `HEAD` values equal `origin/main`.

- [ ] **Step 3: Report the completed rollout**

Report the Launcher release URL, Cloudflare Version ID, test counts, manifest counts, R2 delta counts, exact mod/config/seed counts, and any nonblocking warnings. Do not claim completion until every check above has fresh command evidence.
