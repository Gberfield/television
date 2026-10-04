*Proves Linux distribution and updates through transport contracts, real shell scripts and inspected packages.*

# Linux distribution — proof

Proves [specs/arch/desktop/linux-distribution.md](../../../specs/arch/desktop/linux-distribution.md).

## Coverage model

Updater contracts exercise adapter scheduling and lifecycle with an injected EventEmitter at the external electron-updater boundary. They retain real adapter logic and forfeit network, checksum validation and replacement to the separate hosted AppImage acceptance below. Download promises are consumed separately from metadata checks, matching the real library's handoff. Script tests execute real Bash against a fixture binary that records argv and real temporary filesystem paths; they forfeit native startup to [packaged Linux acceptance](../../product/linux-desktop.md#^linux-packaged-spine). GLib/Gio probes verify desktop entry parsing and activation rather than trusting the syntax validator alone. The executed distribution build, asar/notices inspection and AppImage extraction establish payload and launcher contents. Archive permissions are checked because a root-owned Arch install must remain readable to ordinary users. An Arch package staged from the recipe does not prove pacman or physical Omarchy operation. No configured production feed or future-release publishing is implied.

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

Evidence: `linux-updater.test.ts`, “checks immediately, reports each valid downloaded version once and restarts only after download” and “handles a rejected check and tries again four hours later, then stops after disposal”. The fake EventEmitter replaces the updater transport/install boundary, not adapter logic. Bundling the real library does not prove download/checksum/replacement. The hosted AppImage acceptance below carries the successful real upgrade crossing; contract tests carry failure/retry and scheduling breadth.

The launcher preserves explicit Ozone flags, selects Wayland from the session and preserves arbitrary arguments with spaces ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-launcher-arguments

Evidence: `linux-distribution.test.ts`, launcher cases. The real shell executes with a fixture executable that captures its argv; this forfeits native app startup. Packaged spine acceptance crosses the real app/compositor seam.

The installer creates a valid desktop launcher in a user prefix containing spaces ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-install-paths

Evidence: `linux-distribution.test.ts`, “installs into a user prefix containing spaces and creates a valid desktop launcher”. Actual scripts/filesystem/desktop-file validator run against a small authored package fixture; Electron runtime and desktop-menu selection are forfeited there and covered separately by packaged acceptance.

The Linux target excludes ToDesktop and includes the four entrypoints, setup/theme/assets, licenses and bundled Linux updater ([owning promise](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-package-content

Evidence: the executed `linux-build.mjs` build, asar inspection, license checks, hashes and packaged spine are recorded in the journal. The build is not a production Linux release feed. `makepkg` built the recipe on the Omarchy host and pacman inspected its metadata; the archive contains root-owned mode-4755 `chrome-sandbox`. Package installation is not exercised because host acceptance uses the provided user installer. Physical input remains separate host evidence.

The October 3, 2026 fork release preparation also built 1.4.23 with an HTTPS generic feed pointing at `Gberfield/television`'s dedicated `linux-stable` release. Inspection verified the compiled feed, four desktop entrypoints, licenses, absence of the Mac updater runtime, and the generated metadata's SHA512 and payload size against the actual AppImage. The isolated user-installed candidate and its FUSE AppImage each passed both strict packaged tests on a private X11 display. These checks establish package preparation and launch, not a maintained feed: the release tag was absent, nothing was uploaded, and network download/checksum/replacement acceptance remains pending.

On October 4, 2026, the same five reviewed assets were published in the [fork's Linux bootstrap release](https://github.com/Gberfield/television/releases/tag/linux-stable). Actual unauthenticated public HTTPS downloads of the AppImage, portable archive, `latest-linux.yml`, build information and checksums matched the reviewed bytes. The downloaded AppImage's SHA512 and size matched the downloaded feed. The provided installer deployed the configured client into the normal user prefix, preserving the existing connection. This proves release availability, transport and payload/metadata agreement; it does not execute electron-updater's newer-version download, install or restart path. Version 1.4.23 is the bootstrap, not a newer replacement for another 1.4.23 client. Future-version publication and ongoing feed maintenance remain the fork maintainer's responsibility.

## Hosted AppImage acceptance

A configured AppImage downloads the hosted newer release, reports it only after download, installs through the production restart operation, and reconnects using its saved profile ([owning promises](../../../specs/arch/desktop/linux-distribution.md#linux-distribution-and-updates)). ^linux-hosted-appimage-update

On October 4, 2026, the dedicated [fork Linux feed](https://github.com/Gberfield/television/releases/tag/linux-stable) published 1.4.24. Public unauthenticated HTTPS downloads matched the reviewed payload and metadata hashes, including the AppImage's SHA512 and size. New immutable versioned payloads were verified before publishing `latest-linux.yml` last; both 1.4.23 payloads remain available. Source was an isolated export of merged `76892d7acc5d70074864d7d3c12ddf84ef6fdf3a`, tree `51818ae6cf04ec81ec56f59f6bc27e61e80e9824`, with only desktop package and guide version stamps changed. All 635 ASAR files were compared with bootstrap: only the package manifest version differs. Public `build-info.json` declares the version input. This is a downstream packaging release, not an npm server or official upstream release.

Two actual FUSE 1.4.23 AppImages ran on private Xvfb X11 displays against an isolated real token-protected CLI server with synthetic Markdown. One retained a custom stable filename; the other used the normal versioned filename. Neither `TV_TEST_MODE` nor a sandbox-disabling flag was present. Production electron-updater downloaded 1.4.24 from public HTTPS; the production preload reported that version and the real cache held the exact reviewed payload. Clicking the served **Restart to update** button replaced the stable file or renamed the versioned file, exited the old main process and launched the replacement without a second harness launch. The new main process's mounted ASAR and shell-reported navigation version were both 1.4.24. The saved connection was byte-identical, the new shell completed its authenticated handshake and channel requests, and every observed renderer had seccomp 2 and no-new-privileges 1. Normal installed client and connection hashes were unchanged. Before/downloaded/after captures show the real UI; the QA-attached initial view is light and the uninstrumented replacement follows system dark appearance, so those captures do not claim theme persistence.

The transparent loopback HTTP/WebSocket observation proxy forwards real traffic; it records version, paths, response status and authorization presence without token contents. Authenticated cached HTTP 304 responses are valid alongside fresh 200 responses. Early harness attempts that mishandled rewritten process titles and cached responses remain diagnostics, not passes. No update event was injected and no downloaded payload was manually substituted after launch. This positive crossing forfeits fault-injected transport/checksum failures, four-hour waiting, Wayland restart, physical input and perceived GPU/fractional scaling; scheduling/failure breadth remains in the adapter contracts. One published upgrade does not establish ongoing feed maintenance.
