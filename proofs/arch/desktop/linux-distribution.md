*Proves Linux distribution and updates through transport contracts, real shell scripts and inspected packages.*

# Linux distribution — proof

Proves [specs/arch/desktop/linux-distribution.md](../../../specs/arch/desktop/linux-distribution.md).

## Coverage model

Updater contracts exercise adapter scheduling and lifecycle with an injected EventEmitter at the external electron-updater boundary. They retain real adapter logic and forfeit network, checksum validation and replacement to a future maintained-feed acceptance. Download promises are consumed separately from metadata checks, matching the real library's handoff. Script tests execute real Bash against a fixture binary that records argv and real temporary filesystem paths; they forfeit native startup to [packaged Linux acceptance](../../product/linux-desktop.md#^linux-packaged-spine). GLib/Gio probes verify desktop entry parsing and activation rather than trusting the syntax validator alone. The executed distribution build, asar/notices inspection and AppImage extraction establish payload and launcher contents. Archive permissions are checked because a root-owned Arch install must remain readable to ordinary users. An Arch package staged from the recipe does not prove pacman or physical Omarchy operation. No configured production feed or future-release publishing is implied.

## Test hooks

`createUpdater` substitutes the download/install client at its external boundary; production constructs `AppImageUpdater`.

`packaged`, `appImage` and `feedURL` inputs model Electron packaged state, the runtime's `APPIMAGE` and a build-configured HTTPS feed; absent production conditions remain inert.

Fake clocks accelerate four-hour scheduling without replacing adapter control flow.

`TV_CAPTURE` is read only by the fixture executable to record argv; the real Television executable does not read it.

`XDG_DATA_HOME` and installer `--prefix` isolate user-install tests; production defaults to the owner's XDG application directories.

`TV_DESKTOP_TARGET=linux`, `TV_LINUX_OUTPUT_DIR` and `TV_LINUX_UPDATE_URL` are build inputs; no unconfigured package fabricates a release feed.

## Assertions

Absent or unsafe feed, nonpackaged state or no AppImage cause no updater construction ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-update-enable

Evidence: `linux-updater.test.ts`, absent/unsafe feed and non-AppImage cases. The injected constructor is an allowed external download boundary; these tests forfeit networking, checksum verification and installation.

The enabled adapter checks initially and every four hours, reports each downloaded version once, ignores premature restart and handles a failed check or payload download before retrying. Disposal stops scheduled checks ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-update-lifecycle

Evidence: `linux-updater.test.ts`, “checks immediately, reports each valid downloaded version once and restarts only after download” and “handles a rejected check and tries again four hours later, then stops after disposal”. The fake EventEmitter replaces the updater transport/install boundary, not adapter logic. Actual AppImage download/checksum/replacement remains pending separate acceptance; bundling the real library does not prove that path.

The launcher preserves explicit Ozone flags, selects Wayland from the session and preserves arbitrary arguments with spaces ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-launcher-arguments

Evidence: `linux-distribution.test.ts`, launcher cases. The real shell executes with a fixture executable that captures its argv; this forfeits native app startup. Packaged spine acceptance crosses the real app/compositor seam.

The installer creates a valid desktop launcher in a user prefix containing spaces ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-install-paths

Evidence: `linux-distribution.test.ts`, “installs into a user prefix containing spaces and creates a valid desktop launcher”. Actual scripts/filesystem/desktop-file validator run against a small authored package fixture; Electron runtime and desktop-menu selection are forfeited there and covered separately by packaged acceptance.

The Linux target excludes ToDesktop and includes the four entrypoints, setup/theme/assets, licenses and bundled Linux updater ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-package-content

Evidence: the executed `linux-build.mjs` build, asar inspection, license checks, hashes and packaged spine are recorded in the journal. The build is not a production Linux release feed. `makepkg` built the recipe on the Omarchy host and pacman inspected its metadata; the archive contains root-owned mode-4755 `chrome-sandbox`. Package installation is not exercised because host acceptance uses the provided user installer. Physical input remains separate host evidence.
