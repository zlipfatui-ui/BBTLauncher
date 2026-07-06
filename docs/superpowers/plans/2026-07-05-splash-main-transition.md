# Splash Main Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished transition from the splash screen to the main launcher project screen.

**Architecture:** Keep the app as a single React renderer. Add route transition state in `App.tsx`, render a fixed overlay during the route change, and use CSS classes for splash exit and main reveal animations.

**Tech Stack:** React, TypeScript, CSS animations, Vitest, Testing Library.

---

### Task 1: Test Route Transition

**Files:**
- Modify: `src/renderer/App.test.tsx`

- [ ] Add a test that clicks `Click to start`, expects `.splash.is-exiting`, expects `.route-transition.active`, advances timers, and expects `.main.route-enter`.
- [ ] Update existing start/auth tests to wait for the delayed route change with `findByRole`.
- [ ] Run `npm test -- src/renderer/App.test.tsx --reporter=dot` and confirm the new transition test fails before implementation.

### Task 2: Implement Transition State

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] Add a transition phase state: `idle`, `splash-exit`, `main-enter`, `auth-enter`.
- [ ] On splash start, set `splash-exit`, wait briefly, then switch to `main` or `auth`.
- [ ] Render a `.route-transition` overlay while transition phase is not `idle`.
- [ ] Pass exit/enter classes into `Splash`, `AuthScreen`, and `MainShell`.

### Task 3: Add Animation CSS

**Files:**
- Modify: `src/renderer/styles.css`

- [ ] Add `splash-logo-exit`, `star-warp`, `route-wipe`, `route-scan`, `main-shell-enter`, `topbar-enter`, and panel reveal animations.
- [ ] Keep window controls above the route transition overlay.
- [ ] Add `prefers-reduced-motion` rules that remove heavy transforms.

### Task 4: Verify

**Commands:**
- `npm test -- src/renderer/App.test.tsx --reporter=dot`
- `npm test -- --reporter=dot`
- `npm run build`
- Restart Electron from `D:\BeforeBedtime Remake\BBTLauncher`.
