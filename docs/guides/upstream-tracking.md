# Follow upstream changes in this fork

The manifest at `.github/upstream-tracking.json` distinguishes what was observed, what Television ancestry was merged, and which Omarchy revision received compatibility acceptance. Its Omarchy baseline records the initial observation, not proof that every current compatibility path works. Null acceptance/test fields make that limit explicit. Existing Linux/Hyprland and Omarchy-theme tests remain the compatibility evidence; hosted CI does not prove physical desktop interaction.

**Track upstream updates** is active on fork main. It runs daily at 2:37 a.m. EDT (1:37 a.m. EST during standard time), or manually on main. The schedule is fixed, so its Eastern wall-clock hour changes with daylight saving time. It creates a draft for each pending track, deduplicates open track PRs, and never edits an existing sync branch. A blocked merge produces a report draft instead of choosing upstream content. An interrupted run can leave a branch without a PR: open its draft manually after review; the detector refuses to overwrite it.

For a Television draft, review conflicts, retained fork versions, Linux identity/feed and changes to workflows before accepting the merge. For Omarchy, review reported stable/default-branch paths and run the affected synthetic theme, Linux and Hyprland tests. Update `baseline_sha`, `stable_tag`, `stable_sha`, `default_branch` and `compatibility_reviewed_sha` only after that compatibility review; do not merge Omarchy history.

Drafts skip ordinary CI. **Sync validation** runs full read-only CI on sync-branch pushes and can be dispatched manually on a selected sync branch. It deliberately has no deploy/publishing secrets, write token or attestation writer. Verify its recorded head SHA matches the PR head before relying on its checks. An automatic writer never marks a proposal tested. Owner merge/release/install decisions remain separate.

GitHub's current [workflow trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) says token-created opened/synchronize/reopened PR runs require approval by a user with write access. Token-created pushes do not start push workflows. Manually dispatch Sync validation on the draft branch to run actual checks; no new token or grant is needed. The [schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) says schedules run from default-branch files, can delay or drop under load, and public-repository schedules can disable after 60 days without activity. Manual dispatch is the recovery path; changing repository access/security settings is outside this workflow.

## Approved activation

The owner approved merging the reviewed catch-up and enabling the Actions PR-creation capability on October 7, 2026 (Eastern Time). GitHub exposes one combined create/approve-PR setting; the required setting is enabled while default token permissions remain read-only. Only the trusted preparation job requests contents and pull-request writing, and its code creates drafts without approvals, auto-merge or release actions. The manifest's `pr_creation_enabled: true` enables that writer on main. No new token or credential is used.

PR #12 was squashed before activation. PR #13 restored the original reviewed head as a merge parent and was merged with ancestry intact. Main at `2c60cc48a4b3f743ad471ee9417c85ccc75dfb88` contains upstream `c7545d6770fa4f5741d611314e4710939e28ebb7` without rewriting the squashed commit or changing the reviewed application tree. Future Television integrations must retain upstream ancestry; do not use a squash merge that discards it.

See [GitHub's combined setting documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests). Manual detection uses the configured workflow on main; repeated runs with unchanged inputs create no proposal branches or PRs.

## Manual checks and candidate validation

From a checkout on fork main, with your existing GitHub CLI authentication:

```bash
gh workflow run upstream-tracking.yml --repo Gberfield/television --ref main
gh run list --repo Gberfield/television --workflow upstream-tracking.yml --limit 5
```

Inspect the detector report and prepared draft before validation. For a draft
branch, replace the placeholder below with its actual branch name:

```bash
gh workflow run sync-validation.yml --repo Gberfield/television --ref 'sync/television-<revision>'
gh run list --repo Gberfield/television --workflow sync-validation.yml --branch 'sync/television-<revision>' --limit 5
```

Match the completed run's head SHA to the current PR head. A dispatch command
returning successfully is not evidence that tests passed. Do not run `prepare`
locally as a read-only health check: it is the branch/PR writer.

Activation's merged-main CI passed, and two unchanged-input detector runs created
no new PRs or branches. Production draft creation was not exercised by those runs
because no update was pending. The manifest still records `tested_sha: null` and
`compatibility_reviewed_sha: null`; neither activation nor successful detection
fills those acceptance fields automatically.

Tracking changes repository proposals only. Merging a draft does not publish
Linux payloads, update the npm package, deploy the public admin guide, install
skills, restart the server or replace the installed desktop. See the
[fork overview](fork-overview.md) and [Linux guide](../../packages/desktop/linux/README.md).

## Local read-only discovery

The exported `discovery(manifest, read)` function supports a local coordinator through an injected GET-only GitHub adapter. Importing the module does not dispatch `main`, execute candidate tests, push branches, or create pull requests. Discovery preserves the existing pending-track and open-sync-PR deduplication rules and never advances integrated or compatibility baselines. Open PR discovery stops after ten pages of 100 results and fails explicitly when coverage is incomplete. The existing default-branch write guards still apply to the hosted `prepare` command.

Run `npm test -- local --file test/repo/upstream-discovery.test.ts` for the injected-reader discovery contracts. They are also selected by the canonical root unit suite and full verification.
