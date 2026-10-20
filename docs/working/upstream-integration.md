# Upstream integration and Omarchy compatibility

Owner request: complete actual upstream integration and compatibility review after report-only PRs 22/23 and baseline PR24 landed. Actions stays disabled; runs manual; Support canceled. No merge of unseen spec deltas, host installation, publication, service changes or existing desktop interruption.

## Revisions

Fork main: 5ff9c2e895b2f3ea55befec43b1187bbdcc65ac7. Upstream: a8e73fbf5eecfb27172ff5928ffb71f0c6844368. Common integrated baseline: c7545d6770fa4f5741d611314e4710939e28ebb7. Omarchy stable v4.0.6: 237f1b4071a0bff2296c6d740ba2b9fd695ebfa0; quattro: 3ac43659dcbf88e84d951e3ce979b48a60a7d1f2. Observations are not acceptance.

## Policies requiring reconciliation

Fork policies: preserve Linux x86_64 identity, native frame/Wayland launch, updater feed separation, tray and exact-owned-window Hyprland visibility lifecycle; preserve baseline native-input and process measurement fixes. Normally preserve fork workspace/lock versions with legitimate dependency changes; owner explicitly approved advancing this integration to 1.5.4 to satisfy upstream's 1.5.0 artifact-isolation floor, without publication or installation. Keep manual-only tracking/sync triggers, existing CI graph/permissions/publication guards, disabled-Actions local-provider exception. Preserve observation/acceptance separation and existing data.

Upstream policies: add resource JSON stores, SDK and capability routes; sandbox browser artifact documents and isolate Electron webview sessions/IPC; retain storage partition/reaper contracts and migration limitations. Adopt CLI page placement and moves with backward-compatible existing routes. Remove retired skillbench/stories/staging and their dependency/cache hooks throughout the tree, including fork-only workflows. Adopt revised spec ownership/testing guidance with fork-local requirements retained.

Independent spec, revised proof and revised plan review passed at exact xhigh. The initial proof gap (late save after permanent store loss) and plan omission (required signed-Mac candidate checks) were resolved without weakening authority. Required live Blaxel cross-repository/reused-worker and signed-Mac Bridge/IPC/Updates evidence remain unverified; local-only checks do not establish main merge readiness.

## Work sequence

1. Reconcile owning specs and independently review the entire affected spec tree; human line review deferred until draft PR before merge. Read upstream new contracts and both histories. Record policy audit beyond textual conflicts.
2. Converge imported/adjusted proofs and implementation plan. Compose desktop storage isolation with Linux lifecycle, package/dependency/version state, guides/indexes and workflow references; preserve upstream merge ancestry.
3. Run meaningful narrow canonical tests, owning surfaces and full canonical local verify on committed/current-target candidate, with exact commands, native reports, skips, flakes and limits retained. No assertion/retry weakening to conceal failures. Independently review implementation and integrated result.
4. Review complete Omarchy relevant changes and run isolated actual guest compatibility checks where available. Physical host input/GPU/scaling remains distinct. Advance no compatibility fields without sufficient evidence.
5. Prepare reviewable draft PR(s), exact spec diff and impact scan; cleanup docs only once contribution complete. No shared-branch merge before human spec acceptance.

## Desktop authorization

Owner explicitly approved creation of this chat's disposable television-omarchy-compat-20261020 VM, stop/restart for testing and final removal of only that VM's test disk/profile after evidence export. Existing desktops/services remain intact. Native backend refused exact lease ownership. Supported local status started the VM supervisor; new VM t-cbff2eb03096849fc677ee81 (3e6ba149-4ee6-4dea-951e-013cb180856d, revision1) is allocated/attached but queued and paused. No GUI control or resume yet. No lock override or foreground interaction authorized.

## Evidence

External evidence: /home/gabe/Projects/Television/validation/upstream-integration-20261020. Merge-tree probe reports 24 conflicts and four protected upstream paths. Pinned Node24 npm ci and normal-host toolchain check passed. Initial sandbox toolchain check reported nested npm unavailable; preserved separately. Targeted desktop main initially had66 passes/3 fixture composition failures; after composing owned-window sender fixtures and complete canvas/partition preferences, all69 pass. Complete desktop unit surface passes238 tests with no skips, recovered flakes, leaks or infrastructure failures. New late-save UI contracts pass2 cases; a temporary counterexample failsboth with2 traces/error contexts retained and exact production restoration confirmed; complete Company To-dos owning file passes9 at zero retries. Tracking14 and discovery2 contracts pass. Lint, package-manifest lint and type-check pass; initial type-check caught a fixture-window type declaration error, corrected without a runtime change and preserved externally. These iteration results are not the final committed/pushed full gate. The candidate manifest identifies a8e73fbf as its integrated ancestry and1.5.4 as its fork version; tested_sha and Omarchy compatibility acceptance remain null. Prior main validation does not validate upstream implementation.
