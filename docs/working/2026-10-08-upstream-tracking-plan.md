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
