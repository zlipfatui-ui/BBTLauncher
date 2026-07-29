# SaiNam Epic Fight Removal v0.3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only SaiNam's managed Epic Fight jar, show REPAIR to affected players, migrate the owner safely, and publish Launcher v0.3.1.

**Architecture:** BBTWeb removes the exact SaiNam pack object and publishes a 195-file manifest. Launcher adds one exact retired-file repair classification while retaining all general stale-mod preservation. Owner migration remains explicit because Owner sync is bypassed.

**Tech Stack:** Electron, TypeScript, Vitest, Node.js pack tooling, Cloudflare Workers/R2, electron-builder, GitHub Releases

## Global Constraints

- SaiNam only; Northvale remains unchanged.
- Remove exactly `mods/epic-fight-20.14.17-mc1.20.1-forge.jar`.
- Keep `mods/player-animation-lib-forge-1.0.2-rc1+1.20.jar`.
- Preserve every other stale or player-added SaiNam mod.
- Expected SaiNam production: Forge 47.4.10, Java 17, 195 required files, 176 direct mods, 702,251,934 bytes.
- Release version is 0.3.1.

---

### Task 1: SaiNam Production Pack

**Files:**
- Modify: `BBTWeb/tests/unit/launcher-release-manifest.test.ts`
- Modify: `BBTWeb/tests/unit/launcher-manifest-verifier.test.ts`
- Modify: `BBTWeb/tools/verify-launcher-manifest.mjs`
- Modify: `BBTWeb/public/launcher/manifest.json`

**Interfaces:**
- Consumes: ignored canonical SaiNam staging pack.
- Produces: production manifest with 195 required files and no Epic Fight path.

- [ ] Change release/verifier expectations to literal totals 195, 176, and 702251934, then run focused tests and confirm RED.
- [ ] Move the exact ignored Epic Fight jar to a recoverable BBTWeb pack backup after validating both absolute paths.
- [ ] Regenerate the manifest and run focused GREEN plus full `npm run check`.
- [ ] Commit, upload only SaiNam R2 changes, push main fast-forward, deploy the Worker, and verify production invariants and Epic Fight absence.

### Task 2: Exact REPAIR and Removal Policy

**Files:**
- Modify: `src/main/services/project-state.test.ts`
- Modify: `src/main/services/sync.test.ts`
- Modify: `src/main/services/project-sync-policy.ts`

**Interfaces:**
- Produces: exact normalized retired Epic Fight classification used by state inspection and sync.

- [ ] Add a state test whose managed Epic Fight jar produces `changed: 1`, `stale: 0`, and therefore SaiNam REPAIR semantics; confirm RED.
- [ ] Add a sync test proving the exact managed jar is deleted while the existing unrelated stale-mod preservation test remains green; confirm RED.
- [ ] Implement an exact case-sensitive normalized path helper with no wildcard/prefix matching.
- [ ] Run focused GREEN and the full Launcher suite.

### Task 3: Launcher v0.3.1

**Files:**
- Modify: `src/renderer/electron-build.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Change the release assertion to 0.3.1 and confirm RED.
- [ ] Bump package/lock root versions to 0.3.1 and confirm GREEN.
- [ ] Run the full suite with one worker and production build.
- [ ] Commit, fetch, verify fast-forward from v0.3.0 main, and push without force.

### Task 4: Owner Migration

- [ ] Verify the production manifest and current owner Epic Fight jar.
- [ ] Move only the owner Epic Fight jar into a timestamped backup under `.beforebedtime-launcher/backups/`.
- [ ] Rewrite the managed index from production using `writeManagedProjectIndex`.
- [ ] Verify 176 mods, 195 index records, zero manifest mismatches, Epic Fight absent, player-animation-lib present, and Owner bypass active.

### Task 5: Release v0.3.1

- [ ] Run a fresh full test suite.
- [ ] Build and publish Setup, blockmap, `latest.yml`, and Portable through the existing hidden `publish:win` workflow.
- [ ] Verify v0.3.1 is GitHub Latest; all four asset sizes/digests match local artifacts; `latest.yml` targets v0.3.1; tag, HEAD, and origin/main match.
- [ ] Recheck production SaiNam/Northvale invariants and Owner state before completion.
