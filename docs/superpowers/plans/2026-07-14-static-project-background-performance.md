# Static Project Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline. Do not use subagents for this task.

**Goal:** Make the Northvale project screen static and reduce continuous renderer work while preserving its layout, gallery, drawer, and entrance transitions.

**Architecture:** Remove only the two infinite full-screen CSS animations and their unused keyframes. Keep the existing static grid, gallery image styling, and short route or component entrance animations. Release the result as launcher version 0.1.9 through the existing GitHub Releases pipeline.

**Tech Stack:** Electron, React, TypeScript, CSS, Vite, electron-builder, electron-updater, GitHub Releases

## Global Constraints

- Preserve unrelated working-tree changes and never reset or force-push.
- Do not add or run automated tests for this release; validate with `npm run build` only.
- Push the current branch and fast-forward `origin/main` before publishing.
- Publish Setup, Setup blockmap, Portable, and `latest.yml` for version 0.1.9.
- Never print `GH_TOKEN` or another secret.

---

### Task 1: Static project background

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Remove the infinite `project-grid-drift` animation from `.project-panel::before`.
- [ ] Remove the infinite `project-image-drift` animation and `will-change` from `.project-image`.
- [ ] Remove both unused drift keyframes while retaining the static image transform and all entrance animations.
- [ ] Bump the root package version from 0.1.8 to 0.1.9 in both package manifests.
- [ ] Run `npm run build` and inspect the production output.

### Task 2: Publish and verify 0.1.9

- [ ] Commit the related plan, CSS, and version changes with a meaningful release commit.
- [ ] Push the current branch, then fast-forward `origin/main` to the same commit without force.
- [ ] Run `npm run publish:win` with the existing environment token.
- [ ] Verify GitHub marks `v0.1.9` as the non-draft, non-prerelease latest release.
- [ ] Verify the four expected assets and confirm live `latest.yml` names the 0.1.9 Setup executable.
- [ ] Confirm local HEAD, the current remote branch, and `origin/main` resolve to the same SHA.
