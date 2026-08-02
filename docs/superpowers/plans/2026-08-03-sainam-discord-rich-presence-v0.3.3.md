# SAINAM Discord Rich Presence and Launcher v0.3.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-specific SAINAM Discord Rich Presence with its transparent logo and publish Launcher v0.3.3 so existing installations receive it through Auto Update.

**Architecture:** Start from the consolidated v0.3.2 `origin/main`, which already contains SAINAM Forge 47.4.20. Keep the existing Discord IPC transport and lifecycle state machine, but select the project activity from `ProjectLaunchState.projectId`; publish the verified Windows artifacts through the existing GitHub/electron-updater workflow.

**Tech Stack:** Electron 37, TypeScript 5, Vitest, Discord local RPC, electron-builder, GitHub Releases.

## Global Constraints

- Work directly on `main`, as explicitly approved by the user; do not create a new worktree.
- SAINAM uses Minecraft `1.20.1`, Forge `47.4.20`, and Java 17.
- SAINAM activity is exactly `กำลังเล่น SAINAM` / `Minecraft 1.20.1 • Forge 47.4.20`.
- SAINAM uses large image key `sainam` and tooltip `SAINAM`.
- Launcher and Northvale keep their existing text, BBT image, timers, and lifecycle behavior.
- `starting`, authentication, and synchronization remain Launcher presence; switch only on `running`.
- Do not add dependencies, renderer UI, OAuth, Join, party, buttons, or settings.
- Release version is exactly `0.3.3` and must include Setup, blockmap, `latest.yml`, and Portable assets.
- Publish only after tests, build, package, asset checks, and whole-branch review pass.

---

### Task 1: Consolidated Baseline

**Files:** None.

**Interfaces:**
- Consumes: clean local `main` and `origin/main` v0.3.2.
- Produces: one clean v0.3.2 baseline containing all SAINAM branches through Forge 47.4.20.

- [ ] Confirm every registered worktree is clean.
- [ ] Fetch `origin` with pruning and require local `main` to be an ancestor of `origin/main`.
- [ ] Fast-forward local `main` to `origin/main` with `git merge --ff-only origin/main`.
- [ ] Confirm SAINAM branches v0.2.8 through v0.3.2 are ancestors of `main`; leave the unrelated Northvale branch and old branch/worktree refs untouched.
- [ ] Run `npm test -- --maxWorkers=1`, `npm run build`, and `git diff --check` as the baseline gate.
- [ ] Commit this plan artifact with `docs: plan SAINAM Discord presence`.

---

### Task 2: SAINAM Discord Rich Presence

**Files:**
- Modify: `src/main/services/discord-rpc.ts`
- Modify: `src/main/services/discord-presence.ts`
- Modify: `src/main/services/discord-presence.test.ts`

**Interfaces:**
- Consumes: `ProjectLaunchState.projectId`, `SAINAM_PROJECT_ID`, and the existing `DiscordRpcClient`.
- Produces: `DiscordActivity.assets.large_image: 'bbt' | 'sainam'` and `large_text: 'BeforeBedtime' | 'SAINAM'`.

- [ ] Write a failing test that explicit Northvale `running` keeps the current Northvale activity.
- [ ] Write a failing test that SAINAM `running` publishes:

```ts
{
  type: 0,
  details: 'กำลังเล่น SAINAM',
  state: 'Minecraft 1.20.1 • Forge 47.4.20',
  timestamps: { start: expectedStart },
  assets: { large_image: 'sainam', large_text: 'SAINAM' },
  instance: false
}
```

- [ ] Write failing tests that SAINAM `starting` remains Launcher and repeated `running`/`stopping` preserves the game timestamp.
- [ ] Keep a compatibility test that a missing or unknown project ID uses the existing Northvale fallback.
- [ ] Run `npm test -- --run src/main/services/discord-presence.test.ts` and verify RED for the missing SAINAM branch.
- [ ] Widen the internal Discord asset literal types and make `projectActivity(start, projectId)` select SAINAM only for `SAINAM_PROJECT_ID`.
- [ ] Pass `state.projectId` on the Launcher-to-project transition; continue using `now()` rather than `ProjectLaunchState.startedAt`.
- [ ] Run the presence, RPC, and launch-manager focused tests plus `npm run build:electron` and verify GREEN.
- [ ] Commit with `feat: add SAINAM Discord Rich Presence`.

---

### Task 3: Transparent SAINAM Art Asset

**Files:**
- Create: `public/assets/images/logos/SAINAM.png`

**Interfaces:**
- Consumes: `C:\Users\zLip\Downloads\Sainamlogo.png`.
- Produces: tracked PNG and Discord Rich Presence art asset key `sainam`.

- [ ] Verify the source SHA-256 is `BFD0E21233C7E7E96AE974EE4742E111D37EF0EBC1DB643D834922699B109809`, dimensions are 2000x2000, pixel format contains alpha, and corner alpha is zero.
- [ ] Copy the source byte-for-byte to `public/assets/images/logos/SAINAM.png`; verify the destination SHA-256 matches.
- [ ] In Discord Application `1497214686238609418`, upload the PNG under Rich Presence Art Assets with key exactly `sainam`; if login is required, pause only for the user to authenticate.
- [ ] Verify the saved key is lowercase and Discord returns the large image for a SAINAM `SET_ACTIVITY` payload.
- [ ] Commit with `assets: add transparent SAINAM logo`.

---

### Task 4: Launcher v0.3.3 Auto-update Release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/electron-build.test.ts`

**Interfaces:**
- Consumes: Tasks 2-3 and the existing `publish:win` workflow.
- Produces: GitHub Latest release `v0.3.3` and electron-updater metadata.

- [ ] Change the release-version test to expect literal `0.3.3`, run it, and verify RED while package metadata remains `0.3.2`.
- [ ] Set the root version in `package.json`, both package versions in `package-lock.json`, and build-test assertions to `0.3.3`.
- [ ] Run the release-version test and verify GREEN.
- [ ] Run `npm test -- --maxWorkers=1`, `npm run build`, `npm run release:win`, and `git diff --check`.
- [ ] Verify local outputs contain exactly Setup, Setup blockmap, `latest.yml`, and Portable for `0.3.3`; verify `latest.yml` names version `0.3.3` and the `0.3.3` Setup path.
- [ ] Commit with `chore: release launcher v0.3.3`.
- [ ] Push `main` without force, then run the existing GitHub publication workflow without rebuilding unreviewed code.
- [ ] Verify GitHub Latest is `v0.3.3`, all four assets exist, local/remote sizes and SHA-256 digests match, and `origin/main`, the v0.3.3 tag, and release target resolve to the same commit.
- [ ] Verify an installed v0.3.2 Launcher detects v0.3.3 through Auto Update.

---

### Final Acceptance

- [ ] Launcher presence still uses the BBT image and Launcher timer.
- [ ] Northvale presence still uses the BBT image, Northvale text, and game timer.
- [ ] SAINAM presence shows the transparent SAINAM logo, exact approved text, and a fresh game timer only after `running`.
- [ ] Exiting either game returns to Launcher with a fresh Launcher timer.
- [ ] Discord restart restores the current activity without resetting its timestamp.
- [ ] Discord absence never blocks Launcher startup or project launch.
- [ ] Full tests, production build, Windows package, GitHub release, and Auto Update verification pass.
