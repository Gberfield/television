# Television fork: Linux, Omarchy and maintenance

This repository is `Gberfield/television`, a downstream fork of
`telepath-computer/television`. It retains the shared server, CLI, skills and
Electron application, adds Linux packaging and Omarchy integration, and tracks
upstream changes through reviewed proposals.

## Versions and distribution

As of October 8, 2026, the source workspace and desktop package manifests are
pinned to **1.4.23**. Main contains upstream source through
`c7545d6770fa4f5741d611314e4710939e28ebb7` (upstream's 1.4.26 bump), with the fork's
version pins retained. The independently published **Linux desktop 1.4.27** uses
the earlier accepted tray source `43391068b7d90c933ace1042a03ca56e1f5b5f29` with
distribution stamps. A larger release number does not mean it contains every
later source commit.

The [linux-stable release](https://github.com/Gberfield/television/releases/tag/linux-stable)
holds versioned portable archives and AppImages, checksums, update metadata and
build information. Source merges do not update these payloads, npm, the Mac app,
the running server, installed skills or the installed Linux client. In particular,
the newer Markdown table fix in main is not claimed to be in Linux desktop 1.4.27.
The [release history](linux-release-history.md) preserves payload provenance and
acceptance; [upstream tracking](upstream-tracking.md) describes source maintenance.

## Linux client additions

- Portable archive, AppImage and generated Arch PKGBUILD, with a user-level
  graphical installer, desktop entry and icon.
- Session-aware Wayland/X11 launcher, native Linux frame and window menus,
  preserved saved connections, production sandbox and bundled runtime/licenses.
- Hyprland Hide and same-profile launcher restore that preserve the original
  window, document, edits and server connection, with ownership checks and
  explicit refusal/recovery behavior.
- Linux tray with Show/Hide, saved-server address without credentials, Disconnect,
  About and Quit. Closing the native window quits; hiding keeps it running.
- AppImage updates through an independently configured HTTPS Linux feed, excluding
  the Mac ToDesktop updater, with downloaded-payload verification and restart.
- Native document canvas for HTML and website guests, preventing unstyled black
  text from appearing over the application's dark artifact card while preserving
  authored backgrounds and document color schemes.

See [Television for Linux](../../packages/desktop/linux/README.md) for use and
troubleshooting. The [Linux product spec](../../specs/product/linux-desktop.md)
and [distribution spec](../../specs/arch/desktop/linux-distribution.md) own these
contracts. Their proofs distinguish private displays, physical-host acceptance,
unsupported compositor versions and remaining GPU/scaling/recovery limits.

## Omarchy palette integration

The optional [theme integration](../../contrib/omarchy-theme/README.md) runs on
the Omarchy server host. It maps the effective desktop palette and appearance to
Television and live canonical artifacts, including user palette overrides.
Theme-set, login and update hooks queue a user service; a five-minute timer
recovers missed hooks and temporary server outages.

Durability additions include an owned permanent repair copy, reinstallable hooks
and units, saved PATH for mise-managed tools, atomic changed-only writes, a lock,
pending-activation retry, installer backups and ownership safeguards. Invalid
palettes retain the previous usable theme. The integration does not copy tokens,
channels or artifacts. It is not enabled by the Linux client installer.

## Other merged changes

The fork's GitHub repository adds a Sponsors button through `.github/FUNDING.yml` ([PR #10](https://github.com/Gberfield/television/pull/10)).
The upstream catch-up also includes the interactive Markdown table fix
([upstream PR #22](https://github.com/telepath-computer/television/pull/22)):
table links display as clickable labels and use the same navigation as other
Markdown links. Viewing, scrolling, cursor movement, cell navigation, remote
updates and rollback preserve source without emitting an automatic formatting
save. Ordinary cell edits preserve untouched raw spans; explicit structural
operations may serialize table formatting. Alt-click retains cell editing and
table-edge navigation does not create rows. See the
[table contract](../../specs/arch/artifact-frame/markdown-tables-buffer.md) and
[interaction buffer](../../specs/ui/markdown-editor/index.md#^md-table-interaction-buffer).

Upstream tracking was activated through PRs #12 and #13. It observes Television
and Omarchy separately, proposes draft updates, validates candidate revisions
without publishing credentials, preserves fork versions and never merges Omarchy
history. Owner review, compatibility acceptance, release and installation remain
separate steps.

## Scope of these docs

Personal dashboards, Calendar receivers, Obsidian/LLM Wiki artifacts and host
backup or cloud-account setup are maintained outside this repository. Their live
changes are not automatically fork features or bundled onboarding content. Use
each producer's own source and operational notes when updating those systems.
This fork's administrator-guide edits also do not publish the guide hosted at
`television.run`.
