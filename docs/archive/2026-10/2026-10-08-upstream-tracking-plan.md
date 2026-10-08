> **Archived 2026-10 from branch activation/upstream-tracking.** This implementation plan guided PR #12; the catch-up and tracker were completed with independent-review corrections, followed by an additive ancestry repair after its squash merge. It retains the original approved scope, integration and validation sequence, and review-driven design rationale as one historical record.

# Upstream tracking and catch-up

Approved scope: daily and manual detection for Television main and Omarchy stable/relevant compatibility changes, draft PRs only. Preserve upstream ancestry, downstream Linux/Omarchy behavior, fork version 1.4.23 and separate linux-stable release identity. No deployment, installation, release, access change or live artifacts.

## Design and implementation

- Merge observed Television c7545d6770fa4f5741d611314e4710939e28ebb7 into fork 446c2dd4332fc9b4686ec6ca79d3e42177803e24. Keep both stage test additions, regenerate the conflicting index line, and restore all downstream workspace/lockfile version fields. Upstream release bumps do not name a fork release.
- Commit a manifest separating observed and integrated Television SHA; Omarchy records observed stable tag/SHA and compatibility-review SHA. Omarchy history is never merged. Detect default-branch drift and relevant theme/Hyprland/package/launcher changes in addition to stable releases.
- Read-only discovery job calls public GitHub APIs. A separate narrowly privileged writer checks out trusted default-branch tooling and creates one immutable draft branch per pending update. Existing track PRs/branches are preserved, never force-pushed. Merge conflicts or identity/workflow changes produce a manifest/report draft for human resolution.
- Writer does not install dependencies or execute candidate code. Validation copies the existing full CI topology with read-only token, nonpersisted checkout credentials, forced actual tests, no attestation writer or deployment credentials. Pushes to sync branches and explicit manual runs validate drafts. Token-created PR events may require owner approval; token-created pushes do not trigger CI. Scheduled runs begin only when the workflow reaches main, can delay/drop, and can disable after inactivity.

## Test and review sequence

1. Add failing synthetic tracker tests for clean merges, conflict reporting, identity preservation, relevant Omarchy changes and duplicate/human branch refusal.
2. Implement the trusted tracker and workflow boundaries; run the focused tests and static checks in a credential-free local sandbox.
3. Commit the whole branch; obtain independent review at xhigh and resolve blockers.
4. Push/create an authorized draft PR, prove full read-only GitHub checks ran at final SHA, report limitations. Owner review/merge remains separate.

## Execution evidence and review

The real catch-up merge is 92a3a9dc41eafe8e44cdea5ea206e65a4139bc54, with parents 446c2dd4332fc9b4686ec6ca79d3e42177803e24 and c7545d6770fa4f5741d611314e4710939e28ebb7. Both stage test additions were retained; version bump fields were explicitly restored to fork 1.4.23 while Markdown dependency changes were retained. No nested dependency version changes were present in this catch-up.

The initial independent reviewer (gpt-6-astra, xhigh, fresh context) rejected f46527b for general nested dependency version restoration, missing Linux build guards, Omarchy release/branch fingerprint collisions, unsafe manifest symlinks, and incomplete proof structure. Synthetic regression tests reproduced the tracker defects before fixes. Remediation restricts lockfile restoration to actual tracked workspace paths, reports unsafe manifests before reading/writing them, fingerprints all Omarchy release/branch inputs, guards actual Linux build/feed inputs, and completes the proof. The original nine tests also passed independently in the reviewer's credential-free sandbox.

Local broad unit validation at the initial commit: 4514 passed, three failed. The new proof-declaration failure is fixed and its focused suite passed. The two remaining host capability failures are test-runner-prebuilt “nested plan workers discard inherited GitHub Actions state” and test-runner-preflight “hands the real installed Electron package to the shared planner without mutation”; Electron preflight reports missing xvfb-run. No live packages were installed. Final full hosted validation is required.

Read-only discovery smoke testing without credentials returned the expected Television and Omarchy identities with no pending update beyond this catch-up. Actions permissions inspection reported can_approve_pull_request_reviews:false. Automatic PR writing remains explicitly gated pending specific owner capability approval; settings and credentials were not changed.
