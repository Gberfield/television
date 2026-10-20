# Follow upstream changes in this fork

The manifest at `.github/upstream-tracking.json` separates observations, integrated Television ancestry and Omarchy compatibility acceptance. Observing an upstream revision does not prove integration or testing. Keep existing acceptance fields unchanged until their review and evidence requirements are met; validation does not update them automatically. Omarchy history is never merged.

## Manual local operation

The owner-directed workflow for this fork keeps repository Actions disabled and runs source validation locally on request. There is no local scheduler, background validation service or automatic branch/PR trigger to install. Use the existing canonical runner; do not link or install the checkout's Television globally or change existing services. The [fork validation policy](../../specs/spec-workflow.md#^fork-disabled-actions-validation) and [upstream-tracking spec](../../specs/arch/updates/upstream-tracking.md) govern acceptance.

For a contribution or sync candidate, preserve the existing checkout and create an isolated worktree at the intended revision. Fetch the current target and ensure the final candidate contains every target commit. Review upstream/fork integration, conflicts, version preservation, workflow changes and Linux release/feed identity; follow [logical merging](../../developer-skills/logical-merging/SKILL.md) if reconciliation is needed. Commit and push the final candidate before qualifying full validation. Neither a local run nor this guide grants merge or publication authority.

Select Node from `.nvmrc` with your version manager, then prepare the isolated checkout:

```bash
touch ~/.tv-developer
npm run toolchain:check
npm ci
```

Do not create or remove `~/.tvdev-use-blaxel`. On an unmarked host, the full verification command below selects local execution normally. If that marker exists, follow the [provider policy](../../specs/arch/testing-policy.md#Verification provider and completion); stop for the required explicit permission before any local bypass. A generic setup step must not opt the host into Blaxel or change provider configuration.

Run the narrow checks first when changing tracking behavior:

```bash
npm test -- local --file test/repo/upstream-tracking.test.ts
npm test -- local --file test/repo/upstream-discovery.test.ts
```

When the focused checks pass, run the complete gate manually:

```bash
npm run verify
```

It runs local preflight, lint, type-check, package-manifest lint, the complete `all` suite and the vibe-mode check. Wait for its final exit status. Do not substitute a targeted pass or a subset of CI jobs for this gate, and do not loop broad runs to diagnose one failure. Return to the narrow failing surface first.

On a desktop host, preserve the user's display and private Television home. Use an isolated headless child environment and the [Electron harness](../../specs/arch/desktop/e2e-harness.md); do not shut down a desktop or replace a service to make tests pass. Test servers and CLI clients use fresh temporary `--home` paths. Where a fixture uses the documented update-channel hook, retain the served fixture identity with the result rather than silently changing the product update behavior.

Record the exact candidate SHA/tree, current target SHA and ancestry check, provider, commands and exit status, the runner's `.test-runs/` directory, skipped tests, recovered attempts, process leaks and infrastructure failures in the PR. Preserve raw failed attempts and diagnostic artifacts. Recheck candidate and target after the run; if either moved, inspect the change and validate the resulting tree again. Any actual required GitHub check still applies and cannot be replaced by local verification.

Full canonical verification supplies exact-candidate source validation under the disabled-Actions fork policy. It does not prove GitHub scheduling, token enforcement, cache/artifact services or physical desktop compatibility, and local runs do not publish durable `refs/testpass/*` attestations. Live PostHog, production-daemon and isolated-GitHub fault-injection suites are specialized exclusions from `all`; run them only when their governing scope and authorization apply. Human spec, integration and Omarchy compatibility review remain separate.

## Optional local read-only discovery

The exported `discovery(manifest, read)` function can query public upstream state through an injected GET-only adapter. Use reviewed fork-main tooling and existing GitHub CLI authentication. Run this manually from that trusted checkout root, not from an unreviewed fetched candidate:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { discovery } from './scripts/upstream-tracking.mjs';

const manifest = JSON.parse(readFileSync('.github/upstream-tracking.json', 'utf8'));
const read = async (path) => {
  const args = ['api', '--method', 'GET', path];
  if (path.includes('/compare/')) {
    args.push('--jq', '{status, files: [.files[]? | {filename, previous_filename}]}');
  }
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
};
console.log(JSON.stringify(await discovery(manifest, read), null, 2));
NODE
```

This reads GitHub metadata locally; it does not consume an Actions runner, dispatch a workflow, fetch or execute code from observed upstream revisions, create a branch/PR or advance an acceptance baseline. The injected-reader tests prove discovery control flow, not real API authorization. Comparison responses retain every returned path and their status while omitting unused patch bodies. An incomplete paginated inventory or a subprocess response exceeding the explicit 16 MiB buffer fails rather than returning a partial report. Do not fake `GITHUB_REPOSITORY`/`GITHUB_REF` or invoke the hosted `prepare` writer as a local health check.

If discovery reports a pending track, review the reported revisions before choosing integration work. For Omarchy, inspect relevant stable/default-branch changes and run the affected Linux, Hyprland and theme tests. Advance `baseline_sha`, `stable_tag`, `stable_sha`, `default_branch` and `compatibility_reviewed_sha` only after compatibility review; hosted synthetic tests alone would not supply physical acceptance either.

## Retained hosted workflows and history

The workflow files remain available for a separately authorized future hosted operation. Tracking and Sync validation are manual-only; there is no tracking schedule or sync-push trigger. Ordinary `ci.yml` keeps its push/ready-PR graph for use when Actions is enabled. Enabling Actions or dispatching any workflow is outside the manual local procedure above. Required checks, job permissions and upstream publication guards are unchanged.

The manifest's existing `pr_creation_enabled: true` records the earlier owner-approved writer capability. It does not authorize a new local writer. The trusted hosted preparation job requires fork main, creates draft proposals without approvals or auto-merge, and refuses existing sync branches/PR edits. An orphan branch from interrupted PR creation requires owner intervention, never replacement. Tracking writes, release publication, deployment and installation require their own scope.

Historically, PRs #12 and #13 activated tracking and restored reviewed upstream ancestry after an earlier squash. Main at `2c60cc48a4b3f743ad471ee9417c85ccc75dfb88` contains upstream `c7545d6770fa4f5741d611314e4710939e28ebb7` with that ancestry intact. Retain upstream parents in future integrations; do not squash away the ancestry used for tracking. This history does not assert that hosted automation is currently enabled.

Source maintenance does not publish Linux payloads, update npm packages, deploy the public administrator guide, install skills or replace the installed desktop. See the [fork overview](fork-overview.md) and [Linux guide](../../packages/desktop/linux/README.md).
