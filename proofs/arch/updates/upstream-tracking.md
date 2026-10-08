*Synthetic Git and workflow contracts for downstream tracking, with hosted checks recorded separately.*

# Fork upstream tracking proof

Proves [specs/arch/updates/upstream-tracking.md](../../../specs/arch/updates/upstream-tracking.md).

## Coverage model

Synthetic contracts distinguish observed and integrated Television identities and Omarchy stable/default-branch changes. A path predicate determines relevant compatibility inputs; no hosted API is mocked as evidence of its authorization behavior. Temporary Git repositories exercise real merges, parents, version restoration, dependency updates, content conflicts and unsafe manifest handling. These contain only synthetic files and never run fetched application code.

Workflow YAML contracts prove the submitted permissions, triggers, credential persistence and publication gates. They honor the spec's synthetic-testing guidance but do not emulate GitHub's scheduler, token approvals, transport leases or PR API. The create-only lease relies on Git; operational proof comes from actual owner-authorized draft publication and final-SHA hosted validation. Hosted run URLs belong in the draft PR. Existing Linux/Hyprland and Omarchy-theme tests remain the compatibility contracts; hosted synthetic suites do not establish physical desktop interaction or acceptance of a new Omarchy revision.

## Test hooks

`pendingUpdates` receives observed public state and open PR snapshots; production obtains those through read-only GitHub APIs. `syncBranch` and `branchAvailable` expose the deterministic proposal identity and existing-branch refusal used by production. `relevantOmarchyPath` and `protectedIntegrationPath` classify the actual source paths considered by discovery and merge review. `preserveVersions` and `mergeCandidate` accept a checkout/base commit; tests supply isolated synthetic repositories, while production supplies the disposable trusted-tooling checkout.

## Detection and proposals

For [input identity](../../../specs/arch/updates/upstream-tracking.md#^tracking-inputs) and [detection](../../../specs/arch/updates/upstream-tracking.md#^tracking-detection), compare against integrated ancestry, recognize relevant paths, changed stable tags/commits and default branches. `test/repo/upstream-tracking.test.ts` cases “detects Television against integrated ancestry”, “detects stable releases”, “recognizes Omarchy themes” and “reports a stable tag moved” provide contract evidence. ^tracking-t-detection

For [draft preservation](../../../specs/arch/updates/upstream-tracking.md#^tracking-drafts), an open track PR suppresses another proposal, a remote branch is never replaced, and Omarchy identities distinguish stable/default-branch changes at the same head. The “keeps one pending draft” and “uses stable release and branch identity” cases prove these pure decisions. Git's create-only transport lease and hosted API permission enforcement remain operational boundaries. ^tracking-t-proposals

## Integration

For [ancestry and version preservation](../../../specs/arch/updates/upstream-tracking.md#^tracking-integration), real synthetic merges keep both parents and downstream files, restore actual workspace versions, and retain root/nested dependency updates. Content conflicts and unsafe manifest paths produce report-only outcomes with the base tree restored. “keeps ancestry or reports unsafe integration” and “retains updated nested dependency versions” prove these Git/filesystem seams; “requires review for Linux build/feed selectors” proves the release-path decision. ^tracking-t-integration

## Validation boundaries

For [credential separation](../../../specs/arch/updates/upstream-tracking.md#^tracking-validation), “separates read-only discovery” and “validates draft sync branches” assert YAML permissions, draft triggers, actual tests, absent deploy secrets/write jobs and nonpersisted checkout credentials. The initial disabled PR-writing capability is explicitly documented; these assertions do not grant it. Actual full hosted checks must run at the final candidate SHA before acceptance. ^tracking-t-validation
