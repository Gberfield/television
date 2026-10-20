# Television fork: Linux, Omarchy and maintenance

This repository is `Gberfield/television`, a downstream fork of
`telepath-computer/television`. It retains the shared server, CLI, skills and
Electron application, adds Linux packaging and Omarchy integration, and tracks
upstream changes through reviewed proposals.

## Versions and distribution

This source workspace and its desktop package manifest are **1.5.4**, incorporating
upstream source through `a8e73fbf5eecfb27172ff5928ffb71f0c6844368`. The reviewed
manual version transition from 1.4.23 satisfies the new artifact-isolation desktop
floor of 1.5.0; it does not publish or install a release. Automatic tracking still
preserves fork versions outside an explicitly reviewed transition.

The independently published **Linux desktop 1.4.27** uses
the earlier accepted tray source `43391068b7d90c933ace1042a03ca56e1f5b5f29` with
distribution stamps. A larger release number does not mean it contains every
later source commit.

This source server requires desktop **1.5.0 or newer** for artifact isolation.
The published Linux **1.4.27** client is incompatible with that server version.
Use the web client until a compatible Linux desktop has passed acceptance and
is available. The prepared source 1.5.4 is not itself an accepted published
desktop release; no installed server or client is changed by this draft.

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

Upstream tracking was activated through PRs #12 and #13. The owner-directed
[manual local workflow](upstream-tracking.md) now keeps Actions disabled, validates
exact candidate revisions with the canonical runner and supports read-only local
discovery. The retained hosted proposal writer preserves fork versions and never
merges Omarchy history; using it requires separate authority. Owner review,
compatibility acceptance, release and installation remain separate steps.

## Source validation and operational holds

The proposed fork-policy exceptions in PR #25 permit source integration under the
[disabled-Actions conditions](../../specs/spec-workflow.md#^fork-disabled-actions-validation).
They do not activate the changed paths. The new policy wording remains subject to
human review before merge; PR #25 is draft and unmerged.

The affected source incorporates upstream
`a8e73fbf5eecfb27172ff5928ffb71f0c6844368`. Retain the following holds with that code
and reassess them after further changes. Close each hold only with evidence for
the affected code, recorded in the PR and this handoff. Ordinary local tests
cannot close these external boundaries.

| Held operation | Affected paths | Required evidence before use or release |
| --- | --- | --- |
| Changed Mac app distribution or ordinary use | `packages/desktop/`, desktop bridge/IPC, update runtime and upgrade gate | Unreleased signed candidate or signed test build on a supported Mac: every applicable install, license, Updates and Bridge/IPC check; supported-Mac local verification for the ToDesktop migration. Linux package builds and Electron tests supply none of this evidence. |
| Changed live Blaxel operations | `scripts/run-blaxel-testshards.mjs`, `scripts/manage-blaxel-testshards.mjs`, `scripts/test/` remote checkout/runtime/planning paths | Authorized real API/transport runs covering leasing, locking, architecture, setup, logs and results; fresh workers for provisioning/runtime changes; two repositories on reused workers for selection changes, retaining dependency-cache evidence; a planned suite for plan transfer. Pool-discovery live listing remains unverified. |
| Ordinary GitHub Actions execution | `.github/workflows/`, `.github/actions/`, CI planning/build-output/cache paths | Authorized isolated miss/hit/induced-failure validation against the workflow versions on every ref to be activated, plus required-check context evidence on the first production run. Keep tracking and release workflows outside the validation window. Actions remains disabled until separate activation authority. |
| Linux desktop release, installation and compatibility acceptance | Linux packaging/launcher, sandbox, tray/Hyprland lifecycle, updater and Omarchy integration | Actual packaged/graphical acceptance, supported compositor/session matrix, physical input/GPU/mixed-output scaling and production-updater checks. The disposable VM never became ready; no graphical or physical pass is recorded. This separate compatibility hold is unchanged by the policy proposal. |

PR #25 retains the exact validation records. The complete local gate at
`5bc665b4f153fb8fa260c3825ccbef4153754f9e` passed 22 surfaces with 3,809 tests
passed, 32 existing skips and no recovered flakes, failures, process leaks or
canonical infrastructure failures. The feed-sidecar BrokenPipe diagnostics are
retained separately. That gate predates the new policy proposal; a changed final
pushed head containing current main still requires full canonical verification
before merge. No durable testpass or compatibility acceptance was published.

These are human-governed operational holds, not runtime interlocks. Source merge
approval grants no permission to build, install, deploy, publish, access paid
services, alter shared pools or credentials, enable Actions or dispatch workflows.
An explicitly authorized validation exercise may execute the held candidate to
obtain evidence; passing local tests is not that authorization. Support is
cancelled, and existing installed applications, services and desktops stay intact.

## Scope of these docs

Personal dashboards, Calendar receivers, Obsidian/LLM Wiki artifacts and host
backup or cloud-account setup are maintained outside this repository. Their live
changes are not automatically fork features or bundled onboarding content. Use
each producer's own source and operational notes when updating those systems.
This fork's administrator-guide edits also do not publish the guide hosted at
`television.run`.
