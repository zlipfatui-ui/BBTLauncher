# SaiNam Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship SaiNam as a selectable, installable, updateable, launchable second BBTLauncher project and publish launcher version 0.2.3 for Auto Update.

**Architecture:** BBTLauncher will treat the selected manifest project as explicit application state and validate both supported project contracts. BBTWeb will use project descriptors to generate, verify, route, and upload isolated packs; SaiNam staging will copy the supplied mod directory byte-for-byte and publish it under its own R2 prefix.

**Tech Stack:** Electron 37, React 19, TypeScript 5, Vitest, Node.js ESM tooling, Cloudflare Workers/R2, electron-builder, GitHub Releases

## Global Constraints

- SaiNam ID is exactly `sainam`; display title is exactly `SaiNam`.
- SaiNam uses Minecraft `1.20.1`, Forge `47.4.10`, and Java `17`.
- SaiNam contains exactly the 175 regular files and 669,790,481 bytes currently in `C:\Users\zLip\AppData\Roaming\ModrinthApp\profiles\Northvale _ BBT (1)\mods`.
- Preserve every SaiNam filename and byte, including all different versions of duplicate mods.
- Import no config, resource pack, shader pack, or other profile content.
- Keep SaiNam under `<App Directory>/projects/sainam` and R2 prefix `sainam/`.
- Leave SaiNam cover and Gallery empty; never substitute Northvale artwork.
- Preserve all existing Northvale metadata, staged files, behavior, and artwork.
- Do not overwrite or include unrelated dirty changes in the existing BBTWeb checkout.
- Release BBTLauncher as version `0.2.3` with setup, portable, blockmap, and `latest.yml` assets.

---

### Task 1: BBTLauncher multi-project domain contract

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/settings.ts`
- Modify: `src/main/services/settings.test.ts`
- Modify: `src/main/services/manifest-client.ts`
- Modify: `src/main/services/manifest-client.test.ts`
- Modify: `src/main/services/project-content.ts`
- Modify: `src/main/services/project-content.test.ts`
- Modify: `src/renderer/launcherApi.ts`

**Interfaces:**
- Consumes: launcher manifest schema v1 and existing project-root services
- Produces: `SAINAM_PROJECT_ID`, `PROJECT_IDS`, `isProjectId(value): value is ProjectId`, validation for both project metadata contracts, and content support for either known project

- [ ] **Step 1: Write failing ID and settings tests**

Add assertions proving SaiNam persists and unknown IDs still normalize to
Northvale:

```ts
it('persists SaiNam as a known project', async () => {
  const saved = await saveSettings(rootDir, { selectedProject: 'sainam' });
  expect(saved.selectedProject).toBe('sainam');
  await expect(loadSettings(rootDir)).resolves.toMatchObject({ selectedProject: 'sainam' });
});

it('falls back from an unknown project id', async () => {
  const saved = await saveSettings(rootDir, { selectedProject: 'unknown' as never });
  expect(saved.selectedProject).toBe('northvale');
});
```

- [ ] **Step 2: Write failing manifest validation tests**

Create a two-project manifest fixture and assert SaiNam accepts empty artwork
and Forge 47.4.10:

```ts
const sainam = {
  id: 'sainam',
  title: 'SaiNam',
  statusText: 'UP TO DATE',
  minecraft: {
    version: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.4.10',
    javaMajor: 17
  },
  artwork: { cover: '', gallery: [] },
  files: []
};

expect(validateLauncherManifest({
  schemaVersion: 1,
  generatedAt: '2026-07-28T00:00:00.000Z',
  projects: [northvale, sainam]
}).projects[1]).toEqual(sainam);
```

Also assert duplicate project IDs, an unknown ID, and SaiNam with Forge
47.4.20 are rejected.

- [ ] **Step 3: Write failing project-content isolation test**

Exercise `ensureProjectContentDirectory()` or `listProjectContent()` with
`projectId: 'sainam'` and assert the resolved directory ends in
`projects/sainam/mods`, while `unknown` remains rejected.

- [ ] **Step 4: Run focused tests and confirm RED**

Run:

```powershell
npm test -- src/main/services/settings.test.ts src/main/services/manifest-client.test.ts src/main/services/project-content.test.ts
```

Expected: failures show SaiNam is not a valid `ProjectId`, manifest project, or
content root.

- [ ] **Step 5: Implement the known-project contract**

In `src/shared/types.ts`, define:

```ts
export const NORTHVALE_PROJECT_ID = 'northvale';
export const SAINAM_PROJECT_ID = 'sainam';
export const PROJECT_IDS = [NORTHVALE_PROJECT_ID, SAINAM_PROJECT_ID] as const;
export type ProjectId = (typeof PROJECT_IDS)[number];

export function isProjectId(value: unknown): value is ProjectId {
  return PROJECT_IDS.some((projectId) => projectId === value);
}
```

Keep Minecraft version and loader literal types, but allow
`loaderVersion: '47.4.20' | '47.4.10'`. Use `isProjectId()` in settings and
project-content validation. Replace project-name-specific import errors with
selected-project wording.

In `manifest-client.ts`, validate against:

```ts
const projectMetadata = {
  northvale: { loaderVersion: '47.4.20' },
  sainam: { loaderVersion: '47.4.10' }
} as const;
```

Require unique IDs, exact Minecraft/Forge/Java metadata per ID, non-empty
title/status, `cover` as a string including the intentionally empty string,
and Gallery items as non-empty strings.

Add SaiNam to `fallbackManifest` with empty artwork and no files. Update the
fallback settings API to preserve either known `selectedProject`.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```powershell
npm test -- src/main/services/settings.test.ts src/main/services/manifest-client.test.ts src/main/services/project-content.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the domain changes**

```powershell
git add -- src/shared/types.ts src/main/services/settings.ts src/main/services/settings.test.ts src/main/services/manifest-client.ts src/main/services/manifest-client.test.ts src/main/services/project-content.ts src/main/services/project-content.test.ts src/renderer/launcherApi.ts
git commit -m "feat: support SaiNam project metadata"
```

### Task 2: BBTLauncher project selection and empty artwork UI

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/LauncherHeader.tsx`
- Modify: `src/renderer/ProjectPanel.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `LauncherManifest.projects`, `LauncherSettings.selectedProject`, and `LauncherProject`
- Produces: `resolveSelectedProject(manifest, selectedProject)`, `LauncherHeader` project list selection, and `ProjectPanel({ api, project })`

- [ ] **Step 1: Write failing selection tests**

Extend the renderer fixture with SaiNam and assert:

```ts
await user.click(screen.getByRole('button', { name: 'Project' }));
await user.click(screen.getByRole('menuitem', { name: /SAINAM/ }));

expect(await screen.findByText('SAINAM')).toBeInTheDocument();
expect(api.settings.save).toHaveBeenCalledWith(
  expect.objectContaining({ selectedProject: 'sainam' })
);
expect(api.project.getState).toHaveBeenLastCalledWith('sainam');
```

Then select Northvale again and assert its existing eyebrow and Gallery return.

- [ ] **Step 2: Write failing empty-artwork tests**

After selecting SaiNam, assert:

```ts
expect(screen.queryByTestId('project-trigger-artwork')).not.toBeInTheDocument();
expect(screen.queryByRole('img', { name: /SaiNam gallery image/i })).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /Gallery image/i })).not.toBeInTheDocument();
expect(screen.queryByText('NORTHVALE / SEASON 01')).not.toBeInTheDocument();
expect(screen.getByText('SAINAM')).toBeInTheDocument();
```

Open Manage Content and assert the drawer identifies SaiNam and its project API
calls receive `sainam`.

- [ ] **Step 3: Run renderer tests and confirm RED**

Run:

```powershell
npm test -- src/renderer/App.test.tsx
```

Expected: project picker remains hard-coded and SaiNam renders Northvale
fallback artwork.

- [ ] **Step 4: Implement selected-project state**

In `MainShell`, resolve the project with this order:

```ts
const selectedProject =
  manifest.projects.find((project) => project.id === settings.selectedProject)
  ?? manifest.projects.find((project) => project.id === NORTHVALE_PROJECT_ID)
  ?? manifest.projects[0]
  ?? fallbackManifest.projects[0];
```

Pass `projects`, `project`, and `onProjectSelect` to `LauncherHeader`.
`onProjectSelect` updates local settings immediately and persists only
`{ selectedProject: projectId }`. If a refresh invalidates the selection,
normalize and persist the deterministic fallback.

Make `LauncherHeader` map every manifest project into a menu item, mark the
selected one current, remove `COMING SOON`, omit its artwork `<img>` when
`cover === ''`, and use `aria-label="Projects"` for the menu.

- [ ] **Step 5: Implement project-specific panel presentation**

Change `ProjectPanel` to accept a `LauncherProject`. Use:

```ts
const gallery = project.artwork.gallery;
const hasGallery = gallery.length > 0;
const isNorthvale = project.id === NORTHVALE_PROJECT_ID;
```

Reset Gallery index, status/progress, drawer state, and content revision when
`project.id` changes. Start a Gallery interval only when `hasGallery` is true.
Render the image and three dots only for a non-empty Gallery. Keep Northvale's
current hero copy, season, and `NV`; render SaiNam title/status, `SN`, and an
empty season without inventing copy or artwork. Add a neutral
`.project-stage.no-artwork` state using the existing dark background.

- [ ] **Step 6: Run renderer tests and confirm GREEN**

Run:

```powershell
npm test -- src/renderer/App.test.tsx src/renderer/assets.test.ts
```

Expected: selection, persistence, project-scoped actions, empty artwork, and
existing Northvale tests pass.

- [ ] **Step 7: Commit the renderer changes**

```powershell
git add -- src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/LauncherHeader.tsx src/renderer/ProjectPanel.tsx src/renderer/styles.css
git commit -m "feat: add SaiNam project selection"
```

### Task 3: BBTWeb exact SaiNam mod importer

**Files:**
- Create: `tools/import-sainam-pack.mjs`
- Create: `tools/import-sainam-pack.d.mts`
- Create: `tests/unit/import-sainam-pack.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ sourceDir: string, destinationDir: string }`
- Produces: `importSaiNamPack(options): Promise<{ files: number; bytes: number }>` and `npm run pack:import:sainam`

- [ ] **Step 1: Write failing importer tests**

Use temporary directories to create two `.jar` files, a nested directory, and
a symbolic link when the platform permits. Assert:

```ts
const result = await importSaiNamPack({ sourceDir, destinationDir });
expect(result).toEqual({ files: 2, bytes: 9 });
expect(await readFile(join(destinationDir, 'mods', 'a.jar'), 'utf8')).toBe('alpha');
expect(await readFile(join(destinationDir, 'mods', 'b.jar'), 'utf8')).toBe('beta');
await expect(access(join(destinationDir, 'config'))).rejects.toMatchObject({ code: 'ENOENT' });
```

Assert a subdirectory or link rejects the import without replacing an existing
valid destination.

- [ ] **Step 2: Run importer test and confirm RED**

Run from the isolated BBTWeb worktree:

```powershell
npm test -- tests/unit/import-sainam-pack.test.ts
```

Expected: module `tools/import-sainam-pack.mjs` does not exist.

- [ ] **Step 3: Implement atomic direct-file copying**

Export `importSaiNamPack()`. Resolve and validate both roots, require the source
to be a regular directory, sort entries, reject links/directories/non-files,
copy each file unchanged into `<staging>/mods`, then replace `destinationDir`
only after every copy succeeds. On CLI invocation, default the source to:

```js
join(process.env.APPDATA, 'ModrinthApp', 'profiles', 'Northvale _ BBT (1)', 'mods')
```

and destination to:

```js
join(projectRoot, 'assets', 'launcher', 'projects', 'sainam', 'files')
```

Add:

```json
"pack:import:sainam": "node tools/import-sainam-pack.mjs"
```

- [ ] **Step 4: Run importer tests and confirm GREEN**

Run:

```powershell
npm test -- tests/unit/import-sainam-pack.test.ts
```

Expected: importer tests pass.

- [ ] **Step 5: Commit the importer**

```powershell
git add -- package.json tools/import-sainam-pack.mjs tools/import-sainam-pack.d.mts tests/unit/import-sainam-pack.test.ts
git commit -m "feat: add exact SaiNam pack importer"
```

### Task 4: BBTWeb multi-project manifest and release verification

**Files:**
- Modify: `tools/build-launcher-manifest.mjs`
- Modify: `tools/build-launcher-manifest.d.mts`
- Modify: `tools/verify-launcher-manifest.mjs`
- Modify: `tests/unit/launcher-manifest-generator.test.ts`
- Modify: `tests/unit/launcher-manifest-verifier.test.ts`
- Modify: `tests/unit/launcher-release-manifest.test.ts`
- Modify: `public/launcher/manifest.json`

**Interfaces:**
- Consumes: ordered `launcherProjects` descriptors and staged project roots
- Produces: schema-v1 manifest with Northvale then SaiNam and verification result `{ projects: 2, files: number }`

- [ ] **Step 1: Write failing two-project generator tests**

Create Northvale and SaiNam test staging roots, then assert:

```ts
expect(manifest.projects.map(({ id }) => id)).toEqual(['northvale', 'sainam']);
expect(manifest.projects[1]).toMatchObject({
  id: 'sainam',
  title: 'SaiNam',
  minecraft: {
    version: '1.20.1',
    loader: 'forge',
    loaderVersion: '47.4.10',
    javaMajor: 17
  },
  artwork: { cover: '', gallery: [] }
});
expect(manifest.projects[1].files[0].url)
  .toMatch(/^\/api\/launcher\/files\/sainam\/mods\//);
```

- [ ] **Step 2: Write failing verifier and tracked-manifest tests**

Update fixtures to contain both projects. Require Northvale's existing 752-file
contract and SaiNam's exact 175 files/669,790,481 bytes. Assert every SaiNam
file is under `mods/`, uses `syncMode: 'required'`, and has a
`/api/launcher/files/sainam/` URL.

- [ ] **Step 3: Run manifest tests and confirm RED**

Run:

```powershell
npm test -- tests/unit/launcher-manifest-generator.test.ts tests/unit/launcher-manifest-verifier.test.ts tests/unit/launcher-release-manifest.test.ts
```

Expected: generator and verifier still require exactly one Northvale project.

- [ ] **Step 4: Generalize manifest generation**

Define ordered descriptors:

```js
const launcherProjects = [
  {
    id: 'northvale',
    title: 'Northvale',
    loaderVersion: '47.4.20',
    cover: '/assets/images/logos/ss0-cover.jpg',
    galleryDir: 'public/assets/images/gallery/ss0'
  },
  {
    id: 'sainam',
    title: 'SaiNam',
    loaderVersion: '47.4.10',
    cover: '',
    galleryDir: null
  }
];
```

Make file scanning and URL construction accept the descriptor instead of the
Northvale constant. Return an empty Gallery for `galleryDir: null`.

- [ ] **Step 5: Generalize manifest verification**

Index projects by ID, reject missing/extra/duplicate projects, retain exact
Northvale BBTSkin checks, and validate SaiNam count, byte total, root, metadata,
empty artwork, hashes, sizes, and required sync mode. CLI verification expects
Northvale 752 files and SaiNam 175 files.

- [ ] **Step 6: Run manifest tests and confirm GREEN**

Run:

```powershell
npm test -- tests/unit/launcher-manifest-generator.test.ts tests/unit/launcher-manifest-verifier.test.ts
```

Expected: generator and verifier tests pass. The tracked release-manifest test
remains red until the real pack is imported in Task 6.

- [ ] **Step 7: Commit generator and verifier code**

```powershell
git add -- tools/build-launcher-manifest.mjs tools/build-launcher-manifest.d.mts tools/verify-launcher-manifest.mjs tests/unit/launcher-manifest-generator.test.ts tests/unit/launcher-manifest-verifier.test.ts tests/unit/launcher-release-manifest.test.ts
git commit -m "feat: generate multi-project launcher manifest"
```

### Task 5: BBTWeb project-scoped R2 upload and file routing

**Files:**
- Modify: `tools/upload-launcher-pack.mjs`
- Modify: `tools/upload-launcher-pack.d.mts`
- Modify: `tests/unit/upload-launcher-pack.test.ts`
- Modify: `src/lib/launcher-files.ts`
- Modify: `tests/unit/launcher-files.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `projectId: 'northvale' | 'sainam'`
- Produces: `buildUploadPlan(projectId, localFiles, remoteFiles, remoteObjectKeys)`, `uploadLauncherPack({ projectId, ... })`, and safe Worker routing for either known ID

- [ ] **Step 1: Write failing project-scoped upload tests**

For `projectId: 'sainam'`, assert upload planning reads and removes only keys
under `sainam/`, uses `sainam/.launcher-index.json`, and never deletes a
`northvale/` key.

- [ ] **Step 2: Write failing SaiNam routing tests**

Assert:

```ts
const response = await handleLauncherFileRequest(
  new Request('https://bbt.example/api/launcher/files/sainam/mods/test.jar?sha256=ABC'),
  env
);
expect(get).toHaveBeenCalledWith('sainam/mods/test.jar');
expect(response?.status).toBe(200);
```

Unknown project IDs and non-`mods` SaiNam paths must return 404 without reading
R2.

- [ ] **Step 3: Run upload and route tests and confirm RED**

Run:

```powershell
npm test -- tests/unit/upload-launcher-pack.test.ts tests/unit/launcher-files.test.ts
```

Expected: upload and routing remain fixed to Northvale.

- [ ] **Step 4: Generalize upload logic**

Require `projectId`, derive the descriptor and pack root from it, and compute:

```js
const remoteIndexKey = `${projectId}/.launcher-index.json`;
const projectPrefix = `${projectId}/`;
```

Parse `--project sainam` in the CLI while keeping Northvale as the default for
the existing `pack:upload` command. Add:

```json
"pack:upload:sainam": "node tools/upload-launcher-pack.mjs --project sainam"
```

- [ ] **Step 5: Allow safe project-aware Worker routes**

Use a per-project allowed-root map:

```ts
const projectManagedRoots = new Map([
  ['northvale', managedRoots],
  ['sainam', new Set(['mods'])]
]);
```

Keep traversal/private/cache filters and Northvale `options.txt` exceptions.
SaiNam accepts only `mods/<regular path>`.

- [ ] **Step 6: Run upload and route tests and confirm GREEN**

Run:

```powershell
npm test -- tests/unit/upload-launcher-pack.test.ts tests/unit/launcher-files.test.ts tests/unit/worker-routing.test.ts
```

Expected: both project prefixes work and safety tests pass.

- [ ] **Step 7: Commit R2 and routing changes**

```powershell
git add -- package.json tools/upload-launcher-pack.mjs tools/upload-launcher-pack.d.mts tests/unit/upload-launcher-pack.test.ts src/lib/launcher-files.ts tests/unit/launcher-files.test.ts
git commit -m "feat: publish project-scoped launcher packs"
```

### Task 6: Import, verify, upload, and deploy the real SaiNam pack

**Files:**
- Modify: `public/launcher/manifest.json`
- Ignored generated data: `assets/launcher/projects/sainam/files/mods/*`

**Interfaces:**
- Consumes: the approved source mod directory, Cloudflare API credentials, and BBTWeb deployment configuration
- Produces: exact local staging, 175 R2 objects plus index, and production manifest advertising SaiNam

- [ ] **Step 1: Import the approved source**

Run:

```powershell
npm run pack:import:sainam -- 'C:\Users\zLip\AppData\Roaming\ModrinthApp\profiles\Northvale _ BBT (1)\mods'
```

Expected output reports exactly 175 files and 669,790,481 bytes.

- [ ] **Step 2: Verify source and staging byte-for-byte**

Generate sorted relative-path/size/SHA-256 inventories for the source and
`assets/launcher/projects/sainam/files/mods`, compare them, and require zero
differences. Also require counts `175` and total bytes `669790481`.

- [ ] **Step 3: Generate and verify the tracked manifest**

Run:

```powershell
npm run build:launcher-manifest
npm run verify:launcher-manifest
npm test -- tests/unit/launcher-release-manifest.test.ts
```

Expected: two projects validate; SaiNam has 175 files totaling 669,790,481
bytes.

- [ ] **Step 4: Run the complete BBTWeb check before mutation**

Run:

```powershell
npm run check
```

Expected: all tests, manifest verification, TypeScript, and Vite build pass.

- [ ] **Step 5: Commit the production manifest**

```powershell
git add -- public/launcher/manifest.json
git commit -m "feat: publish SaiNam launcher manifest"
```

- [ ] **Step 6: Upload only the SaiNam R2 prefix**

Load Cloudflare credentials without printing them, then run:

```powershell
npm run pack:upload:sainam
```

Expected: upload summary covers `sainam/` only and the resulting remote index
contains exactly 175 entries.

- [ ] **Step 7: Deploy the isolated verified BBTWeb worktree**

Run:

```powershell
npm run deploy
```

Expected: Wrangler reports a successful production deployment. Fetch
`/api/launcher/manifest`, assert both project IDs and SaiNam count/bytes, then
HEAD one percent-encoded SaiNam file URL and require HTTP 200 with the manifest
size.

- [ ] **Step 8: Push verified BBTWeb commits**

Fetch the remote and require the feature branch to be a fast-forward of
`origin/main`, then push the verified feature branch to `main`:

```powershell
git fetch origin main
git push origin HEAD:main
```

Do not stage, commit, or deploy the unrelated dirty files in the original
BBTWeb checkout.

### Task 7: Full launcher verification and Auto Update release 0.2.3

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: production two-project manifest and GitHub authentication
- Produces: pushed BBTLauncher main commit and GitHub Release `v0.2.3` with valid `latest.yml`

- [ ] **Step 1: Run the complete launcher baseline**

Run:

```powershell
npm test
npm run build
```

Expected: all Vitest tests pass and both Electron/Vite builds succeed.

- [ ] **Step 2: Smoke-test the production contract**

Fetch the production launcher manifest through `createManifestClient()`, assert
Northvale and SaiNam validate, inspect SaiNam as `install` in a temporary
launcher root, and verify the selected project resolves to `sainam`.

- [ ] **Step 3: Bump package metadata to 0.2.3**

Run:

```powershell
npm version 0.2.3 --no-git-tag-version
```

Assert both `package.json` and `package-lock.json` report `0.2.3`.

- [ ] **Step 4: Re-run release verification**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: tests/build pass and no whitespace errors exist.

- [ ] **Step 5: Commit the release version**

```powershell
git add -- package.json package-lock.json
git commit -m "chore: release launcher 0.2.3"
```

- [ ] **Step 6: Push verified launcher commits to main**

Fetch and require a fast-forward, then run:

```powershell
git fetch origin main
git push origin HEAD:main
```

- [ ] **Step 7: Build Windows artifacts and publish the GitHub Release**

Load `GH_TOKEN` without printing it and run:

```powershell
npm run publish:win
```

Expected: `v0.2.3` is created as the latest non-draft release and uploads:

- `BeforeBedtime-Launcher-Setup-0.2.3.exe`
- `BeforeBedtime-Launcher-Setup-0.2.3.exe.blockmap`
- `BeforeBedtime-Launcher-Portable-0.2.3.exe`
- `latest.yml`

- [ ] **Step 8: Verify Auto Update metadata**

Fetch the GitHub Release and raw `latest.yml`. Require release tag `v0.2.3`,
four named assets, `version: 0.2.3`, and SHA-512/size entries matching the
uploaded setup executable and blockmap. Confirm the release is latest,
published, and not a draft or prerelease.

- [ ] **Step 9: Final clean-state and production checks**

Run full tests/builds once more where inputs changed, check both isolated
worktrees for unexpected tracked changes, and re-fetch the production manifest
and one SaiNam object. Record exact test counts, deployment URL/version, commit
SHAs, and GitHub Release URL for handoff.
