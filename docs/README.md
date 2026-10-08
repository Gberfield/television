# Docs

Non-spec documents: guides under `guides/`, documents for work in flight under `working/`, and salient working documents included with a squash merge under `archive/YYYY-MM/`. The [docs spec](../specs/spec-docs.md) governs this folder, including what standing each part has and how pre-merge docs prep moves documents from working to archived. Nothing here is authority in its own right, and documents under `archive/` are nobody's job to keep updated.

Archive contents may be deleted periodically; Git history preserves them with the changes they informed.

## Maintained guides

- [Fork overview](guides/fork-overview.md): Linux/Omarchy additions, shared fixes,
  source versus published versions, and maintenance boundaries.
- [Television for Linux](../packages/desktop/linux/README.md): download, install,
  connect, tray/window behavior, troubleshooting, updates and packaging.
- [Omarchy theme integration](../contrib/omarchy-theme/README.md): install,
  palette following, durable repair, ownership, logs and disabling.
- [Theme authoring record](../contrib/omarchy-theme/theme/README.md): color mapping,
  atomic writes, activation retry, runtime files and permanent repair source.
- [Upstream tracking](guides/upstream-tracking.md): activated draft automation,
  manual detection/validation, compatibility review and merge boundaries.
- [Administrator guide](guides/television-admin-guide.md): server, skills, access,
  connection and upgrades. Editing this fork's source does not deploy the public
  guide at `https://television.run/install.md`.
- [Linux release history](guides/linux-release-history.md): historical payloads,
  updater crossings and the limits of recorded acceptance.
- [Desktop development](../packages/desktop/README.md): client development and
  separate Linux and ToDesktop/Mac distribution paths.

Requirements remain in the [spec index](../specs/index.md); acceptance evidence
is in the [proof index](../proofs/index.md). Dashboard producers and personal
host configuration outside this repository keep their own documentation.
