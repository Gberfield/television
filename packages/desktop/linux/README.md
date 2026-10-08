# Television for Linux

This fork provides an x86_64 Linux desktop client targeting Omarchy/Arch Linux
with Hyprland/Wayland, with X11 support. It bundles Electron and needs no Node or
npm on the viewer's machine. The agent and Television server run together on a
local or remote Linux/macOS machine; the client connects to that server.

The [fork Linux release](https://github.com/Gberfield/television/releases/tag/linux-stable)
publishes desktop **1.4.27** as a portable archive and AppImage, with
`SHA256SUMS`, `latest-linux.yml`, and `build-info.json`. This is a downstream
release. The repository workspace remains **1.4.23** even though newer upstream
source has been integrated; building main does not reproduce the published
1.4.27 payload automatically. The [fork overview](../../../docs/guides/fork-overview.md)
explains the separate versions and recent changes.

## Install and connect

For the portable archive, download `Television-1.4.27-linux-x64.tar.gz` and extract
the complete folder. Open **Install Television.desktop**, allowing execution or
trust when your file manager requests it. Then open **Television** from your
application launcher. You can also run **television-launcher** directly from the
extracted folder. To install from a terminal inside that folder:

```bash
bash ./install-television
```

The installer needs no administrator privileges. Its default locations are
`$XDG_DATA_HOME/television`, `$XDG_DATA_HOME/applications/computer.telepath.television.desktop`,
and `$XDG_DATA_HOME/icons/hicolor/512x512/apps/computer.telepath.television.png`,
where `XDG_DATA_HOME` defaults to `~/.local/share`. `--prefix /absolute/path` selects
a different dedicated client folder. Existing unrelated files are refused;
saved connections in `$XDG_CONFIG_HOME/Television` (normally `~/.config/Television`)
are preserved. Keep the whole archive together, including its assets and runtime.

For the AppImage, download `Television-1.4.27-linux-x86_64.AppImage`, make it
executable in file Properties, and open it. It requires a compatible FUSE runtime;
use the portable archive if FUSE is unavailable. Both user-installed formats use
Chromium's production sandbox and require unprivileged user namespaces. The Arch
package instead installs the root-owned setuid sandbox. Do not disable the sandbox
to work around a launch problem.

Ask your agent: “Install the Television server using https://television.run/install.md
and give me its connect link. I already have the Linux desktop client.” Paste the
complete link into the app. Installing the client does not install the server or
an agent. Treat the link as a credential; do not add it to issues or shared docs.

The app remembers its server. **File → Disconnect from Server** or **Ctrl+,**
forgets that connection and lets you enter another. **File → About Television**
shows the installed client version. Channels, HTML/Markdown artifacts, embedded
websites, tabs, themes and settings use the shared implementation.

## Omarchy and window behavior

The launcher selects native Wayland when `WAYLAND_DISPLAY` is present, otherwise
X11. `TV_OZONE_PLATFORM=x11` selects XWayland for diagnosis; an explicit
`--ozone-platform=x11` argument takes precedence. The application identity is
`computer.telepath.television`. Installation does not add Hyprland bindings,
change desktop themes, or enable login startup.

The **Window** menu provides **Maximize / Restore**, **Close**, and **Hide** on
Hyprland (**Minimize** on other desktops). Verified Hyprland 0.56.2 support moves
the focused owned window to an inactive special workspace. The same process,
document, unsaved edits and server connection remain alive. Open the same
installation with the same profile to restore that window to its original
workspace and request focus. Unsupported compositor capabilities or
fullscreen/grouped windows cause refusal with an explanation.

Manual movement or revealing the holding workspace takes precedence over the
app's remembered placement. If the original workspace no longer exists, restore
uses the verified active normal workspace. Failed compositor control leaves the
window and connection alive and produces a notification; opening Television
again retries. Continued control loss does not guarantee recovery. A new process
starts visibly and does not adopt an old process's hidden window.

Move the framed Linux window with its native titlebar or compositor bindings.
In-page sidebar, top-bar and modal strips do not drag it.

## System tray

The tray offers **Show Television**, **Hide Television**, a saved-server address,
**Disconnect from Server**, **About Television**, and **Quit**. Activating the icon
restores the owned window. Tray Hide also works when another app has focus and
retains document state; on Hyprland it uses the same guarded placement mechanism.
The server address excludes the token and describes the saved connection, not
live connectivity. Disconnect forgets it and reveals setup.

Closing the native window or choosing Quit exits the client. Hide keeps it
running. None of these stops the agent's server. On Omarchy an unpinned item
appears in the tray drawer; pin it through the tray management menu. Login startup
is a separate opt-in desktop configuration, not an installer default.

## Follow the Omarchy theme

For a server hosted on Omarchy, install the optional
[theme integration](../../../contrib/omarchy-theme/README.md) from this checkout:

```bash
bash contrib/omarchy-theme/install.sh
```

It follows the effective palette and light/dark appearance, including local
palette overrides. A permanent repair copy, three Omarchy hooks and a five-minute
user timer recover missed events and temporary server outages. Unchanged checks
do not rewrite CSS or refresh the theme registry. This integration is separate
from client installation and requires the local `tv` command/server. It affects
that server's theme, not an unrelated remote server. The integration guide covers
repair, ownership, backups and disabling automatic following.

## Updates and troubleshooting

Portable installations update by running the newer archive's installer; Arch
installations update through their package source. AppImage self-updates require
a build-configured HTTPS feed and an actual packaged AppImage launch. The fork's
published AppImages use its dedicated `linux-stable` feed. A downloaded update
can be applied with **Restart to update**; server upgrades and upstream-tracking
drafts do not upgrade the desktop client. Existing versioned release assets are
retained for rollback. A configured feed does not guarantee future publication.

If launch fails, run the extracted launcher or AppImage from a terminal and
retain the error before changing anything. Check architecture, complete extraction,
FUSE (AppImage), and user-namespace/sandbox support. For a connection problem,
check the server with `tv status` on the agent's machine. A sandbox may block
localhost even while the server is healthy; verify outside that sandbox before
restarting it. `tv links` recovers the connect link, but its output is private.
For a missing tray icon, inspect the Omarchy tray drawer first. For refused Hide,
retain the notification and compositor version; unsupported versions do not fall
back to Electron Hide.

## Build and verification

Build on x86_64 Linux with Node 24 and npm >=11.5 <12:

```bash
npm ci
node node_modules/electron/install.js
npm run package:linux
```

The default output is `packages/desktop/release`; `TV_LINUX_OUTPUT_DIR` overrides
it. Packaging produces a portable archive, AppImage, checksums, build information
and an `arch/` folder containing a generated PKGBUILD. `makepkg -si` in that folder
builds/installs an Arch package; this is not an AUR publication. Maintainers set
`TV_LINUX_UPDATE_URL` to an HTTPS feed when publishing update-enabled AppImages.
The Linux bundle excludes the Mac ToDesktop updater. MIT, Electron/Chromium and
third-party notices are included.

Use the [canonical test runner](../../../specs/arch/test-runner/test-runner.md).
Strict packaged sandbox checks use `TV_LINUX_REQUIRE_SANDBOX=1`.
`TV_LINUX_REQUIRE_WINDOW_MANAGER=1` adds menu maximize/restore checks when the test
display has a window manager. Actual Hyprland acceptance requires
`TV_LINUX_HYPRLAND_FIXTURE=1`, a package entrypoint and `TV_LINUX_EVIDENCE_DIR` for
independent compositor captures; Weston checks do not accept Hyprland Hide.
Startup and recovery cases live under `packages/desktop/test/e2e/`.

[Release history](../../../docs/guides/linux-release-history.md) preserves the
published updater crossings and host results. The
[Linux desktop proof](../../../proofs/product/linux-desktop.md) and
[distribution proof](../../../proofs/arch/desktop/linux-distribution.md) distinguish
contract, packaged, private-display and physical-host evidence. Software-display
checks do not establish hardware GPU behavior, fractional scaling, additional
monitor configurations or complete recovery coverage.
