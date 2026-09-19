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
