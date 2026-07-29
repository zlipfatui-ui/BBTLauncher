# SaiNam Epic Fight Removal Design

## Goal

Remove only `mods/epic-fight-20.14.17-mc1.20.1-forge.jar` from SaiNam,
present normal players with REPAIR, migrate the owner's project safely, and
publish Launcher v0.3.1 through the existing auto-update channel.

## Scope

- SaiNam only; Northvale remains unchanged and keeps Epic Fight.
- Keep `mods/player-animation-lib-forge-1.0.2-rc1+1.20.jar`.
- Do not remove any other mod, config, map, save, or player-added content.
- Preserve the existing Owner bypass and general SaiNam stale-mod policy.

## Manifest and Pack

Remove the exact Epic Fight jar from SaiNam staging and regenerate the BBTWeb
manifest. Expected SaiNam invariants become:

- Forge 47.4.10 and Java 17
- 195 required files
- 176 direct mods
- 702,251,934 total bytes

The existing 19 FancyMenu config/data files remain required. R2 synchronization
removes only the retired SaiNam Epic Fight object. Northvale manifest and R2
objects remain unchanged.

## Launcher Repair Policy

Extend the exact retired-managed-file policy with the normalized Epic Fight
path. During normal-player SaiNam inspection, this exact retired file counts as
`changed` rather than a generic stale file, causing the existing SaiNam UI to
show REPAIR. During sync, the same exact managed file is deleted.

Every other stale SaiNam mod remains preserved. Matching is exact after path
separator normalization; there is no wildcard, prefix, fuzzy, or
case-insensitive removal.

## Owner Migration

Before removing the owner's Epic Fight jar, move it into a timestamped backup
under `.beforebedtime-launcher/backups/`. Then rewrite the managed index from
the verified production manifest. Verify 176 current mods, 195 index records,
zero manifest hash mismatches, and Owner bypass still active.

## Release and Verification

Use TDD for the state, sync, and release-version changes. Publish BBTWeb before
Launcher v0.3.1. Verify production manifest counts, Epic Fight absence,
representative FancyMenu downloads, Northvale invariants, Owner state, the
complete Launcher test/build suite, and all four GitHub release assets and
auto-update metadata.
