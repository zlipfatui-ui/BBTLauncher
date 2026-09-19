# Starlight Launcher design prototype

Open `/mockups/launcher-redesign.html` from the existing Vite dev server (`npm run dev`). All assets and fonts are local, so this page also works by opening the HTML file directly. No dependencies were added.

The approved standalone main screen remains at that URL. Run the entry flow through the Vite server at `/mockups/launcher-start.html`: **Click to start → Microsoft login → main Launcher**. After simulated sign-in, the same tab remembers the preview account: **Click to start → main Launcher** directly. The small account-switch link or `#login` opens login again; `#launcher` shows the main screen. Signing out in the main account drawer clears this preview session. All screens share the monochrome palette and fonts, with the approved main layout preserved.

Entry-screen typography now matches the current production splash: Barlow Condensed 700 for **BEFOREBEDTIME**, Barlow Condensed 400 for **Click to start**, and Inter Tight for **FAMILY**. Latin WOFF2 files are bundled locally with their OFL licenses. Thai interface text remains IBM Plex Sans Thai.

The entry sky uses 100 CSS particles at two depths, rising stars, occasional meteor streaks and two moving monochrome light layers. It stays mounted during navigation. The wordmark moves between its actual screen positions over 680 ms; supporting controls fade in over 480 ms. Transitions cancel cleanly on reverse navigation. Buttons, links, checkboxes and underlines have consistent press/release easing, and login feedback has reserved space to avoid layout jumps. Background motion pauses with the footer toggle or while the tab is hidden. Reduced-motion mode uses a static sky and immediate navigation. No animation library, canvas loop or extra runtime dependency is used.

Login success and returning-player Click to start now transition within the same document, exactly like Start → Login. `main-view.js` mounts the approved main HTML once, initializes its existing controls once, and decodes the artwork and loads fonts before exposing it. The original 100 stars, their animation clocks, and the titlebar remain mounted. There is no document navigation, screenshot transition, frozen sky or second star field. The outgoing controls fade for 220 ms while the live main view settles over 680 ms. Hash history supports back/forward, reversal and refresh. The entry flow requires HTTP because it fetches the local main HTML; the standalone main page still opens directly as a file. All account storage is mock sessionStorage state, not Microsoft authentication.

Main controls share eased hover/press/release states. Drawers animate open and closed with interruption handling, the screenshot dialog and backdrop fade on open/close (including Escape), the Path editor expands/collapses, content tabs reveal their content, and switches ease between positions. The RAM slider remains direct while dragging. `PreviewMotion` uses native Web Animations, preserves each control's resting transform, and respects reduced motion. The same motion helpers work in the embedded and standalone main views.

This is an exploratory browser design, not a replacement of the production renderer. The user requested a UI concept that can be implemented in the Launcher, asked to keep the stars, and supplied the current SaiNam forest scene after clarifying that the old Minecraft screenshots are retired.

## Direction

Mode: Operate. A quiet star field frames a cinematic project illustration. Persistent project navigation sits on the left; a fixed-position action area makes the install/update/play/stop workflow easy to find. Settings and content management use a right drawer with a keyboard focus trap and Escape-to-close. The user selected a black-and-white interface. The current SaiNam illustration retains its original color; controls, stars, typography and all UI states use neutral grayscale.

Use a neutral black surface, white foreground, IBM Plex Sans Thai, understated 1px dividers, four-point stars, and 8–12px surface corners. Reduced-motion preferences disable all motion. Stars use CSS opacity/transform only. There is no video, WebGL, canvas loop, or remote font dependency.

## What can be tried

- On the entry page, activate **Click to start** with the mouse or keyboard. The login page preserves the original terms/privacy acknowledgement in explicitly simulated form; no legal acceptance or sign-in is submitted. The Microsoft button becomes available after the preview checkbox is selected. Try loading, cancel, success and a connection-error result under **ลองสถานะพรีวิว**. Success opens the existing main prototype; Back and browser history allow replay. No Microsoft window, account request or password field is used.
- SaiNam is available. Northvale remains visible with a lock and “ยังไม่เปิดให้เล่น”; selection and launch are blocked, including after other launch states finish. It has no retired artwork.
- Start and stop a simulated game session; try install/update/error states from settings.
- Preview the Launcher auto-update control at the top right: downloading progress, **Restart to update** after download, and hidden when current. The initial preview shows the downloaded state. Clicking restart simulates completion without reloading or closing anything. Replay the states from **ลองดูอัปเดต Launcher** in settings.
- Adjust memory with a smooth, fine-grained slider, displaying MB (2048–16384 MB in 64 MB increments; for example, 10240 MB). The thumb and fill track the pointer directly; hover and focus transitions respect reduced-motion settings. Change display preferences and star motion. Save only under the prototype's `bbt-starlight-design-v1` localStorage key.
- Change the game/Modpack directory from settings with **เปลี่ยน Path**. The browser preview expands a path editor with apply/cancel; saving persists the sample path in the same localStorage key. No folders are read, created or moved. Replace the inline editor with `settings.selectAppDirectory(currentPath)` in Electron and preserve the existing save/migration flow.
- Open the existing Discord, TikTok and YouTube project links from the sidebar. The three links remain available as icons on narrow screens.
- Preview screenshots from the compact thumbnail button in the existing project info row or **รูปที่ถ่ายไว้** in the sidebar. The gallery does not reduce the main SaiNam artwork's height. The button opens a large, uncropped image viewer with a filmstrip, previous/next controls and arrow-key navigation. **เปิดไฟล์รูป** opens the image in a new tab. **ลองรูปจากเครื่อง** previews up to 30 selected PNG/JPG/WebP images (20 MB each) locally through object URLs; nothing is uploaded or persisted. Canceling the picker preserves the selection, unreadable files are skipped, and Escape closes the viewer.
- The initial gallery uses only the current SaiNam illustration, clearly marked as a UI sample; it does not claim to contain actual player screenshots or reuse retired Minecraft art. Folder/reveal controls explain their simulated behavior. Browser APIs cannot reveal a local file in Windows Explorer.
- Search sample content, switch Mods/Resource packs/Shaders, toggle user-owned example entries, and add example entries. No game directories are read.
- View a shop empty state and a simulated Microsoft account flow. No authentication occurs.

All operational data is illustrative. The titlebar labels the whole screen as a UI prototype. Fullscreen/resolution controls record a draft setting; they do not change the real Launcher window. Social destinations are copied from the existing renderer's `socialLinks`.

## Porting to the existing renderer

| Prototype region | Existing implementation |
| --- | --- |
| Entry screens | Existing `Splash`, `AuthScreen`, route transitions and `auth.loginMicrosoft` in `App.tsx`; replace the preview timers with the real auth result, preserving legal acknowledgement and error handling |
| Project rail | `LauncherHeader` project selection and `App` selectedProject |
| Hero and action dock | `ProjectPanel` project/install/launch state |
| Install/update/error/launch progress | `project.getState`, `project.sync`, `project.launch`, `project.stop`, `project.onProgress`, `project.onLaunchState` |
| Content drawer | `ProjectContentDrawer` and `project.content` APIs; preserve real managed/user file policies |
| Settings | `settings.load/save`, directory chooser and window display APIs |
| Screenshot gallery | New project-scoped listing/thumbnail APIs are needed; resolve the selected project's actual `screenshots` directory in main, validate paths, serve images via a constrained local protocol, and use `shell.openPath` / `shell.showItemInFolder` for folder/reveal actions. These are not implemented by the prototype. Keep player screenshots out of managed downloads and migration cleanup. |
| Profile drawer | `auth.getState/loginMicrosoft/logout`; preserve the existing legal acknowledgement and auth errors |
| Window controls | `window.minimize/toggleMaximize/close` |
| Launcher auto-update | `updater.getState/onState/quitAndInstall`; the existing `LauncherHeader` enables restart only for `downloaded` |

Keep Electron IPC and renderer state authoritative when porting; replace all browser simulation handlers. Convert these regions to React components and reuse CSS tokens. Production source files have not been changed.

## Asset origin

- `sainam-forest.png`: unmodified current artwork from `https://webbbt.zlipfatui.workers.dev/assets/images/gallery/sainam/01.png`, matching the user-provided current Launcher screenshot.
- SaiNam logo: existing `public/assets/images/logos/SAINAM.png`.
- Fonts: existing installed `@ibm/plex-sans-thai` package; the bundled OFL license is in `fonts/LICENSE.txt`.
- Entry fonts: Barlow Condensed and Inter Tight from the same Google Fonts families imported in production `src/renderer/styles.css`; local WOFF2 assets from `fonts.gstatic.com` and OFL license files from the Google Fonts repository.
- Stars and interface icons: geometric SVG symbols authored in the prototype HTML. Social icons are reused from `src/renderer/icons.tsx`.
