# SaiNam Copy Polish Design

## Goal

Give SaiNam its approved season label and Thai hero tagline without changing
the project's operational status or affecting Northvale.

## Approved Copy

- The selected-project trigger subtitle for SaiNam is
  `SEASON TEST · UP TO DATE`.
- The SaiNam row in the project menu uses the same
  `SEASON TEST · UP TO DATE` subtitle.
- The tagline below the large SaiNam hero title is `สายน้ำไหลหลาก`.
- Northvale keeps `SEASON 01 · UP TO DATE` and its existing Thai hero tagline.

## Implementation

Keep `statusText` as `UP TO DATE` in the launcher manifest because it represents
project state. Renderer helpers will derive SaiNam's display-only season subtitle
and hero tagline from the known `sainam` project ID. No manifest, installer,
sync, launch, or project-storage behavior changes.

## Verification

Renderer tests will select SaiNam and assert:

- the selected-project trigger contains `SEASON TEST · UP TO DATE`;
- the SaiNam menu row contains `SEASON TEST · UP TO DATE`;
- the hero renders `สายน้ำไหลหลาก`;
- Northvale's existing labels remain unchanged after switching back.

The complete launcher test suite and production build must pass.
