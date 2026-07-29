# SaiNam Forge 47.4.20 and Launcher v0.3.2 Design

## Goal

Publish Launcher `v0.3.2` so every user on `v0.3.1` receives an
auto-update that accepts the current SaiNam production manifest and launches
both normal players and the SaiNam owner with Forge `47.4.20`.

## Launcher Contract

The main-process manifest validator currently hardcodes SaiNam Forge
`47.4.10`, so `v0.3.1` can reject the deployed `47.4.20` manifest. Update the
SaiNam contract to `47.4.20` and reject the retired `47.4.10` value. Update
the renderer fallback manifest to the same version.

Northvale remains on Forge `47.4.20`. No project files, manifest schema, IPC,
sync policy, artwork, or mod list changes are part of this Launcher release.

## Owner Behavior

SaiNam owner mode continues to bypass file synchronization for an existing
project. It does not bypass runtime selection: the launch handler refreshes
the production manifest, and `launchProject` passes its loader version to
`ensureInstalled` and `launchMinecraft`. Tests must prove an owner-style
SaiNam launch uses Forge `47.4.20` while the project sync result remains a
no-op.

## Auto-update Release

Bump package metadata and release assertions to `0.3.2`. Run the complete
Launcher test suite and production build, fast-forward `main`, then publish
Setup, blockmap, `latest.yml`, and Portable artifacts as GitHub Latest.

Verification requires:

- GitHub Latest is `v0.3.2`.
- `latest.yml` reports `0.3.2` and points to the `0.3.2` Setup executable.
- All four local and GitHub asset sizes and SHA-256 digests match.
- Release tag, Launcher `HEAD`, and `origin/main` resolve to the same commit.
- The production SaiNam manifest still uses Forge `47.4.20` and the corrected
  BBTPhone hash.
