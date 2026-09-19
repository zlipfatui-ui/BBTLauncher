# Launcher 0.3.8 implementation ledger

Source of truth: user-approved plan in task, and public/mockups/launcher-start.html and launcher-redesign.html with their adjacent assets.

## Required outcome
Production React UI exactly follows approved black/white mockup, persistent animated starfield, local fonts/art, smooth interruptible routes and drawers, real account/game/content/settings/screenshots. General text and images cannot be selected/dragged; editable fields and content file drops still work. Preserve existing data paths and managed/user file policy. Northvale locked in UI and backend; migrate selection to SaiNam only.

RAM uses os.totalmem(), MB max floored to 64 MB (no 16 GB cap/reserve/free-memory cap); standard min 2048 extended for legacy smaller values. New default min(8192, half total) clamped to range; legacy valid value preserved. Enforce on save and Java launch. Hardware failure must be explicit, slider disabled, no fake cap. Refresh startup/settings open.

Screenshots list/read/openFile/revealFile/openFolder from current appDirectory/projects/id/screenshots; PNG/JPEG/WebP newest first, lazy thumbnails and selected full image, realpath containment including junctions. Refresh open/focus/path change; handle missing/unreadable/empty.

Auth cancel must close owned auth resources, invalidate in-flight/late work before persistence/navigation. Session restore preserved, Start goes main when signed in, otherwise Login with existing terms. starMotion defaults true for old settings; package version injected at build.

Motion timings: logo 680ms, login 480ms, main 680ms with 70ms stagger; press 90/release260; drawer420/220. One document, no iframe, no route star reset; prepare images/fonts before hiding current route; reduced motion and rapid reversal.

Release authorized: build Windows x64 Setup/Setup.blockmap/Portable/latest.yml at version0.3.8, validate names/sizes/SHA512; isolate QA app updater test0.3.7→0.3.8 localhost with busy guards. Draft pinned verified commit; publish stable Latest only after all4 assets verified. Preserve appId/productName/update provider; exclude mockups/QA. Verify public feed/downloads after release.

## Progress
- Baseline from source checkout: 205 tests / 26 files passing.
- Production React UI, local fonts/art, hardware RAM limits, cancellation, project locks, screenshot IPC and gallery are implemented. Backend and UI reviews completed; concurrency, junction races, retry and directory-change regressions are covered.
- Full source suite: 256 tests / 32 files passed on the physical D: checkout; the additional reduced-motion regression and all five navigation tests passed afterward. TypeScript and production build pass. Release validation has 19 passing tests.
- Browser inspection covered 1280x720, 640x480 and 1920x1080. The built renderer retained all 100 star nodes through seven route transitions (707 sampled frames, zero blank frames or star resets); rapid back/forward and panel open/close checks passed. Editable search text remained selectable; general UI text computed to user-select:none. Sidebar fits 1280x720 without scrolling, and the gallery does not shrink the hero.
- Isolated Windows installer QA passed 0.3.7 -> 0.3.8 via localhost: before-download, automatic-install-disabled, content/download, migration, screenshot-read and running-game guards; one restart installed and relaunched 0.3.8. Evidence is kept separately in D:/BBTLauncher-qa-staging/update-e2e. This fixture uses the production updater service (unchanged from v0.3.7) and a simulated running-game state. With no old cached installer, differential download successfully fell back to a full download.
- Work was integrated by fast-forward into the original D: checkout. Original untracked mockups/PRODUCT were preserved in D:/BBTLauncher-qa-staging/original-mockup-backup; unrelated user scripts remain untouched. Packaging requires physical node_modules because a junction produced an incomplete dependency graph; outputs and temporary files use D:.
- Final production artifacts passed validation against source commit f50e5483ff5c56d61dbfc7573a2216a6be7d584b. The actual packaged executable started with isolated data, loaded all six local font faces and the forest artwork, exposed all required IPC methods, matched physical RAM, and read concurrent thumbnail/full images successfully. All 69 reachable production dependencies resolved; launcher mockups, QA and tests were absent.
- Released https://github.com/zlipfatui-ui/BBTLauncher/releases/tag/v0.3.8 as stable Latest named 0.3.8. The publisher uploaded and verified all four draft assets before publication. Independent unauthenticated public downloads of all four files matched their full SHA512/SHA256 and sizes; the public Latest feed matched latest.yml. Evidence: D:/BBTLauncher-qa-staging/public-release-result.json.
- Real electron-updater 6.8.9 with currentVersion 0.3.7 detected public GitHub version 0.3.8 and the exact Setup filename. This final public check disabled downloads/installation; the earlier isolated installer QA separately proved restart, installation and relaunch. Evidence: D:/BBTLauncher-qa-staging/public-feed-check/result.json. All release gates are complete; the release tag and manifest remain pinned to the reviewed build commit.
