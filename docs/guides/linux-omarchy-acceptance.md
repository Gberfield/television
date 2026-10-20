# Linux and Omarchy compatibility acceptance

This is the executable handoff for the outstanding acceptance checks in
[the fork operational holds](fork-overview.md#source-validation-and-operational-holds).
Source integration and a green local gate do not establish these results.
The prior disposable guest never became ready and was removed after evidence
export. No test desktop is currently allocated for this task. A new disposable
desktop requires explicit approval of its creation, interruptions and cleanup;
these instructions do not authorize creating one, touching existing desktops,
installing on the host, or enabling a production update feed.

## Required acceptance matrix

For each tested immutable Omarchy source state, record actual guest OS, compositor version/capability, shell and package identities separately from source checkout SHA. Merely checking out a tag does not update installed runtime. No compatibility-reviewed SHA advances until those identities and the relevant checks are established.

- Build portable and AppImage packages from the same committed candidate. Install only inside the approved disposable guest; no production feed is configured.
- Connect the actual packaged client to an isolated real token-protected server; persist and relaunch, disconnect and reconnect; render HTML, Markdown and external URL artifacts and exercise native links, editing and themes.
- Run five Hide/launcher-restore cycles for Wayland and X11 on portable and extracted AppImage entrypoints in the real isolated Hyprland guest. Capture before/hidden/after and independent all-output compositor observations; preserve document/edit/socket/profile continuity, hidden-period server updates and sandbox evidence.
- Exercise two profiles, refused/lost control, startup/rapid requests, missing/replaced target, removed origin, manual move/reveal, supported native states, tray Show/Hide/Disconnect/About/Quit and unavailable-tray fallback without touching the agent server.
- Check guest Firefox external-link routing, native frame movement/resizing, theme transitions and readable UI at available guest scale settings. Record that host physical input/GPU/mixed-output scaling and real production updater replacement remain separate acceptance.

Canonical fixture entrypoints (run only in the approved isolated guest):

- `npm test -- local --file packages/desktop/test/e2e/linux-packaged.test.ts`: set `TV_LINUX_PACKAGE_DIR` to the candidate package directory, `TV_LINUX_PACKAGE_LAUNCHER` to its actual portable/extracted-AppImage launcher, `TV_LINUX_EVIDENCE_DIR` to a new evidence directory, `TV_LINUX_REQUIRE_SANDBOX=1` and `TV_LINUX_REQUIRE_WINDOW_MANAGER=1`. Keep production sandbox enabled; no `--no-sandbox`. The test compares actual packaged version to the checked-out desktop manifest.
- Also run the complete files `hyprland-control.test.ts`, `linux-hyprland-recovery.test.ts`, `linux-hyprland-startup.test.ts` and `linux-tray.test.ts` under the same canonical `npm test -- local --file packages/desktop/test/e2e/<file>` route. Set `TV_LINUX_HYPRLAND_FIXTURE=1` only for the actual owned isolated Hyprland session with its real `HYPRLAND_INSTANCE_SIGNATURE`; recovery also requires `TV_LINUX_NOTIFICATION_RECORD` from the native notification fixture. Tray requires `TV_LINUX_TRAY_FIXTURE=1`, the real session bus/Quickshell watcher and its original evidence directory. These selectors declare prerequisites; setting them without the actual fixture is invalid.
- For files that honor the backend selector, run both legs with `TV_OZONE_PLATFORM=wayland` or `x11`, keeping the real owned `WAYLAND_DISPLAY` for independent `grim` compositor captures. The general packaged test compares the explicit requested backend, falling back to display detection only when it is unset, matching the production launcher. `hyprland-control.test.ts` hardcodes Wayland in its launches; an environment-only rerun does not add X11 coverage. `linux-tray.test.ts` and `linux-hyprland-startup.test.ts` hardcode `television-launcher`; changing `TV_LINUX_PACKAGE_LAUNCHER` does not make it test AppRun. Record those actual entrypoint/backend limits, and supplement missing matrix legs with real isolated acceptance rather than claiming them from selector changes. Preserve before/hidden/after all-output screenshots, native observations, notification records and continuity reports. Do not substitute Xvfb for the real owned Hyprland compositor.
- These files intentionally skip if prerequisites are absent. Record every such skip as unfulfilled packaged/graphical acceptance, even if the ordinary full gate is green. No selector suppresses the strict supported compositor version/capability boundary.

## Evidence and closure

Retain the exact candidate head and package checksums, actual guest/runtime
identities, commands, native reports, skips, before/hidden/after compositor
observations and all failure evidence. Never count a missing fixture or skipped
matrix leg as accepted. Record physical-host and production-updater limitations
separately. Preserve `tested_sha` and compatibility acceptance as unfulfilled
until the owning policies' evidence requirements are actually met. No Mac,
Blaxel or hosted CI evidence is supplied by this matrix.
