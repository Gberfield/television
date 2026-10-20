*Synthetic tracking contracts and exact-revision source validation, with hosted operational claims kept separate.*

# Fork upstream tracking proof

Proves [specs/arch/updates/upstream-tracking.md](../../../specs/arch/updates/upstream-tracking.md).

## Coverage model

Synthetic contracts distinguish observed and integrated Television identities and Omarchy stable/default-branch changes. A path predicate determines relevant compatibility inputs; no hosted API is mocked as evidence of its authorization behavior. Temporary Git repositories exercise real merges, parents, version restoration, dependency updates, content conflicts and unsafe manifest handling. These contain only synthetic files and never run fetched application code.

Workflow YAML contracts prove the submitted permissions, triggers, credential persistence and publication gates. They honor the spec's synthetic-testing guidance but do not emulate GitHub's scheduler, token approvals, transport leases or PR API. The create-only lease relies on Git; operational proof of publication comes from actual owner-authorized draft publication. Exact-revision source validation follows the applicable fork policy: full canonical verification of the final pushed head containing the current target can validate a sync candidate while Actions is intentionally disabled and the target has no required status checks. The draft PR records that result and retained local evidence; hosted run URLs are required only for claims that depend on hosted execution. Existing Linux/Hyprland and Omarchy-theme tests remain the compatibility contracts; hosted synthetic suites do not establish physical desktop interaction or acceptance of a new Omarchy revision.

## Test hooks

`pendingUpdates` receives observed public state and open PR snapshots; production obtains those through read-only GitHub APIs. `syncBranch` and `branchAvailable` expose the deterministic proposal identity and existing-branch refusal used by production. `relevantOmarchyPath` and `protectedIntegrationPath` classify the actual source paths considered by discovery and merge review. `preserveVersions` and `mergeCandidate` accept a checkout/base commit; tests supply isolated synthetic repositories, while production supplies the disposable trusted-tooling checkout.

## Detection and proposals

For [input identity](../../../specs/arch/updates/upstream-tracking.md#^tracking-inputs) and [detection](../../../specs/arch/updates/upstream-tracking.md#^tracking-detection), compare against integrated ancestry, recognize relevant paths, changed stable tags/commits and default branches. `test/repo/upstream-tracking.test.ts` cases “detects Television against integrated ancestry”, “detects stable releases”, “recognizes Omarchy themes” and “reports a stable tag moved” provide contract evidence. ^tracking-t-detection

For [draft preservation](../../../specs/arch/updates/upstream-tracking.md#^tracking-drafts), an open track PR suppresses another proposal, a remote branch is never replaced, and Omarchy identities distinguish stable/default-branch changes at the same head. The “keeps one pending draft” and “uses stable release and branch identity” cases prove these pure decisions. Git's create-only transport lease and hosted API permission enforcement remain operational boundaries. ^tracking-t-proposals

## Integration

For [ancestry and version preservation](../../../specs/arch/updates/upstream-tracking.md#^tracking-integration), real synthetic merges keep both parents and downstream files, restore actual workspace versions, and retain root/nested dependency updates. Content conflicts and unsafe manifest paths produce report-only outcomes with the base tree restored. “keeps ancestry or reports unsafe integration” and “retains updated nested dependency versions” prove these Git/filesystem seams; “requires review for Linux build/feed selectors” proves the release-path decision. ^tracking-t-integration

The reviewed artifact-isolation transition is a manual integration exception, not a change to `preserveVersions` or the hosted draft preparer. Review checks the owner's explicit version decision, the scoped spec exception, the synchronized `1.5.4` workspace/lock and tracking-policy metadata, and the upstream `1.5.0` desktop floor. Package-manifest checks and full canonical validation exercise the resulting candidate. Publication and installed-runtime acceptance remain outside that source evidence.

## Validation boundaries

For [credential separation](../../../specs/arch/updates/upstream-tracking.md#^tracking-validation), “separates read-only discovery” and “validates draft sync branches” assert YAML permissions, manual-only triggers, actual tests, absent deploy secrets/write jobs and nonpersisted checkout credentials. The trigger contract rejects both scheduled tracking and automatic sync-push validation. The initial disabled PR-writing capability is explicitly documented; these assertions do not grant it. Source validation of an actual upstream sync candidate may use full canonical verification under the [disabled-Actions fork policy](../../../specs/spec-workflow.md#^fork-disabled-actions-validation), including its final pushed-head/current-target and evidence requirements. Review verifies policy applicability and the complete runner reports; no synthetic test substitutes for an actual full run. This is not hosted scheduler or permission evidence, a durable local attestation, physical compatibility acceptance or an automatic manifest update. Separately required operational checks and human integration/compatibility review remain in force. ^tracking-t-validation

## Local discovery adapter

- `scripts/upstream-tracking.mjs` exports GET-adapter discovery while retaining the guarded hosted writer.
- `test/repo/upstream-discovery.test.ts` verifies read-only observations, baseline preservation, adoption of an existing sync PR, and refusal of an incomplete paginated PR inventory.
- These are injected-reader contract tests: the GET adapter is mocked. They prove discovery control flow and observation handling, and forfeit real GitHub transport, scheduler, permission and credential-boundary evidence. The production discovery hook is `discovery(manifest, read)`; full verification selects these contracts through the root Vitest suite. They do not claim a merged upstream ancestry candidate or deployed Omarchy compatibility.
