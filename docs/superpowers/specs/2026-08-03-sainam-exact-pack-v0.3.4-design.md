# SaiNam Exact Pack and Launcher v0.3.4 Design

## Goal

Publish the current SaiNam Owner pack as the canonical player pack and release Launcher v0.3.4 so normal players can repair to the exact managed mod set without deleting mods they added themselves.

## Canonical Source

The canonical source is the existing Owner project at:

`C:\Users\zLip\AppData\Roaming\.beforebedtime-launcher\projects\sainam`

Only regular `.jar` files directly inside `mods/` are canonical mods. Generated Connector output under `mods/.connector/`, nested directories, `.input` files, disabled files, temporary files, and symbolic links are excluded.

The canonical FancyMenu configuration source is the same Owner project. Import `config/fancymenu/` subject to the filtering policy below. Keep the four existing staged `fancymenu_data/` defaults instead of importing Owner runtime state.

## Exact Managed Mod Set

The new SaiNam manifest contains the 173 direct Owner JARs present at import time. The release must fail if the imported staging list differs from the independently inventoried Owner list.

Changes relative to the current production pack include:

- Add `mods/aaa_particles_world-forge-1.20.1-2.0.0.jar`.
- Add `mods/aaa_particles-forge-1.20.1-2.2.3.jar`.
- Add `mods/fairylights-1.1.5_fabric.jar`.
- Replace the bytes for `mods/BBTSkin-Forge-2.0.0.jar` with the Owner copy.
- Retire `mods/aaa_particles_world-forge-1.20.1-1.0.3.jar`.
- Retire `mods/aaa_particles-forge-1.20.1-2.2.0.jar`.
- Retire `mods/letsdo-brewery-forge-1.1.9.jar`.
- Retire `mods/simplyswords-forge-1.56.0-1.20.1.jar`.
- Retire `mods/waystones-forge-1.20.1-14.1.18.jar`.
- Retire `mods/waystones-forge-1.20.1-14.1.20.jar`.

All current direct Owner JARs are required manifest files. A missing or changed managed JAR produces REPAIR. A retired managed JAR also produces REPAIR and is removed during repair.

## Player and Owner Policies

Normal SaiNam players are exact only for Launcher-managed mods:

- Required manifest mods are installed and hash-verified.
- Same-path changed mods are replaced.
- Mods retired from a previous managed manifest are removed.
- Untracked mods added by the player remain user content in MANAGE CONTENT and are never removed by exact-pack repair.

Launcher v0.3.3 and earlier could preserve a retired SaiNam mod and then drop its old managed-index record. Launcher v0.3.4 therefore includes a one-time migration list for the six retired paths in this release. State inspection detects those exact paths even if the old index record has already disappeared, and repair removes them. This migration does not match or delete any other player-added mod.

Owner behavior remains unchanged. If `.bbt-pack-author` exists and the Owner SaiNam project is already installed, state inspection returns READY and direct sync is a no-op. The Launcher does not replace, remove, or download project files for that Owner project.

## FancyMenu Import and Sync

The importer copies the functional FancyMenu tree from the Owner project while excluding development and backup artifacts:

- Exclude the `config/fancymenu/docs/` subtree.
- Exclude files whose names contain `.before-`.
- Exclude symbolic links, temporary files, generated caches, and unsupported filesystem entries.
- Preserve the functional layout, assets, UI themes, database/default files, and configuration files that remain after filtering.

Files under `config/fancymenu/` are required. Missing or changed files are repaired, and previously managed FancyMenu config files removed from the new canonical tree are cleaned up.

All four existing staged files under `fancymenu_data/` use `syncMode: seed`. They are installed when absent but are not hash-repaired after FancyMenu writes player or world state. The importer must not copy the Owner versions because `last_world.fmdata` contains the Owner machine's absolute local world path and the other files contain live player state. This prevents private runtime state from being published and prevents `last_world.fmdata`, `buddy_save.json`, favorites, and similar runtime data from causing REPAIR every time the game runs.

## Manifest and Storage Rollout

BBTWeb imports the filtered Owner content into SaiNam staging, regenerates the production manifest, verifies every staged file, and uploads only changed SaiNam objects to R2. NORTHVALE content and metadata remain unchanged. SaiNam remains Minecraft 1.20.1, Forge 47.4.20, and Java 17.

The release sequence is:

1. Build and publish Launcher v0.3.4 as GitHub Latest so the exact-lock migration is available through auto-update.
2. Upload the new SaiNam pack objects and deploy the new BBTWeb manifest.
3. Verify the production API exposes both NORTHVALE and SAINAM, every changed object returns HTTP 200 with the expected size and SHA-256, and the SaiNam manifest contains exactly the imported direct mod set.

The web-only alternative is rejected because Launcher v0.3.3 preserves ordinary stale SaiNam mods. Deleting every extra local JAR is also rejected because it would delete user-added mods.

## Launcher v0.3.4

The Launcher package, lockfile, build assertions, updater metadata, installers, and Portable artifact move from v0.3.3 to v0.3.4. The release contains Setup, blockmap, `latest.yml`, and Portable assets and is marked Latest.

No manifest schema, IPC contract, Forge version, Java version, artwork, project copy, or NORTHVALE behavior changes in this release.

## Testing

Implementation follows TDD.

Launcher tests must prove:

- A stale indexed SaiNam managed mod triggers REPAIR and is removed.
- Each of the six migration paths triggers REPAIR and is removed even without an index record.
- An untracked player-added mod remains present and appears as user content.
- Owner SaiNam continues to return READY and sync remains a no-op.
- NORTHVALE stale-file behavior does not change.
- Package and release assertions require v0.3.4.

BBTWeb tests must prove:

- The importer copies only direct Owner JARs.
- Connector output, nested mod directories, backups, docs, temporary files, and symbolic links are excluded or rejected as appropriate.
- Functional FancyMenu configuration files are copied while the four canonical staged runtime defaults are preserved.
- Every `fancymenu_data/` manifest entry is `seed`.
- The release manifest contains the 173 direct Owner mods, the new BBTSkin hash, the three additions, and none of the six retired mods.
- NORTHVALE manifest counts, hashes, Forge metadata, and artwork remain unchanged.

Before publication, run both full test suites and production builds. After publication, verify GitHub Latest v0.3.4, updater asset hashes, Cloudflare production manifest counts, file responses, and that both repositories match their pushed remote branches.
