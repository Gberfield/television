*Proves the Linux desktop port at its native process, script and packaged application boundaries.*

# Linux desktop — proof

Proves [specs/product/linux-desktop.md](../../specs/product/linux-desktop.md).

## Coverage model

The existing Mac/shared application suites retain coverage of channels, editing and navigation. Native frame/About/platform assertions replace Electron only at the process boundary and forfeit compositor behavior to the packaged walk. Real shell tests select the backend; packaged acceptance uses real Electron and real X11 or Wayland, a token-protected Television server and separate loopback website. Fixture artifacts contain labeled synthetic content. The walk observes authentication, HTML/Markdown/URL views, appearance IPC and default-profile persistence. The known upstream gate seam uses authored upstream markup and real Lit, with a downloaded-event substitute; it proves preload transformation and real restart IPC, not release transport or the whole upstream server. The strict packaged path also checks enabled-sandbox startup on a real Linux host. Physical pointer/keyboard input, perceived GPU rendering, fractional scaling and external Internet pages remain separate host evidence; a headless compositor result closes none of those deferrals. Update transport breadth belongs to [Linux distribution](../arch/desktop/linux-distribution.md).

## Test hooks

`TV_LINUX_PACKAGE_DIR` selects a built Linux package; production resolves its own bundle and receives no selector.

`TV_LINUX_PACKAGE_LAUNCHER` selects the distribution entrypoint (`television-launcher` or extracted AppImage `AppRun`); production invokes those entrypoints directly.

`TV_LINUX_EVIDENCE_DIR` requests screenshots and JSON from tests only; production does not read it.

`XDG_CONFIG_HOME` isolates Electron's real default profile for the test; production uses the owner's existing XDG configuration.

`ELECTRON_DISABLE_SANDBOX=1` supplies a cloud-only launch override; production launchers retain Chromium's sandbox defaults.

`TV_LINUX_REQUIRE_SANDBOX=1` requires the packaged child to ignore that generic harness override and launch with the production sandbox. The test asserts no disabling switch, sandboxed renderer preferences, Linux seccomp filtering and no-new-privileges. It does not change production behavior or establish physical input acceptance.

Wayland acceptance uses the distribution launcher's real session-based backend selection before Playwright's early `app.whenReady()`; production invokes that same launcher.

The established `--test-fixture` hook bypasses connection for the gate seam; a stand-in downloaded IPC event and main-process listener observe the frozen bridge. The real connection walk uses no fixture hook or `TV_TEST_MODE`.

## Assertions

The Linux frame supplies native controls, and About exposes the release ([owning promise](../../specs/product/linux-desktop.md#downstream-linux-desktop-application)). ^linux-native-window

Evidence: `main.test.ts`, “provides a native Linux frame without Mac traffic-light coordinates” and “makes the Linux release version available through the About menu”. These contract tests replace Electron at the process boundary; they forfeit actual compositor behavior. `e2e/linux-packaged.test.ts` launches the real packaged executable and records visible and maximizable state, Ozone backend and identity. Physical window management on Hyprland is pending separately. Electron 43.7.6 ignores CSS drag regions when its owner has a native frame. `window-drag-regions.test.ts` checks no native move request and stationary bounds from Linux page drags while keeping controls and overflow usable; the owning UI proofs describe those seams. This neither verifies physical native-titlebar movement nor proves the frameless Mac path.

The Linux package rejects bad auth, connects, renders HTML/Markdown/URL artifacts, sends native appearance changes and reconnects with its saved profile ([owning promise](../../specs/product/linux-desktop.md#downstream-linux-desktop-application)). ^linux-packaged-spine

Evidence: `e2e/linux-packaged.test.ts`, “packaged Linux client authenticates, renders artifacts, applies native appearance and retains its default profile”. This acceptance path uses the production package, real Television HTTP/WebSocket server, filesystem and Electron/webviews. Authored fixture files and a separate loopback website are labeled synthetic data; no mechanism is mocked. It forfeits access to a real external Internet website and production update-feed operation.

Without a user-data command-line override, Linux selects `$XDG_CONFIG_HOME/Television`, and disconnect removes its saved connection ([owning promise](../../specs/product/linux-desktop.md#downstream-linux-desktop-application)). ^linux-default-profile

Evidence: the same packaged spine supplies an isolated XDG config root, checks Electron's default path, closes and relaunches the app, checks the native menu's enabled state and CmdOrCtrl+, registration, activates that menu item and verifies record deletion. This proves the application-identity suffix and production persistence, not physical keyboard shortcut dispatch or the owner's existing laptop profile.

Normal distribution launchers do not disable Chromium's sandbox ([owning promise](../../specs/product/linux-desktop.md#downstream-linux-desktop-application)). ^linux-sandbox-default

The launcher/script tests and packaged inspection record actual effective arguments. Cloud acceptance explicitly sets `ELECTRON_DISABLE_SANDBOX=1` and records that forfeiture. The strict `TV_LINUX_REQUIRE_SANDBOX=1` path ignores that override and requires no disabling switch, sandboxed renderer preferences and Linux seccomp/no-new-privileges. Host execution is recorded in [host acceptance](../../docs/archive/2026-10/linux-host-acceptance.md); it proves the tested installation and session, without granting physical-input or fractional-scale credit.
