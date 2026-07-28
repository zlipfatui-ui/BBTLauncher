# SaiNam Owner and Player Sync Policy Design

## Goal

Protect the owner's local SaiNam development files from all launcher-managed
changes while keeping normal SaiNam players manifest-managed. Normal players
must never lose an old mod merely because it was removed from the manifest.

This policy remains active until the owner explicitly requests a change.

## Scope

- The new full owner bypass applies only to the `sainam` project.
- The normal-player stale-mod preservation also applies only to `sainam`.
- Northvale behavior remains exactly as it is today, including its existing
  pack-author exceptions.
- The existing root marker, `.bbt-pack-author`, continues to identify the
  owner's machine. No owner-mode control is exposed in the launcher UI.
- Launcher version bumps and release publication are outside this change unless
  requested separately.

## SaiNam Owner Policy

The owner policy is active when:

1. the runtime root contains `.bbt-pack-author`;
2. the requested project ID is `sainam`; and
3. `projects/sainam` already exists.

While those conditions are true:

- project-state inspection returns `ready` with zero missing, changed, or stale
  files;
- project sync returns a successful no-op result with zero downloads and does
  not rewrite the managed-file index;
- the launcher does not inspect, download, overwrite, rename, or delete any
  manifest-managed SaiNam project file;
- local mods, configs, worlds, resource packs, shader packs, menu files,
  paintings, options, and any other project content remain entirely under the
  owner's control;
- missing manifest files do not turn PLAY into INSTALL or UPDATE.

If `projects/sainam` does not exist, the launcher performs the normal first
installation. After that project directory is created, later checks and syncs
use the owner no-op policy, even if the directory is empty or incomplete. The
owner accepts that launching an incomplete development pack may fail inside
Minecraft.

## Normal SaiNam Player Policy

When `.bbt-pack-author` is absent, SaiNam remains manifest-managed:

- missing manifest files are downloaded;
- an existing manifest file whose size or SHA-256 differs is replaced with the
  current manifest version;
- required configs and other managed files retain their current enforcement
  behavior;
- player-local files and forbidden roots such as saves remain protected by the
  current rules;
- a previously launcher-managed file under `mods/` is never deleted solely
  because a newer manifest no longer lists it;
- stale managed files outside `mods/` retain their current removal behavior.

If a mod update uses the same path, the changed file is replaced. If a mod
update uses a new filename, the new file is added and the old filename remains.
This append-only filename behavior can leave two versions installed, which is
intentional under the approved requirement.

After a stale SaiNam mod is preserved, it may be omitted from the rewritten
managed index and treated as local content on later runs. This makes the
preservation permanent and prevents a future stale-file cleanup from deleting
it.

## Architecture

Add a small project-aware sync-policy helper near the managed-project index
logic. It exposes two decisions:

- whether an existing project should bypass manifest state and sync entirely;
- whether stale launcher-managed mods should be preserved.

Both `inspectProjectState` and `syncProject` consume the same helper so the UI
state cannot advertise UPDATE while sync would do nothing, or advertise READY
while a direct sync call would mutate owner files.

The stale-file loops in project-state inspection and sync removal use the
project-aware preservation decision. Existing path normalization and
inside-directory checks remain in place for every normal sync path.

## Data Flow

### Owner with an existing SaiNam project

1. The launcher refreshes the manifest normally.
2. Project-state inspection identifies owner SaiNam bypass.
3. It returns READY without hashing project files.
4. PLAY launches the owner's current project directory.
5. If sync is invoked directly, it returns a zero-download success result
   without touching files or metadata.

### Owner without a SaiNam project

1. Project-state inspection returns INSTALL using the normal manifest rules.
2. Sync performs the normal first installation.
3. Subsequent inspections see the project directory and activate owner bypass.

### Normal SaiNam player

1. Project-state inspection checks current manifest files normally.
2. Missing and changed current files produce UPDATE.
3. Old managed mod paths missing from the manifest do not count as stale.
4. Sync downloads missing/current changed files and preserves old mod paths.
5. Stale managed non-mod files continue to follow the existing cleanup rules.

## Error Handling and Safety

- Owner bypass requires both the local marker and the exact `sainam` project
  ID, preventing it from leaking to normal players or other projects.
- A direct owner sync remains a successful no-op instead of failing or partially
  mutating the project.
- Normal sync keeps manifest validation, hash verification, temporary-file
  writes, and path-safety checks unchanged.
- No automatic marker creation or UI toggle is added.
- No files are migrated or deleted when this feature is installed.

## Testing

Add regression tests covering:

- owner SaiNam with an existing directory always reports READY despite missing,
  changed, and stale manifest-managed files;
- direct owner SaiNam sync performs no fetch, file mutation, stale removal, or
  managed-index rewrite;
- owner SaiNam without a project directory still reports INSTALL and performs a
  normal first sync;
- normal SaiNam players still download missing files and replace same-path
  changed mods;
- normal SaiNam players preserve stale managed mods removed from the manifest;
- normal SaiNam players still remove stale managed non-mod files;
- Northvale retains its current owner and player behavior.

Run focused project-state and sync tests first, followed by the complete test
suite and production build.
