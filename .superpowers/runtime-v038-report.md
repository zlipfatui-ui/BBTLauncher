# Launcher 0.3.8 backend implementation

Implemented in the isolated launcher-v038 worktree; only main/preload/shared, launcherApi.ts, and backend tests owned here.

## Contracts

- `system.getMemoryInfo(): Promise<IpcResult<SystemMemoryInfo>>`, `{ totalMb, maxMb }` from `os.totalmem()`.
- Shared `getMemoryRange(info, legacyMemoryMb?)` returns `{ minMb, maxMb, stepMb, defaultMb }`; `clampMemoryMb(value, info, legacyMemoryMb?)` preserves valid integers, including legacy unaligned values.
- `LauncherSettings.starMotion: boolean`, default `true`. Default and migrated `selectedProject` is `sainam`; data and directories remain untouched.
- `auth.cancelLogin(): Promise<IpcResult<void>>` invalidates login/restore work, closes owned resources and orders pending credential writes before clearing them.
- `project.screenshots.list(projectId): Promise<IpcResult<ProjectScreenshotListResult>>`, result `{ entries, directoryExists }`, each entry `{ relativePath, name, size, modifiedAt }`.
- `project.screenshots.read(projectId, relativePath, thumbnail = false): Promise<IpcResult<{ dataUrl }>>`.
- Screenshot `openFile`, `revealFile` take projectId/relativePath; `openFolder` takes projectId; all return `Promise<IpcResult<void>>`.

## Behavior

RAM maximum floors installed MB to 64 MB, no reserve or 16 GB cap. New default is half installed RAM up to 8192 MB, aligned to 64 MB and clamped to the range. Default lower bound 2048 MB extends to preserve a smaller valid legacy value. Hardware errors are explicit `SYSTEM_MEMORY_UNAVAILABLE`; settings remain readable, with zero only as an unset memory sentinel when no saved value exists. Saving RAM and launching require a valid hardware reading. Java launch rechecks/caps the RAM immediately before passing launch options.

Northvale is blocked at main sync/launch, launch orchestration and launcher boundaries with `PROJECT_LOCKED`. Existing runtime operation and game-directory change guards remain in place.

Screenshots resolve the current saved appDirectory on every IPC invocation and use realpath containment at root/projects/project/screenshots and file levels, including Windows junctions. PNG/JPG/JPEG/WebP entries sort newest first. List does not create missing folders; explicit openFolder creates them safely. Thumbnail decoding uses Electron nativeImage with a maximum dimension of 360; full selection decodes at full resolution. Errors return `SCREENSHOT_UNAVAILABLE`.

Legacy Live authentication passes an AbortSignal to the owned Electron window and token request. MSAL owns/cancels its loopback listener. Both providers invalidate every late outcome before applying the session. Serialized persistence ensures cancellation/logout clears an already-started write before completion; MSAL cache callbacks carry their originating auth operation via AsyncLocalStorage. Future owned MSAL clients are discarded on cancellation so stale memory cache changes cannot become the next session. Existing stored-session restore remains supported.

Browser fallback login and launch now explicitly return `DESKTOP_UNAVAILABLE`; renderer/browser tests must inject an API to simulate an account. No fake production login remains.

## Verification

- New functional tests were run red before implementation for memory policy, settings migration/caps/errors, screenshot service, cancellation, Northvale guard and Java memory cap.
- `npm test -- src/main`: **185 tests, 25 files passed** (2026-09-20 02:44 local).
- `npm run build:electron`: passed.
- `git diff --check`: no whitespace errors (repository CRLF notices only).
- Full `npm test` completed: **202 passed, 43 failed; 28 files passed, 1 failed**. The only failing file is the existing `src/renderer/App.test.tsx` (43 of 46 tests still target prior UI, e.g. splash wordmark CSS, old English terms/login selectors). Root owns and is updating it. New `src/renderer/redesign.test.tsx` passed all three tests.
- Full `npx tsc --noEmit` currently reports only old App.test.tsx mocks missing starMotion/cancelLogin/screenshots, communicated to root. Electron TypeScript passes.
- Screenshot tests include real temporary Windows junctions escaping screenshots/project directories and verify outside file contents remain unchanged. Other coverage: current root, missing/empty/untraversable folder, removed/corrupt images, supported extensions, sort order, thumbnail dimensions and shell failures.
- Memory fixtures: 4/8/16/32/64 GB, odd 8091 MB -> 8064 maximum / 4032 default, invalid/throwing readings, 1537/6145 legacy preservation, save cap, launch cap and launch hardware failure.
- Auth tests cover owned resource cancellation, late callback/token/cache/exchange outcomes, new login after cancellation and logout during a pending persistent write.

## Renderer note

An HTML range with unaligned legacy min/value and fixed step=64 sanitizes the legacy thumb and can make the maximum unreachable. Root was notified to preserve exact legacy state and use explicit 64 MB interaction snapping with endpoint handling.

## Remaining integration QA

Root handles renderer tests, native Electron end-to-end UI/auth/screenshots QA and release/update verification. No user settings, credentials, game data or external release state were touched by this subtask.

## Scoped review fixes (2026-09-20 03:00 local)

Addressed both screenshot findings:

- P1: extracted the actual main-process screenshot IPC registration into `project-screenshots-ipc.ts`. Read/list/openFile/revealFile use shared runtime read leases, acquired before resolving the current settings directory. Concurrent thumbnails/full images and synchronization can proceed together. All read leases remain visible to the updater idle guard and prevent directory migration; migration prevents new read leases. `openFolder` retains the existing mutation lock because it can create a directory. Other mutation serialization remains unchanged.
- P2: screenshot reads now open one `FileHandle`, compare its bigint device/inode identity and size/mtime/ctime to the validated path before and after opening/reading, and read all bytes through that handle. Replaced or changed files and unavailable file identity fail closed before decoding. Every path closes the handle in `finally`. Shell open/reveal continue resolving and validating the path immediately before handing it to the OS; the external application necessarily reopens a pathname, so the launcher cannot guarantee identity after the OS handoff.

Regression evidence:

- The extracted old IPC coordination failed both new integration tests: all concurrent calls during synchronization returned errors; only one overlapping root read started. Shared leases make both tests pass, with real temporary screenshot files and actual IPC handler coordination.
- The old pathname-read implementation reproduced an actual Windows junction swap exposing `private-outside-image` to the decoder while restoring the original directory before post-read realpath validation. The FileHandle implementation does not decode those bytes. Windows may refuse the ancestor rename while a child handle is open; that case explicitly returns SCREENSHOT_UNAVAILABLE. A second test swaps the ancestor only while opening, restores it, then proves the different opened file is rejected and its handle is closed (EBADF afterward).
- Focused runtime/screenshot tests: 19 passed across 4 files. All 27 backend files passed in the full run (191 backend tests).
- `npm run build:electron`: passed. `git diff --check`: no whitespace errors.
- Full `npm test` at 02:58: release tests 17/17 passed; Vitest 246 passed / 2 failed, 30 files passed / 1 failed. Remaining root-owned App.test.tsx failures: `syncs update (0 missing/0 changed/1 stale) before PLAY` (play button not found), and `keeps game state mounted across settings and shop` (getState calls 2 vs expected 1). A React act warning also appeared in the social-controls test. Root was notified with exact names.

Filesystem limits: byte reads pin an opened file and validate its identity; this does not promise exclusive ownership against another process rewriting the same file or a hostile filesystem fabricating file identities. Changes visible in file metadata fail closed. OS shell actions accept paths rather than FileHandles, so their post-handoff lifecycle belongs to the OS/application.
