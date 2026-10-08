# Follow the Omarchy theme

This optional integration keeps Television's colors and effective light/dark
appearance matched to Omarchy's active palette. It runs on the Omarchy machine
that hosts the Television server and uses Television's supported theme interface.
It is installed separately from the Linux desktop client; it is not a bundled
default theme and does not change the desktop client's installer.

Requirements: Omarchy, Python 3.11 or later, Bash, user systemd, and a
working local `tv` command/server. No root privileges or new Python packages are
needed.

Run it on the Omarchy machine hosting the server. A Linux client connected to a
remote server does not make that server follow the viewer's desktop palette.
Python must also be available as `python` to the installer; the installed repair
launcher uses `/usr/bin/python` on Arch. The installer does not require ripgrep.
See [the fork overview](../../docs/guides/fork-overview.md) for distribution scope.

The service retains the installation shell's PATH so it can find mise-managed
Node and `tv` installations. Only PATH is saved; account environment variables
and credentials are not collected. Rerun the permanent installer if the CLI's
installation location changes.

From a checkout of this fork:

```bash
bash contrib/omarchy-theme/install.sh
```

The installer saves a permanent copy under
`~/.local/share/omarchy-television-theme`, creates the `Omarchy` theme in the home
reported by `tv themes-path`, and activates it. Theme-change, login, and update
hooks sync immediately. A user timer checks again every five minutes, recovering
missed hooks and temporary server outages. An unchanged check does not rewrite
the stylesheet or refresh the theme registry. No desktop or Television restart
is needed, and channels, artifacts, account tokens, and connection settings are
not copied or changed.

The theme follows the active **palette**, including local Omarchy overrides.
It uses solid backgrounds, preserves Television's layout and fonts, and adjusts
supporting text for contrast. Live canonical artifacts receive the same semantic
colors. Frozen canonical v1 and external websites retain their own appearance.

Manual repair and refresh:

```bash
omarchy-television-theme
```

Read-only health checks:

```bash
systemctl --user status omarchy-television-theme.timer omarchy-television-theme.service
systemctl --user list-timers omarchy-television-theme.timer
journalctl --user -u omarchy-television-theme.service -n 50 --no-pager
```

The service is a oneshot, so an inactive service after a successful run is normal;
the enabled timer schedules future checks. A failed activation remains pending
and is retried. Check `tv status` and the selected Television home before
reinstalling. Logs and timer times use your system's local time zone.

Reinstall the integration from its permanent copy:

```bash
bash ~/.local/share/omarchy-television-theme/install.sh
```

The installer backs up existing owned files under
`~/.local/state/omarchy-television-theme/backups/` and refuses unrelated existing
files. `--adopt-existing` is only for the earlier version of this exact integration;
it verifies that version's authoring record before taking ownership. It is not a
general override. The repair tool recreates a missing theme folder and repairs
damaged runtime files, while preserving someone else's replacement theme folder.

The selected theme contains `sync-state.json` with the last palette source,
appearance and pending activation. Ownership is recorded by
`.omarchy-television-theme`. Keep the permanent repair copy and user hooks/units
with your configuration backups; the original checkout is not needed for repair.
The installed runtime's authoring README is also used to recognize the early
integration during adoption, so preserve its identity preamble.

To stop automatic following, disable the timer and remove the three hooks:

```bash
systemctl --user disable --now omarchy-television-theme.timer
rm ~/.config/omarchy/hooks/{theme-set,post-boot,post-update}.d/95-television-omarchy-theme
```

You can then select another Television theme. Otherwise, the next hook or timer
check restores the Omarchy selection. Inspect failures with
`journalctl --user -u omarchy-television-theme.service`.

Tests run within the repository's `unit:desktop` surface. They use committed
dark/light palette fixtures and temporary files. When stock Omarchy palettes are
present, the same suite checks them too. Offline activation and ownership tests
substitute the `tv` command and do not stop the live server or any desktop.
The original host verification covered all 22 stock palettes, actual hook and
user-service execution, enabled timer state, a second installation, and served
CSS matching the active theme. It did not include a GUI visual review or an
actual operating-system update.

The [theme authoring record](theme/README.md) explains the color mapping,
generated state, ownership marker, and maintenance decisions.
