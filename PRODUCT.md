# BeforeBedtime Launcher

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

A Minecraft launcher for the BeforeBedtime projects Northvale and SaiNam. The current design task is an interactive browser prototype for a possible Launcher UI replacement, using interactions that can be implemented in the existing Electron renderer.

## Capabilities and Constraints

Repository evidence: Electron 37, React 19, TypeScript and Vite. Existing capabilities include Microsoft account sign-in, project selection, managed installation and updates, launch/stop, content management for mods/resource packs/shaders, and memory/display/directory settings. Default window is 1280 × 720; display settings allow smaller windows.

The browser prototype simulates launch, account and content operations. It must not change the installed launcher, launch Minecraft or edit real game files.

Northvale must remain visible but locked and unavailable for selection or launch in the prototype, as requested by the user. SaiNam remains playable in the simulation.

The user wants easier access to Minecraft screenshots for SaiNam: visible thumbnails, a large preview, and access to the image file or its folder. The browser prototype must distinguish sample artwork from actual player screenshots and keep any selected local images on the device.

The screenshot gallery must not take vertical space away from the main SaiNam artwork. Use the existing project info row and sidebar as entry points, with the full gallery opened separately.

The user approved the main Launcher design and requested matching Click to start and Microsoft login screens next. Keep the approved main layout intact. The entry prototype is a separate page that flows into the existing main screen; sign-in and acknowledgement remain simulated without sending credentials or accepting real agreements.

## Brand Commitments

The user explicitly asked to preserve stars in the new UI. They clarified that the old Minecraft screenshots are retired and supplied the current SaiNam launcher as visual context. Use the current painted SaiNam forest artwork. Do not reuse the local Northvale Minecraft screenshots. The user subsequently selected black-and-white UI colors. Keep the current forest illustration and stars; use neutral black, gray and white for the interface. Other visual decisions remain exploratory.

For the entry screens, the user explicitly wants visible animated background stars and very smooth interactions, including buttons and transitions. The Click to start typography must match the current Launcher: uppercase BEFOREBEDTIME in Barlow Condensed, FAMILY underneath, and the condensed Click to start text. Preserve the black-and-white palette and respect reduced-motion preferences.

The user specifically requested smooth transitions from Login into the main Launcher and from Click to start into the main Launcher. The prototype remembers a successful simulated sign-in in the same tab so returning players can enter directly from Click to start, with an account-switch link to replay login.

The user reported a flicker in the cross-document main-screen transition and requested motion on main-screen controls too. Keep Start, Login and the main screen in one document with the same continuously running star field. Preload and decode the main artwork before the handoff. Main buttons, switches, drawers, gallery, Path editor and content tabs should share smooth, interruptible feedback.

## Evidence on Hand

Current SaiNam forest artwork is referenced by the renderer at `https://webbbt.zlipfatui.workers.dev/assets/images/gallery/sainam/01.png`; the prototype bundles an unmodified copy. BeforeBedtime and SaiNam logos are in `public/assets/images`. Existing Thai copy and launcher API contracts are in `src/renderer`. No replacement Northvale art is supplied, so its prototype uses a typographic fallback. No live player counts, server latency, announcements or performance statistics are provided.

## Users and Operating Context

Inferred from the repository: players selecting a project and entering Minecraft from a Windows desktop launcher. The user has asked to evaluate the design in a browser first.
