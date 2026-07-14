# Northvale Content Toggle Design

## Goal

Give every user-controllable Mod, Resource Pack, and Shader row two distinct
actions: enable or disable the file, and move the file to the Recycle Bin.
Enabling and disabling must affect what Minecraft loads, not only change the
launcher UI.

## File-State Model

The launcher represents the disabled state by renaming the file in place:

- `mods/example.jar` becomes `mods/example.jar.disabled`.
- `resourcepacks/example.zip` becomes `resourcepacks/example.zip.disabled`.
- `shaderpacks/example.zip` becomes `shaderpacks/example.zip.disabled`.

Enabling reverses the rename. Disabled files remain visible in the drawer under
their logical filename (`example.jar` or `example.zip`) and carry
`enabled: false`. `relativePath` always identifies the actual file on disk so
toggle and trash operations cannot target a different state accidentally.

The service scans only regular, non-symlink files at the content-directory
root. It recognizes the normal extension and the same extension followed by
`.disabled`. A toggle is rejected without changing either file when the target
state already exists, the source is missing, or either path is not a regular
file.

## Ownership and Sync Rules

Manifest-managed Mods remain hidden and protected. User-installed Mods are
visible and receive both controls.

Resource Packs no longer expose a managed state in the drawer. All visible
Resource Packs receive both controls, including packs originally supplied by
the Northvale manifest. Their `MANAGED` badge and lock are removed.

Manifest Resource Packs use seed behavior:

- A fresh installation downloads the pack once.
- An active or `.disabled` copy counts as already seeded.
- After the pack has been seeded once, deleting both forms is treated as a user
  decision and later syncs do not download it again.
- Existing `managed-files.json` records are reused as the seeded marker so no
  new preference registry or migration file is required.
- Existing Resource Pack index records that say `required` are interpreted as
  seed records after this launcher update.

Shaders continue to be treated as user-owned files and receive both controls.

## Import, Delete, and Conflict Behavior

Imports still accept `.jar` for Mods and `.zip` for Resource Packs and Shaders.
An import checks both the enabled and disabled destination names. If either
exists, the existing custom replacement modal is shown before any file in the
batch is copied. Confirming replacement leaves one enabled copy and removes the
superseded state through the existing temporary-file and backup flow.

Trash accepts enabled and disabled relative paths. It validates the real file,
rejects symlinks and directories, and uses `shell.trashItem()`. Manifest Mods
remain protected because they never become user-controllable entries.

## Interfaces

`ProjectContentEntry` gains:

- `enabled: boolean`

The launcher API gains:

- `project.content.setEnabled(projectId, kind, relativePath, enabled)`

Preload forwards only the project ID, content kind, relative path, and desired
boolean state. Absolute paths remain confined to the main process.

## Drawer Interaction

Every visible row contains an enable switch followed by the existing delete
button. Disabled rows use a restrained grayscale opacity change while keeping
the filename and metadata readable. Resource Pack rows never render a managed
badge or lock.

After a toggle succeeds, the affected row refreshes and eight small white star
particles play once around the switch. Particles are 1–3 px, move 6–18 px, fade
within 520 ms, are `aria-hidden`, and do not render when
`prefers-reduced-motion: reduce` is active. A failed toggle shows the existing
drawer notice and does not play the effect.

All active, hover, focus, disabled, particle, and error treatments remain
strictly grayscale.

## Error Handling

The main process performs all path and ownership validation. Toggle collisions
never overwrite a destination. Import replacement remains opt-in through the
custom modal. After toggle, import, or trash, the active tab is refreshed from
disk so the UI never assumes an operation succeeded.

## Verification

No automated tests are added or changed, following the user's manual-testing
requirement. Run only `npm run build` for compile and production-bundle
verification, then hand off these manual checks:

- Toggle a user Mod off and on and inspect the `.disabled` rename.
- Toggle Resource Packs and Shaders off and on.
- Confirm each successful toggle plays one white star burst.
- Confirm reduced-motion disables the burst.
- Confirm every visible row has a switch and delete button.
- Confirm Resource Packs have no managed badge or lock.
- Delete a manifest-supplied Resource Pack, sync again, and confirm it does not
  return.
- Import while a disabled file with the same logical name exists and confirm
  the replacement modal appears.
- Confirm managed Mods remain hidden.
