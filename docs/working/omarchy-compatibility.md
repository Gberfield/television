# Omarchy compatibility review and test matrix

## Scope and evidence limits

Review accepted stable v4.0.4 c668141e9c42b13c80c9ca4ea108e11708c5e8a5 against stable v4.0.6 237f1b4071a0bff2296c6d740ba2b9fd695ebfa0, and observation baseline 902fd8aebd98b6eedaa58276886a2f9f2876755f against quattro 3ac43659dcbf88e84d951e3ce979b48a60a7d1f2. Omarchy history never enters the Television source ancestry. Full relevant-path diff retained externally; this document records assessed contracts and remaining acceptance rather than treating an inventory as review.

## Established source findings

Stable browser routing now installs a Hyprland-specific HTTP/HTTPS handler through omarchy-browser.desktop. The real default browser stays in mimeapps.list; omarchy-cmd-default-browser skips the routing entry and checks installed launchers, with fallback that clears BROWSER/desktop lookup recursion. Chromium fast handoff refuses unfamiliar wrappers, custom profile selectors and unrecognized process flags, then falls back to normal launcher execution. Firefox uses the normal executable route. Verify external links with a guest-only Firefox default and an isolated profile; do not alter the host default/browser.

Focus selection now sorts matching clients by focusHistoryID. Television's own launcher recovery remains exact PID/class/session/marker ownership rather than Omarchy's loose regex helper. Verify same-profile launcher restore and two independent profiles without moving an unrelated client.

Quattro introduces per-physical-monitor workspace blocks, native dock minimization on floating workspaces, and extra dock layer rules. Television's special holding workspace is independent of special:minimized. Test manual movement/reveal, removed origin and output visibility; never equate mapped windows with desktop visibility.

Stable NVIDIA settings now distinguish the display-driving GPU from a hybrid system's render GPU. Quattro enables border resizing and changes shell/theme surfaces. A software-rendered guest cannot accept physical GPU, mixed-monitor scaling or input behavior.

Quattro now defers nonterminal theme retints and the theme-set hook, serializes batches and skips superseded retints. The optional Television integration reads the current palette when its hook runs, and its retained timer is recovery for missed/deferred hooks. Actual rapid theme changes and eventual newest-palette rendering must be checked in the guest; a source read does not prove hook/service execution. No host timer or hook was changed.

## Required acceptance matrix

For each tested immutable Omarchy source state, record actual guest OS, compositor version/capability, shell and package identities separately from source checkout SHA. Merely checking out a tag does not update installed runtime. No compatibility-reviewed SHA advances until those identities and the relevant checks are established.

- Build portable and AppImage packages from the same committed candidate. Install only inside the approved disposable guest; no production feed is configured.
- Connect the actual packaged client to an isolated real token-protected server; persist and relaunch, disconnect and reconnect; render HTML, Markdown and external URL artifacts and exercise native links, editing and themes.
- Run five Hide/launcher-restore cycles for Wayland and X11 on portable and extracted AppImage entrypoints in the real isolated Hyprland guest. Capture before/hidden/after and independent all-output compositor observations; preserve document/edit/socket/profile continuity, hidden-period server updates and sandbox evidence.
- Exercise two profiles, refused/lost control, startup/rapid requests, missing/replaced target, removed origin, manual move/reveal, supported native states, tray Show/Hide/Disconnect/About/Quit and unavailable-tray fallback without touching the agent server.
- Check guest Firefox external-link routing, native frame movement/resizing, theme transitions and readable UI at available guest scale settings. Record that host physical input/GPU/mixed-output scaling and real production updater replacement remain separate acceptance.

## Current state

Source review and integration are in progress. Canonical `npm test -- local --file packages/desktop/test/omarchy-theme.test.ts` passed with all67 immutable public palettes added as temporary fixture inputs; fixture cleanup was confirmed. This is unchanged-module palette conversion evidence on an in-progress merge, not full candidate or physical acceptance. The explicitly approved new own-thread VM t-cbff2eb03096849fc677ee81, UUID3e6ba149-4ee6-4dea-951e-013cb180856d, revision1, is allocated/attached but queued and paused. No GUI input, guest package change or compatibility acceptance has occurred. Export evidence before final shutdown/removal of only this test VM; leave existing desktops/profiles/services intact.

External evidence: /home/gabe/Projects/Television/validation/upstream-integration-20261020/omarchy-stable-contracts.diff and omarchy-relevant-complete.diff. The complete default-branch diff is235 relevant changed entries/285307 bytes; stable focused contract diff is15196 bytes. Inventory coverage does not imply every hunk is reviewed.
