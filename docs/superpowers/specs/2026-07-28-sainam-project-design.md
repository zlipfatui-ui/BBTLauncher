# SaiNam Project Design

## Goal

Add `SaiNam` as a second fully functional launcher project alongside
`Northvale`. Users can select either project, install or update its managed
files, launch it, and manage its user content without the projects sharing
installation state or files.

SaiNam must contain exactly the 177 files selected from:

`C:\Users\zLip\AppData\Roaming\ModrinthApp\profiles\Northvale _ BBT (1)\mods`

All filenames and file bytes are preserved, including different versions of
the same mod. No config, resource pack, shader pack, or other profile content
is imported.

## Project Metadata

- ID: `sainam`
- Display title: `SaiNam`
- Minecraft: `1.20.1`
- Loader: Forge `47.4.10`
- Java: `17`
- Status text: `UP TO DATE`
- Managed root: `<App Directory>/projects/sainam`
- Artwork cover: empty
- Artwork gallery: empty

Northvale keeps its existing metadata, managed root, artwork, files, and
behavior.

## Launcher Architecture

`ProjectId` becomes a union of the known `northvale` and `sainam` IDs.
Settings accept and persist either ID while continuing to fall back safely to
Northvale when an old, missing, or invalid value is loaded.

The main application resolves the selected project from the current manifest.
If the stored selection is absent from a refreshed manifest, it selects
Northvale when available or the first manifest project as a final fallback.
Project selection is passed explicitly to the header and project panel instead
of both components reading `manifest.projects[0]`.

The existing project-specific IPC, synchronization, content management, and
launch services continue to use the selected project ID. Their existing
project-root isolation keeps SaiNam under `projects/sainam` and Northvale under
`projects/northvale`.

## Project Selection UI

The project picker lists every project in manifest order. Selecting an entry:

1. switches the visible project immediately;
2. resets project-local gallery, status, progress, launch, and drawer state;
3. closes the picker;
4. persists `selectedProject` through the existing settings API; and
5. leaves the user on the Project tab.

The hard-coded disabled `COMING SOON` row is removed. The selected row is
marked current, and each row displays the project title and status.

Northvale retains its current cover image, season text, hero copy, gallery,
gallery dots, and content-drawer labels.

SaiNam displays its title and status but no logo or borrowed project artwork.
Its cover slot in the picker/header remains empty. Its project stage uses the
existing neutral dark panel background with no `<img>` element, no Gallery
dots, and no Gallery timer. The UI must not fall back to Northvale artwork
when an intentionally empty cover or Gallery is supplied.

SaiNam retains the existing INSTALL/UPDATE/PLAY/STOP actions and Manage Content
drawer. Project-specific labels use `SaiNam`, a `SN` monogram, and no invented
season, tagline, or Gallery content.

## Manifest and Pack Pipeline

The BBTWeb launcher pack tooling becomes project-aware rather than binding
generation and upload logic to Northvale:

- manifest generation scans a project configuration list and emits Northvale
  and SaiNam entries;
- file URLs use each entry's own project ID;
- Gallery scanning returns an empty array when no Gallery directory is
  configured;
- upload planning, object keys, remote indexes, and local pack roots receive a
  project ID;
- remote cleanup is limited to the selected project's prefix; and
- existing Northvale commands and behavior remain compatible.

A SaiNam import command stages only regular files directly from the supplied
`mods` directory into:

`assets/launcher/projects/sainam/files/mods`

The import rejects symbolic links and unsupported filesystem entries, copies
files without transforming them, replaces the previous SaiNam staging
directory atomically, and reports file and byte counts. The completed import
must report exactly 177 files and 727,416,534 bytes for the selected source.

The generated public manifest contains both projects. Every SaiNam mod is a
required managed file with its own path, encoded R2 URL, SHA-256 digest, size,
and `required` sync mode.

## Data Flow

1. BBTWeb imports the exact SaiNam mod directory into its launcher staging
   tree.
2. The manifest generator hashes Northvale and SaiNam staged files.
3. The project-aware uploader synchronizes SaiNam objects and its remote index
   under the `sainam/` R2 prefix.
4. The published BBTWeb manifest advertises both projects.
5. BBTLauncher refreshes the manifest, resolves the saved selection, and
   renders the selected project.
6. INSTALL or UPDATE downloads only the selected project's files into its own
   managed root.
7. PLAY launches Minecraft with the selected project's Minecraft and Forge
   metadata.

## Error Handling

- Invalid saved project IDs fall back without preventing launcher startup.
- A selected project disappearing after manifest refresh triggers the same
  deterministic fallback.
- Empty artwork is treated as intentional content, not a load failure.
- SaiNam import fails before replacing valid staging data when its source is
  missing, not a directory, contains links, or does not contain regular files.
- Manifest generation rejects unsafe relative paths using the existing path
  validation.
- R2 failures remain retryable under the existing upload rules and cannot
  delete objects outside the selected project prefix.
- Failed project inspection, synchronization, or launch continues to surface
  through the existing launcher status states.

## Testing

### BBTLauncher

- Type and settings tests accept both known IDs and reject unknown IDs.
- Renderer tests select SaiNam from the project picker and verify the selected
  project is persisted.
- Renderer tests verify switching back to Northvale restores Northvale content.
- Renderer tests verify SaiNam renders no cover image, project image, Gallery
  dots, or Northvale artwork fallback.
- Project action and content drawer calls use `sainam` while SaiNam is selected.
- Existing Northvale behavior remains covered.

### BBTWeb

- Import tests prove SaiNam copies only direct mod files byte-for-byte, rejects
  links, and replaces old staging safely.
- Manifest tests prove both projects are emitted with distinct metadata, paths,
  URLs, and artwork behavior.
- Upload tests prove project-scoped prefixes, indexes, uploads, and cleanup.
- Verification checks confirm the staged and manifested SaiNam pack contains
  exactly 177 files totaling 727,416,534 bytes.

Both repositories must pass their relevant unit tests and production builds
before completion is claimed.

## Delivery

Implementation changes are made without altering unrelated dirty work already
present in BBTWeb. Publishing the pack and manifest uses the existing
Cloudflare/R2 credentials and deployment workflow only after local import,
manifest verification, tests, and builds succeed.
