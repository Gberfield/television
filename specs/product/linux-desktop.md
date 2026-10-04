*The downstream Linux desktop's platform behavior, compatibility and host acceptance requirements.*

# Downstream Linux desktop application

For this downstream port, Television also supports x86_64 Linux, targeting Omarchy on Arch Linux with Hyprland/Wayland and retaining X11 compatibility. This extends the Mac-only support statement in desktop-app.md for this fork; it does not change upstream's support or release service.

The same Electron app supplies setup, authenticated connection and recovery, saved connection, disconnect, channels, pages, artifacts, embedded external pages, native links, editing, themes and shortcuts. Native Linux window controls replace Mac traffic lights. Linux shows its window immediately so Wayland can produce the first paint; Mac retains its existing ready-to-show behavior. The desktop menu exposes About Television, the installed release version, Disconnect from Server, editing/view/window commands and Quit. Linux identity is Television and `computer.telepath.television.desktop`; existing Television user data is retained.

Linux window movement belongs to the native titlebar/compositor. Its framed Electron window ignores in-page CSS drag regions, so the sidebar, top-bar, setup and modal strips do not move the Linux window. This is an explicit platform exception to the frameless Mac drag interaction. Native compositor movement must be checked on a real window-manager/Omarchy session; the Xvfb page-drag driver does not establish that acceptance.

Users receive a bundled portable archive or AppImage without a Node/npm runtime requirement. A graphical installer installs the portable client into the user's applications and an Arch PKGBUILD supports distribution-managed installation. The packaged launcher selects Wayland when the session exposes it, X11 otherwise, and preserves explicit platform flags and all arguments. It never disables Chromium's sandbox or acceleration by default.

AppImage builds can update themselves when a maintainer supplies an HTTPS feed containing Linux releases. No feed means no update requests. Portable/Arch builds use distribution-managed replacement. Linux upgrade-gate instructions identify Linux replacement, preserving downloaded-update/restart presentation, rather than offering Mac binaries. Feed operation and publishing later releases are outside this lab's authority.

Acceptance launches the actual packaged application against a real token-protected server, checks persistence across relaunch and disconnect, and renders HTML, Markdown and external URL artifacts. Test both real X11 and a real Wayland compositor when available. Record physical Omarchy/Hyprland and production update-feed checks separately; no headless-compositor result proves those host checks.
