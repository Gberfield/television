# Fork workflow review

Source inspected: Gberfield/television main e7167dee0d1b437cc1cd183308b610db891d124e.

## Submitted change

- `upstream-tracking.yml`: manual dispatch only; remove the daily schedule.
- `sync-validation.yml`: manual dispatch only; remove the sync-branch push trigger.
- `ci.yml`: unchanged. Ready PRs and main/integration pushes retain all checks.
- npm publication and both ToDesktop workflows: unchanged upstream-only job guards.
- Repository Actions: left disabled. No secrets, variables, runner registration,
  required-check configuration, deployment or upstream tracker baseline changed.

The manual upstream workflow can still prepare a draft if its existing manifest
and permission gates authorize it; manual-only does not make the writer read-only.
Dispatch review includes both jobs. No PR-writing capability is enabled here.

## Compute decision before execution

An unskipped ordinary CI graph expands to 26 jobs: one attestation decision,
three static checks, one vibe-mode check, two unit/desktop suites, one shared
build, sixteen e2e shards, one join and one attestation writer. Some heavy steps
can no-op only under existing valid attestation; those semantics are unchanged.
Sync validation expands to 25 jobs and deliberately does not use attested skips.
These are job counts, not a price quote or measured runner-minutes for this head.

Future activation must choose its compute allowance and review these exact
workflow versions. Merge the reviewed manual-only source first, then explicitly
approve repository Actions activation. Do not set required contexts until a real
ready-PR run emits the expected lint, type-check, package-manifests, unit,
e2e:desktop and e2e-required checks. No skipped graph is a full validation pass.

## Verification and remaining gates

Two independent static YAML trigger contracts failed before the change and passed
after it. YAML parsing, unchanged job-graph comparison, TypeScript syntax and
whitespace checks are recorded in the PR. Static parsing does not prove GitHub
scheduling or authorization behavior. The canonical Vitest tests/full verify and
live provider validation are not claimed: this source snapshot has no installed
workspace dependencies and repository Actions remain disabled. Source-only draft;
human spec/PR review and applicable validation precede merge under AGENTS.md.

No upstream-tracking schedule in this fork is required to keep the separate local
repo-watch service operating. This change does not inspect or modify that service.
