# SaiNam FancyMenu Default Design

## Goal

Make SaiNam use the same canonical FancyMenu release and menu configuration as
Northvale, migrate the owner's existing SaiNam project safely, and distribute
the result to every normal player through Launcher v0.3.0.

## Canonical Source

Use only the files already published in Northvale's canonical BBTWeb pack:

- `mods/fancymenu_forge_3.8.1_MC_1.20.1.jar`
- every file under `config/fancymenu/`
- every file under `fancymenu_data/`

Keep SaiNam's existing Konkrete and Melody versions. Do not copy Northvale
runtime-generated files, unrelated configs, maps, saves, or other mods.

## Player Migration

The SaiNam manifest replaces
`mods/fancymenu_forge_3.9.3_MC_1.20.1.jar` with the canonical 3.8.1 jar and adds
the canonical FancyMenu config/data files.

SaiNam normally preserves stale managed mods. Add one exact-path migration
exception for the old 3.9.3 FancyMenu jar so sync removes that jar after
installing 3.8.1. No wildcard or general version cleanup is allowed. Every
other stale SaiNam mod continues to be preserved.

Expected SaiNam manifest invariants:

- Forge `47.4.10`, Java 17
- 177 mods
- 196 total required files
- 710,317,127 total bytes

Northvale remains unchanged: Forge `47.4.20`, 752 files, 279 required files,
seed 473, and 992,802,139 total bytes.

## Owner Migration

Owner sync remains a no-op. Before changing the local owner project, copy the
current SaiNam FancyMenu jar, `config/fancymenu`, and `fancymenu_data` into a
timestamped backup directory outside `projects/sainam`.

Then replace only those targets with the canonical production files and rewrite
the owner's managed index from the verified production manifest. Validate all
resolved destructive targets are inside the SaiNam project directory first.

## Rollout

Publish the BBTWeb pack objects before deploying its manifest. Verify production
file counts, hashes, HTTP responses, and both project invariants. Then publish
Launcher v0.3.0 as GitHub Latest with Setup, blockmap, `latest.yml`, and
Portable assets. Verify local and remote hashes and the auto-update feed.

