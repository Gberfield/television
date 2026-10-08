# Linux release history and acceptance

These are historical release records, not the current installation instructions.
For current use, read [Television for Linux](../../packages/desktop/linux/README.md).
The detailed [distribution proof](../../proofs/arch/desktop/linux-distribution.md)
and [Linux desktop proof](../../proofs/product/linux-desktop.md) retain the original
acceptance scope and failed attempts. Later source changes do not retroactively
change acceptance of published payloads.

## 1.4.24 and 1.4.25

The previous 1.4.24 release in the fork's dedicated `linux-stable` HTTPS feed retained the versioned 1.4.23 bootstrap payloads for rollback. This downstream packaging release uses merged source `76892d7acc5d70074864d7d3c12ddf84ef6fdf3a`, with only the desktop package version and the bundled Linux guide's introduction stamped 1.4.24 in an isolated export; public `build-info.json` records those inputs. Production runtime bytes are unchanged. On October 4, 2026, actual FUSE 1.4.23 AppImages downloaded the hosted 1.4.24 payload and installed through the real **Restart to update** button. Both a custom stable filename and the normal versioned filename restarted and reconnected with their saved connection unchanged and production renderer sandbox enabled. This acceptance used private X11 displays and an independent headless Wayland compositor with software rendering, a real token-protected CLI server and declared synthetic Markdown. Both filename cases also restarted as native Wayland surfaces in the private compositor. These checks do not accept physical Omarchy input, perceived GPU behavior, fractional scaling, theme persistence or an ongoing feed-maintenance cadence. The [Linux distribution proof](../../proofs/arch/desktop/linux-distribution.md#^linux-hosted-appimage-update) records the crossing.

At that publication, the feed served 1.4.25 from merged `caa6830da75e8e1c751613ddbece2226835c2ce2` (tree `fc3f6b992e24ffb571d4938e902d2137b0bc6be8`), with the desktop manifest and shipped guide stamped in an isolated export. The shared source/server version remains 1.4.23; this does not release npm or Mac packages. Both new payloads were verified through public HTTPS before feed metadata was replaced; 1.4.23 and 1.4.24 versioned payloads remain available. The bundled guide preserves its preparation snapshot; this source guide and release notes record publication. Four actual 1.4.24-to-1.4.25 updater crossings passed: stable and versioned filenames on private X11 and headless Wayland displays. Production download, the real **Restart to update** button, automatic replacement launch, authenticated reconnection, unchanged saved connection and renderer sandbox were checked. The normal installed client/server were not changed. These one-off software-display checks do not accept physical input, hardware GPU/fractional scaling, theme persistence or an ongoing maintenance cadence. The [distribution proof](../../proofs/arch/desktop/linux-distribution.md#^linux-hosted-appimage-update) separates these outcomes from contract coverage.

### Installed portable acceptance

After publication on October 4, the provided portable installer upgraded the normal user installation from 1.4.23 to the exact publicly verified 1.4.25 payload. Two launches using the actual existing Television profile reconnected to the unchanged persistent server without link entry; the saved connection remained byte-identical. The main renderer and five artifact guests had seccomp 2 and no-new-privileges 1 without sandbox-disabling flags. The desktop entry and installed icon matched the release. This acceptance used an independent private Wayland/Pixman compositor; the client was closed afterward, desktop control remained stopped and the active workspace was unchanged. It supplements installation and saved-connection coverage, without accepting physical controls, launcher interaction, hardware GPU behavior or fractional scaling. The [distribution proof](../../proofs/arch/desktop/linux-distribution.md#^linux-install-paths) records the scope.

## 1.4.26 Hyprland Hide

The replacement Hide path was published in downstream 1.4.26 and retained in
1.4.27. Five private native Hide/reopen cycles passed on Wayland and X11 through
the installed portable launcher and extracted AppRun. Guarded physical Hide,
installed-entry restore and failure notification passed on the recorded single
host display. The X11 walk required a temporary repair of a missing host display
pathname outside Television; the original blocked attempt remains in the proof.
Additional display configurations, automatic backend fallback and hand-pressed
shortcuts were not accepted by those checks. Historical Electron Hide failures
remain recorded separately.

## 1.4.27 tray release


At publication, the dedicated [fork Linux release](https://github.com/Gberfield/television/releases/tag/linux-stable) served 1.4.27 from merged [tray PR #8](https://github.com/Gberfield/television/pull/8), source `43391068b7d90c933ace1042a03ca56e1f5b5f29` (tree `fa4879e2038998032da530b997e21c72241767fb`). Full ready-PR and merged-main CI passed. The tracked-files export stamps only the desktop manifest and bundled guide; the shared source/server version remains 1.4.23. All 635 application archive files match the accepted numeric tray candidate except the configured HTTPS feed literal. Public `build-info.json` records the source, pins and stamps.

Portable and actual FUSE AppImage checks passed on independent Wayland and X11 displays with real token-protected servers, declared synthetic artifacts and the production renderer sandbox. Saved authentication, settings/theme selection, HTML/Markdown/URL artifacts and relaunch were checked. The final release also passed the real Quickshell/StatusNotifier/DBusMenu tray walk on each backend and entrypoint, including retained edits and live connection through Hide/Show, Disconnect/reconnect, About, Quit and native Close. These are protocol actions and assigned input, not hand-pressed physical input.

Both immutable payloads were verified through anonymous public HTTPS before replacing the feed last; previous versioned payloads remain available. Four real hosted 1.4.26-to-1.4.27 updater crossings passed: stable and versioned filenames on private X11 and Weston/Pixman Wayland displays. The production Restart button replaced the exact payload and automatically reopened with an authenticated socket, byte-identical connection, confirmed server settings/theme and sandboxed renderers. The existing normal client, profile and server were preserved during these private checks. This does not add perceived hardware GPU, fractional scaling, additional display configurations, an ongoing maintenance cadence or complete recovery coverage; recovery remains future work. The [distribution proof](../../proofs/arch/desktop/linux-distribution.md#published-1427-tray-crossing) records this scope.
