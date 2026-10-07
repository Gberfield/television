# Omarchy Television theme

Matches Television to the currently applied Omarchy palette. Originally authored
on October 7, 2026, against Television 1.4.23. Theme ID: `omarchy`.

`sync.py` reads `~/.local/state/omarchy/current/theme/colors.toml` (the installed
Omarchy location), with a fallback to the older config location. This uses the
effective palette, including user overlays. No package-owned Omarchy or Television
source is edited. Python 3.11+ is required; there are no extra dependencies.

The four semantic colors cover surfaces and copy in the application and artifacts
using live canonical v2. Accent and terminal color families supply action, status,
and data colors. The sidebar selection uses Omarchy's selection color. The app
ground uses the darker background. This theme follows the **palette**, using solid
grounds rather than copying the desktop wallpaper. Layout, font, and control
behavior retain Television's defaults. No theme JavaScript or consent is needed.

Supporting text and links retain the palette's hues but move toward foreground
when necessary to achieve 4.5:1 contrast against the two document surfaces.
Text on primary actions uses whichever palette or black/white ink contrasts best.
`colorScheme` follows Omarchy's declared mode, with luminance inference for older
palettes. This fixes Television's effective appearance to Omarchy while leaving
its stored appearance preference available for other themes.

`95-television-omarchy-theme` is installed through `omarchy hook install` for
`theme-set`, `post-boot`, and `post-update`. It queues the user service
`omarchy-television-theme.service`. The enabled companion timer runs ten seconds
after it starts and five minutes after the service last finishes, recovering a
missed hook or temporarily unavailable Television server. It starts with the user
session; the Television server's own service remains enabled and unchanged.
No desktop or Television restart is performed by the integration.
The service reads its installation PATH from
`~/.config/omarchy-television-theme/environment`, preserving mise-managed
installations. This file contains only PATH, never a copy of the whole environment.

The permanent repair source is `~/.local/share/omarchy-television-theme/theme/`.
Its `repair.py` restores missing files in the selected Television home's `omarchy`
theme, including a deleted theme folder or damaged manifest, then invokes the
generator. An ownership marker prevents overwriting someone else's replacement
theme folder. Generated CSS is rebuilt from Omarchy's current effective palette;
the repair source does not depend on the original chat workspace.

Activation failures are recorded as pending in `sync-state.json`; the service
returns a failure so systemd records the problem, and the timer retries. When the
palette and selection are unchanged, only a lightweight selection check is needed;
there is no stylesheet rewrite or theme registry refresh. The next theme change,
login, update, or timer check selects Omarchy again if a different Television theme
was selected. Disable the integration before choosing another theme permanently.

Writes are atomic per file and only occur when content changes, avoiding needless
artifact refreshes. A file lock serializes concurrent syncs. Invalid palettes
fail before writing runtime files, retaining the previous usable theme. The
authoring version in the manifest remains unchanged during palette updates.
`sync-state.json` records the last source, appearance, and pending activation.
There is no resident process, theme animation, or external network request.
Each five-minute check briefly starts Python and the local Television CLI.

Manual repair and refresh: `omarchy-television-theme`.
Reinstall hooks and units: `bash ~/.local/share/omarchy-television-theme/install.sh`.
The installer is idempotent for this integration's owned paths and backs up the
previous installation to `~/.local/state/omarchy-television-theme/backups/` before
changes. That archive contains only theme/integration files, not Television's
account token, channels, or artifacts. Keep the permanent repair copy backed up
with other user configuration. Package updates leave these user-owned files alone.

Offline verification from the source checkout:
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s contrib/omarchy-theme/tests -v`.
The tests exercise all installed stock palettes, both modes, unchanged syncs,
invalid input, deferred activation and retry, deleted-file recovery, corrupt
manifests, and ownership safeguards without altering desktop state. Recovery and
offline-failure tests use temporary files and a controlled Television CLI stand-in;
the live server and desktop are never stopped for tests.

To disable: `systemctl --user disable --now omarchy-television-theme.timer`, then
remove `95-television-omarchy-theme` from the `theme-set.d`, `post-boot.d`, and
`post-update.d` hook directories under `~/.config/omarchy/hooks/`. Choose another
theme in Television afterward. Both the installed theme and permanent repair copy
can remain available for manual use. Logs: `journalctl --user -u omarchy-television-theme.service`.

Durability work on October 7, 2026: package version 1.1.0; added owned permanent
repair copy, reinstallable systemd units, update hook, activation retry state,
unchanged-sync fast path, recovery tests, and installer backups.
