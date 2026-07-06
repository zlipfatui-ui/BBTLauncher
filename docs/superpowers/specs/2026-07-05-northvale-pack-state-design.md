# Northvale Pack State Design

## Scope

Import only `mods`, `config`, and `resourcepacks` from the live Northvale
Modrinth profile. Never import saves, logs, screenshots, shaderpacks, account
data, caches, backups, or root-level runtime files.

## Storage

The local staging directory remains:

`BBTWeb/assets/launcher/projects/northvale/files`

The manifest generator hashes staged files, while an R2 upload command copies
the same relative paths to the `bbt-launcher-packs` bucket. Manifest file URLs
point at the BBTWeb Worker download route backed by R2, avoiding the 25 MiB
static asset limit.

## Launcher State

The main process compares the current manifest with
`<App Directory>/projects/northvale`.

- `install`: no managed project files exist. Button is `INSTALL`; badge is
  `NOT INSTALLED`.
- `update`: at least one manifest file is missing or changed, or a stale
  managed file exists. Button is `UPDATE`; badge is `UPDATE !`.
- `ready`: all managed files match size and SHA-256 and no stale managed files
  exist. Button is `PLAY`; badge is `UP TO DATE`.

`INSTALL` and `UPDATE` run sync only. `PLAY` authenticates and launches.

## Safety

The Worker normalizes object keys and serves only keys below
`northvale/`. The importer only accepts the three approved source roots.
Launcher cleanup is limited to those same managed roots.

