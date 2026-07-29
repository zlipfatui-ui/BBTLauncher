# SaiNam FancyMenu 3.8.1 and Launcher v0.3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Make Northvale's canonical FancyMenu 3.8.1 and its menu config/data
the SaiNam default for every player, migrate the owner's pack safely, and
publish Launcher v0.3.0.

**Architecture:** BBTWeb remains the canonical pack source. Its SaiNam importer,
generator, and verifier admit only the approved FancyMenu config/data roots.
Launcher keeps general SaiNam stale-mod preservation but adds one exact-path
migration exception for FancyMenu 3.9.3. Owner sync remains bypassed, so the
owner runtime is backed up and migrated explicitly.

**Tech Stack:** Electron, React, TypeScript, Vitest, Node.js pack tooling,
Cloudflare Workers/R2, electron-builder, GitHub Releases

---

### Task 1: BBTWeb Manifest Contract

**Files:**
- Modify: `BBTWeb/tests/unit/launcher-manifest-generator.test.ts`
- Modify: `BBTWeb/tests/unit/launcher-release-manifest.test.ts`
- Modify: `BBTWeb/tests/unit/import-sainam-pack.test.ts`
- Modify: `BBTWeb/tests/unit/launcher-manifest-verifier.test.ts`
- Modify: the corresponding generator, importer, and verifier modules

- [ ] Write failing tests for the 3.8.1 replacement, approved config/data
  roots, 196 files, 177 mods, and 710,317,127 bytes.
- [ ] Assert unrelated SaiNam configs and forbidden roots remain rejected.
- [ ] Run the focused tests and confirm RED for the intended assertions.
- [ ] Implement the smallest allow-list changes needed for
  `config/fancymenu/**` and `fancymenu_data/**`.
- [ ] Copy canonical Northvale files into SaiNam staging and remove only the
  exact FancyMenu 3.9.3 staging jar.
- [ ] Regenerate the release manifest and verify GREEN.
- [ ] Run the full BBTWeb check suite.
- [ ] Commit the BBTWeb change.

### Task 2: BBTWeb Production Rollout

- [ ] Inspect the SaiNam upload command and confirm its exact mutation scope.
- [ ] Upload new SaiNam pack objects before publishing the new manifest.
- [ ] Fetch/rebase, verify fast-forward, and push BBTWeb without force.
- [ ] Deploy the BBTWeb Worker.
- [ ] Verify production SaiNam and Northvale manifest invariants.
- [ ] Verify the FancyMenu 3.8.1, config, and data URLs return HTTP 200 and the
  old 3.9.3 path is absent from the SaiNam manifest.

### Task 3: Launcher Migration Policy

**Files:**
- Modify: `src/main/project-state.test.ts`
- Modify: `src/main/sync.test.ts`
- Modify: `src/main/project-sync-policy.ts`

- [ ] Add failing tests proving the exact old managed FancyMenu path is stale
  and deleted for a normal SaiNam player.
- [ ] Keep tests proving unrelated stale SaiNam mods are preserved.
- [ ] Run focused tests and confirm RED.
- [ ] Add a constant exact-path exception without wildcard matching.
- [ ] Run focused tests and confirm GREEN.

### Task 4: Launcher v0.3.0

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: release/version assertions

- [ ] Change the version assertion first and confirm RED.
- [ ] Bump package and lockfile to `0.3.0`.
- [ ] Run the complete Launcher test suite and production build.
- [ ] Commit, fetch/rebase, verify fast-forward, and push without force.

### Task 5: Owner SaiNam Migration

- [ ] Resolve and validate the exact SaiNam project and backup paths.
- [ ] Back up the current FancyMenu jar, `config/fancymenu`, and
  `fancymenu_data` outside the project.
- [ ] Remove only the validated old FancyMenu targets.
- [ ] Copy the canonical 3.8.1 jar and canonical config/data.
- [ ] Rewrite the managed index from the verified production manifest.
- [ ] Verify old jar absent, new jar/hash present, config/data hashes match,
  mod count remains 177, index count is 196, and owner bypass remains active.

### Task 6: GitHub Release v0.3.0

- [ ] Build Setup, blockmap, `latest.yml`, and Portable artifacts.
- [ ] Publish GitHub Release `v0.3.0` as Latest.
- [ ] Verify release asset names, HTTP responses, local/remote SHA-256 values,
  `latest.yml` version, and auto-update URLs.
- [ ] Re-run critical production and repository-head checks.
- [ ] Record final verification evidence and release URL.
