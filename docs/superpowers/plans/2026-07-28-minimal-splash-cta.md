# Minimal Splash CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the star-filled splash CTA with a responsive, glow-free white label and expanding straight underline, then publish version 0.2.4 for auto-update.

**Architecture:** Keep the existing `Splash` component and route transition contract, but delete all generated particle and decorative SVG markup. Use a single CSS pseudo-element for the underline so the visual treatment remains code-native, responsive, and accessible without new assets or dependencies.

**Tech Stack:** React 19, TypeScript 5.8, CSS, Vitest, Testing Library, Vite, Electron Builder, GitHub Releases

## Global Constraints

- Keep the accessible button name exactly `Click to start`.
- Keep the splash-to-auth/main transition, wordmark, family label, social links, and window controls unchanged.
- The splash background is pure black with no stars, particles, comets, sparks, glows, or light effects.
- The CTA text is solid white and the underline is a straight 1px white rule.
- The underline expands on hover and keyboard focus without changing surrounding layout.
- Reduced-motion users receive no underline or transform animation.
- Publish exactly version `0.2.4` with setup, blockmap, portable, and `latest.yml` assets.

---

### Task 1: Minimal splash CTA

**Files:**
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: existing `Splash({ onStart, api, isExiting })` props and `.start` selector
- Produces: the same accessible `button.start` click contract and a `.start::after` underline

- [ ] **Step 1: Replace the legacy Dream Trail regression tests with a failing minimal-design test**

Update the splash interaction test to retain its click-only navigation assertions while checking that legacy decorations are absent:

```tsx
it('keeps the minimal start CTA as the only splash transition trigger', async () => {
  vi.useFakeTimers();

  try {
    const { container } = render(<App api={makeApi()} />);
    const startButton = screen.getByRole('button', { name: /click to start/i });

    expect(container.querySelector('.splash-stars')).not.toBeInTheDocument();
    expect(container.querySelector('.star-particle')).not.toBeInTheDocument();
    expect(startButton.querySelector('svg')).not.toBeInTheDocument();
    expect(startButton).toHaveTextContent(/^Click to start$/);

    fireEvent.click(container.querySelector('.splash') as HTMLElement);
    fireEvent.mouseEnter(startButton);
    fireEvent.focus(startButton);
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });

    expect(container.querySelector('.splash.is-exiting')).not.toBeInTheDocument();

    fireEvent.click(startButton);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.splash.is-exiting')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: /login to microsoft/i })).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
```

Delete the obsolete `defines the Dream Trail CTA interaction states` source-text test. The rendered desktop and narrow-viewport checks in Task 2 cover the visual CSS contract directly.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/renderer/App.test.tsx -t "minimal"
```

Expected: FAIL because `.splash-stars` and the decorative SVGs still render.

- [ ] **Step 3: Remove generated particles and decorative SVG markup**

Delete `splashStars` from `src/renderer/App.tsx`. Remove the `.splash-stars` tree and all `.start-trail`, `.start-comet`, and `.start-spark` SVG children. Keep:

```tsx
<section className={`screen splash ${isExiting ? 'is-exiting' : ''}`}>
  <div className="splash-inner">
    <div className="logo-hit">
      <div className="splash-wordmark">BEFOREBEDTIME</div>
    </div>
    <div className="family">FAMILY</div>
    <button className="start" type="button" onClick={onStart}>
      <span>Click to start</span>
    </button>
    <div className="socials" aria-label="Social links">
      {socialLinks.map((link) => (
        <button
          className="social"
          key={link.label}
          type="button"
          aria-label={link.label}
          onClick={() => api.shell.openExternal(link.href)}
        >
          {link.icon}
        </button>
      ))}
    </div>
  </div>
</section>
```

- [ ] **Step 4: Replace legacy effect CSS with the minimal responsive CTA**

Delete `.splash-stars`, `.star-particle`, `@keyframes star-rise`, all trail/comet/spark selectors and keyframes, and their reduced-motion overrides. Replace the `.start` block and interaction rules with:

```css
.start {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: clamp(150px, 18vw, 190px);
  margin-top: 26px;
  padding: 0 12px 14px;
  border: 0;
  background: transparent;
  color: #fff;
  font-family: "Inter Tight", "Segoe UI Variable Display", "Segoe UI", Arial, sans-serif;
  font-size: clamp(15px, 1.4vw, 17px);
  font-style: normal;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.2;
  cursor: pointer;
  transition: transform 180ms ease;
}

.start::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0;
  width: clamp(88px, 10vw, 112px);
  height: 1px;
  background: #fff;
  transform: translateX(-50%);
  transition: width 220ms cubic-bezier(0.22, 0.8, 0.3, 1);
}

.start:hover,
.start:focus-visible {
  transform: translateY(-1px);
}

.start:hover::after,
.start:focus-visible::after {
  width: clamp(132px, 15vw, 168px);
}

.start:active {
  transform: scale(0.985);
}

.start:focus-visible {
  outline: 1px solid #fff;
  outline-offset: 6px;
}
```

Append the minimal reduced-motion override inside the existing media query:

```css
.start,
.start::after {
  transition: none;
}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npx vitest run src/renderer/App.test.tsx -t "minimal"
```

Expected: the matching test passes with no errors.

- [ ] **Step 6: Run the complete renderer test file**

Run:

```powershell
npx vitest run src/renderer/App.test.tsx
```

Expected: all renderer tests pass.

- [ ] **Step 7: Commit the minimal CTA**

```powershell
git add -- src/renderer/App.tsx src/renderer/styles.css src/renderer/App.test.tsx
git commit -m "feat: simplify splash start treatment"
```

---

### Task 2: Responsive visual verification

**Files:**
- Modify only if visual verification exposes a mismatch: `src/renderer/styles.css`

**Interfaces:**
- Consumes: Vite development server at `http://127.0.0.1:5173`
- Produces: verified desktop and narrow splash states with no visual artifacts or overflow

- [ ] **Step 1: Start the renderer development server**

Run:

```powershell
npm run dev
```

Expected: Vite serves the renderer at `http://127.0.0.1:5173`.

- [ ] **Step 2: Verify the desktop splash**

At 1280×720, inspect the initial splash, then hover and keyboard-focus `Click to start`. Confirm:

- Pure black background with no stars or light effects.
- Solid white label with no glow.
- Straight centered white rule.
- The rule expands without moving the label, wordmark, family label, or social icons.
- Focus has a visible thin outline and click still begins the route transition.

- [ ] **Step 3: Verify narrow responsive behavior**

At 620×720 and 390×700, repeat initial, hover, and keyboard-focus checks. Confirm no horizontal overflow, clipping, line wrapping, or collision with social icons.

- [ ] **Step 4: Compare the rendered screenshot with the approved direction**

Inspect the supplied reference and the latest implementation screenshot. Verify copy, pure-white palette, straight-rule treatment, spacing, responsive width, and the complete absence of stars/glow. Remove temporary screenshots after inspection.

- [ ] **Step 5: Commit any visual correction**

If CSS required adjustment:

```powershell
git add -- src/renderer/styles.css
git commit -m "fix: refine responsive splash CTA"
```

If no adjustment was required, do not create an empty commit.

---

### Task 3: Version 0.2.4 and release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/electron-build.test.ts`
- Generated outside repository: `../../BBTLauncher-release/*`

**Interfaces:**
- Consumes: verified Task 1 implementation, Electron Builder configuration, authenticated `GH_TOKEN`
- Produces: GitHub Release `v0.2.4` and updater metadata in `latest.yml`

- [ ] **Step 1: Increment package metadata without creating a tag**

Run:

```powershell
npm version 0.2.4 --no-git-tag-version
```

Expected: both package files report version `0.2.4`.

- [ ] **Step 2: Update the release metadata contract**

Change the version test name and all three package-version expectations in `src/renderer/electron-build.test.ts` from `0.2.3` to `0.2.4`, then run:

```powershell
npx vitest run src/renderer/electron-build.test.ts -t "version 0.2.4"
```

Expected: the release metadata test passes.

- [ ] **Step 3: Run full verification sequentially**

Run:

```powershell
npm test
npm run build
git diff --check
```

Expected: all Vitest tests pass, TypeScript/Vite production build exits 0, and Git reports no whitespace errors.

- [ ] **Step 4: Commit the release version**

```powershell
git add -- package.json package-lock.json src/renderer/electron-build.test.ts docs/superpowers/plans/2026-07-28-minimal-splash-cta.md
git commit -m "chore: release 0.2.4"
```

- [ ] **Step 5: Push main before creating the release tag**

Run:

```powershell
git push origin main
```

Expected: remote `main` contains the minimal CTA and version `0.2.4` commits.

- [ ] **Step 6: Build and publish Windows release assets**

Run:

```powershell
npm run publish:win
```

Expected: Electron Builder creates the setup executable, blockmap, portable executable, and `latest.yml`; the publisher uploads all four to a public, latest GitHub Release tagged `v0.2.4`.

- [ ] **Step 7: Verify published auto-update metadata**

Run:

```powershell
gh release view v0.2.4 --repo zlipfatui-ui/BBTLauncher --json isDraft,isPrerelease,tagName,url,assets
```

Confirm the release is public, non-prerelease, and includes:

```text
BeforeBedtime-Launcher-Setup-0.2.4.exe
BeforeBedtime-Launcher-Setup-0.2.4.exe.blockmap
BeforeBedtime-Launcher-Portable-0.2.4.exe
latest.yml
```

Download or inspect the published `latest.yml` and confirm it names version `0.2.4` and the setup executable so existing installs can discover the update.

- [ ] **Step 8: Verify repository and release state**

Run:

```powershell
git status -sb
git log -4 --oneline
gh release list --repo zlipfatui-ui/BBTLauncher --limit 3
```

Expected: the worktree is clean, `main` matches `origin/main`, and `v0.2.4` is the latest release.
