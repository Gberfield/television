# Television upstream update for review

Observed upstream main: `a8e73fbf5eecfb27172ff5928ffb71f0c6844368` (1.5.4), versus integrated `c7545d6770fa4f5741d611314e4710939e28ebb7`. Fork target: `b745cecc7155f45ba18e84b57cc38dc5026017ca`.

This report-only candidate records observation and review blockers. It contains no upstream implementation or spec import. Integration and tested acceptance fields remain unchanged; a green local run validates this proposal tree, not upstream 1.5.4.

## Review scope

57 upstream commits change 622 paths. Major areas include server-managed artifact JSON resources, artifact authority isolation through browser sandboxing and Electron storage partitions, CLI arrangement/placement and moves, remote reorder behavior, test-service conditional responses, browser flake repairs, spec-policy changes, and removal of Storybook stories/staging/skillbench.

Four protected paths require explicit reconciliation: `.github/workflows/ci.yml`, `.github/actions/setup-shard-readiness/action.yml`, `.github/actions/setup-workspace/action.yml`, and `specs/arch/updates/update-channel.json`. The workflow and both composite setup actions remove skillbench dist restoration and skillbench cache-key inputs. The update-channel master raises the notice to 1.5.0 and rewrites desktop upgrade guidance around Mac/npm; review this against the downstream Linux upgrade gate, fork version and separate Linux release/feed identity before importing it. A non-checkout `git merge-tree --write-tree` inspection found 24 conflicting paths; no merge was applied. Desktop index/connect-preload/test conflicts intersect the downstream Linux identity, updater, window/tray/Hyprland and artifact boundary contracts. The admin guide needs storage-migration wording reconciled with the fork install/feed identity. Version/lockfile conflicts must retain fork workspace version 1.4.23 while retaining legitimate upstream dependencies. Deleted skillbench must be reconciled across workspaces, scripts, tests and CI. Spec/proof indices and artifact-navigation proof need complete policy review; line-count conflict resolution alone is insufficient.

## Conflict paths

- `docs/guides/television-admin-guide.md`
- `package-lock.json`
- `package.json`
- `packages/artifact/package.json`
- `packages/canonical/package.json`
- `packages/cli/package.json`
- `packages/desktop/package.json`
- `packages/desktop/src/connect-preload.ts`
- `packages/desktop/src/index.ts`
- `packages/desktop/test/main.test.ts`
- `packages/server/package.json`
- `packages/shared/package.json`
- `packages/skillbench/package.json`
- `packages/skills/package.json`
- `packages/skills/skills/television/package.json`
- `packages/skills/skills/tv-calendar/package.json`
- `packages/skills/skills/tv-tasks/package.json`
- `packages/utils/package.json`
- `packages/view-markdown/package.json`
- `packages/web/package.json`
- `proofs/index.md`
- `proofs/product/artifact-navigation.md`
- `specs/index.md`
- `storybook/package.json`

## Before source integration

Review the upstream spec deltas and implementation footprint, resolve policy/desktop/storage/version/dependency/workflow conflicts in a separately authorized integrated candidate preserving upstream ancestry, then independently review and fully validate its final pushed head against current target. This report does not authorize main merge or physical host changes. Actions stays disabled; validation runs locally. Omarchy compatibility is a separate proposal. No release, deployment, installed application or existing branch is changed.

Full upstream commit/path inventories, exact workflow diff and conflict inspection are preserved under the local project evidence directory `validation/upstream-review-20261020/`. Final commands, candidate SHA, results, skips and recovered failures are recorded in the draft PR and external ledger after validation.
