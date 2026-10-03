# Television Linux implementation plan

> For agentic workers: use superpowers:executing-plans for inline execution. The user has authorized running setup and delivery without additional approval gates.

**Goal:** Deliver the existing Television desktop client as a Linux app suitable for Omarchy, with explicit parity evidence.

**Architecture:** Keep shared Electron/web/server behavior. Isolate Linux window policy, distribution build, launcher and update adapter from the Mac ToDesktop path.

**Tech stack:** Node 24/npm 11, TypeScript, Electron 43.7.6, electron-builder 26.16.1, electron-updater 6.8.9, Vitest and Playwright.

**Spec:** `docs/working/linux-omarchy-design.md`

## Global constraints

- x86_64 Omarchy/Hyprland, Wayland primary, X11 fallback.
- Preserve Mac ToDesktop release behavior and all existing artifact functionality.
- Preserve Television userData and frozen update IPC methods.
- No embedded credentials, sandbox-disabling flags, host service replacement or upstream releases.
- Keep source changes and review evidence local; publication and PR submission follow a later user request.

## Review focus

- Space-containing install paths and arbitrary CLI arguments reach the executable intact.
- Missing update feed does not make network calls; malformed/non-HTTPS feed fails safely.
- Remote upgrade instructions must not direct Linux users to a Mac binary.
- Wayland and X11 users can close/resize and identify the Television window.
- Existing saved credentials survive packaging and a second launch.

### Task 1: Linux window and platform identity

**Implementation:** `packages/desktop/src/index.ts` owns the Linux native frame/menu/identity policy; the context-isolated preload provides desktop platform and Linux upgrade instructions.

- [x] Write Linux native-frame/About/platform tests, run through canonical desktop unit surface and confirm failure.
- [x] Implement Linux frame/menu/identity; remove Mac traffic-light reservation on Linux via preload stylesheet; leave Mac default intact.
- [x] Run desktop unit suite and real connection/menu/window acceptance checks; commit.

### Task 2: Linux updates and gate instructions

**Files:** new `packages/desktop/src/linux-updater.ts`, new `packages/desktop/src/update-runtime.ts`, main process, `packages/web/src/services/desktop-gate.ts` and its runtime caller, regression tests.
**Interfaces:** `createLinuxUpdater({feedURL, packaged, appImage, onDownloaded})` provides `restartAndInstall`; runtime selection preserves Mac ToDesktop event semantics.

- [x] Write tests for download/version delivery, idle/no-feed, HTTPS validation, downloaded-only restart and Linux gate text; observe red.
- [x] Implement Linux adapter with electron-updater; keep provider imports lazy and bundle Linux dependency with desktop main. Make Linux instructions platform aware.
- [x] Run relevant unit and real update-notification/upgrade-gate tests; commit.

### Task 3: Linux packages and Omarchy integration

**Files:** `packages/desktop/scripts/linux-build.mjs`, Linux assets/install/launcher/PKGBUILD, package scripts and lockfile, downstream Linux guide and workflow.
**Interfaces:** `npm run package:linux` creates versioned portable tar.gz and AppImage, SHA256SUMS and Arch package sources.

- [x] Test launcher/backend/argument preservation and staging-package contents using actual scripts and isolated fixture executable; observe red.
- [x] Implement standalone staging and electron-builder package generation with native Electron licenses. Add graphical installation and launcher; package manager sources preserve normal sandbox and user data.
- [x] Build real artifacts, inspect licenses/hash/desktop entry, and launch packaged executable against real server. Commit.

### Task 4: Omarchy host acceptance and review candidate

Execution evidence lives in [Omarchy host acceptance](linux-host-acceptance.md).

- [x] Reconstruct the source branch, install pinned dependencies, build and use the provided client installer.
- [x] Check installed Wayland/X11 and both AppImage entrypoints with the production sandbox enabled.
- [x] Check a real CLI server connect link, declared HTML/Markdown/URL fixtures, native appearance, close/maximize APIs and saved connection across relaunch.
- [x] Revise Linux native-frame tests and their owning specs/proofs; obtain independent review.
- [x] Finish stable-tree broad verification and record its exact result.
- [ ] Accept physical controls, shortcuts, rendering responsiveness and required scaling cases on the host.
- [ ] Prepare the accepted local source candidate for upstream review. Submit only upon a later user request.
