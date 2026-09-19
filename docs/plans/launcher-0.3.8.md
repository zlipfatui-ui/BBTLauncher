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
- Isolated worktree created on codex/launcher-v038; approved prototype assets copied; node_modules junction shares existing dependencies.
- Backend and renderer implementation pending; release QA and publication pending.
