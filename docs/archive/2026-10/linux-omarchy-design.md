> **Archived 2026-10 from PR #2.** This proposal shaped the downstream Linux platform and distribution specs; its implementation is complete with physical host acceptance still deferred. It preserves the coherent design rationale connecting the native frame, packaging and update ownership choices. The body below is unchanged from its working state and is a clue to the change, not a record of it.

# Television for Linux design

User request: a full parity Linux desktop app matching Television for Mac and working on Omarchy. This is a downstream adaptation of MIT-licensed commit `e81bfc74732d6c84af3d254d1ba2625838cbd1fb`, release 1.4.23; it does not claim upstream Linux support or authority to publish upstream releases.

Linux reuses the production main process, preload, web UI and server, giving the Linux build the same channels, tabs, artifacts, editing, themes, keyboard navigation, connection/authentication/recovery, external links and version gate.

## Linux platform contract

- Target x86_64 Omarchy on Arch Linux and Hyprland/Wayland, with X11 fallback. Bundle Electron exactly 43.7.6; no Node/npm is needed to run the client.
- Use Electron's native Linux frame so minimize, maximize, close and compositor dragging work without inventing a second window-control bridge. Reserve Mac traffic-light space only on macOS. Retain Mac appearance and menus.
- Set the Linux desktop identity to `computer.telepath.television`, with Television name and icon. Preserve Electron's existing `Television` userData and connection format. Linux has an About item and Ctrl-based menu accelerators.
- Provide a tar.gz portable build, AppImage and an Arch PKGBUILD. Include a graphical installer and desktop launcher, plus an Omarchy-compatible launcher that selects Wayland when available and respects explicit Chromium platform flags. Never bake `--no-sandbox` or GPU disabling into distributable launchers.
- The client remains a sidecar: the agent's Television server can be local or remote. The client connects to the server beside the user's agent.

## Updates and trust

Mac continues using ToDesktop. Linux-target bundles exclude ToDesktop at build time. Linux AppImage updates use electron-updater with an HTTPS release feed configured by the distribution maintainer at build time. Preserve the existing downloaded-update IPC and restart UI. Without a configured feed, perform no update network requests and supply Linux-appropriate replacement instructions when gated. Pacman/portable installations are updated by their distribution, preserving connection data; never advertise a Mac installer to Linux users. No maintained Linux update feed is configured; update transport fixtures do not certify production download and replacement.

## Validation and delivery

Start with desktop unit baseline, add behavioral regression tests before platform/updater code, and exercise the actual Electron client against a token-protected real Television server. Check persistence/relaunch, disconnect, URL webviews/navigation, artifact rendering, native appearance and shortcuts. Build and launch the packaged Linux executable. Test real Wayland if a compositor can be brought up; record Hyprland/physical Omarchy checks as pending if unavailable. Run the canonical broad verification and identify infrastructure exclusions and upstream failures honestly.

The current execution record is [Omarchy host acceptance](linux-host-acceptance.md). Physical titlebar/compositor movement, keyboard input and perceived GPU behavior require host observation independently of native API and test-driver checks. Prepare the source branch for review after acceptance; publication and PR submission require a later user request.
