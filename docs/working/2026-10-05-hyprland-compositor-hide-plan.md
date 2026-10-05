# Hyprland compositor Hide implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the human selects that method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide and restore the same live Television window on Hyprland without calling Electron Hide or replacing its document.

**Architecture:** Preserve profile-scoped Electron single-instance arbitration. A small main-process controller serializes desired visibility; a version-verified Hyprland transport moves the exact owned window between its origin and an inactive special workspace. Observe actual compositor workspace/output visibility before reporting success.

**Tech stack:** Existing TypeScript main process, Node subprocess/Unix-socket APIs, installed Hyprland Lua control API, Electron 43.7.6, canonical Vitest/Playwright runner. No new runtime dependency.

**Spec:** [Approved design](2026-10-05-hyprland-compositor-hide-design.md). The human approved this design on October 5, 2026. Its conversion into governing product/architecture specs and independent spec/proof gates is Task 1; this plan does not silently replace them.

**Status:** Plan for review; execution method not selected. No compositor implementation, passing replacement acceptance or release readiness is claimed. Starting tree: `78746c9eb4882a72529f4c0e89ad8c3704c88a72` on `fix/linux-window-menu`.

## Global constraints

- “Use the normal production sandbox on both Wayland and X11.” Never add `--no-sandbox` or synthetic buffer-release behavior as a production solution.
- “The installed engine pin stays unchanged.” Retain Electron 43.7.6, electron-builder 26.16.1 and electron-updater 6.8.9; use Node 24.x and npm >=11.5 <12.
- “Other desktops retain native Minimize.” Preserve Mac startup and menu behavior.
- “Create no persistent system settings, desktop rules, keybindings or user authentication changes.” Transient ownership belongs to one process/window and compositor session.
- “An application restart begins with a normal visible window and does not adopt another process's hidden window.” Keep existing user data and normal installation untouched during candidate checks.
- “A special workspace already visible on any monitor cannot be used as the hidden destination.” Failed control does not fall back to Electron Hide.
- “Preserve the existing Electron Hide failures in this report; do not relabel them as passes.” Add separate replacement evidence and preserve original before/hidden/after screenshots outside the application repository.
- “Physical host checks and full application verification remain release gates.” Publication, PR submission, merging and release remain later user-directed steps.

## Review focus

1. A timed-out command may execute later: a delayed Hide must never override a newer visible request. Task 2 tests reversed command delivery and lost receipts at the real compositor seam.
2. A compositor address may be reused or another profile may match: exact ownership is validated inside every action. Task 2 covers ambiguous bootstrap, target destruction/replacement and session change; Task 4 covers two real profiles.
3. A person moves/reveals the holding window: cancel old hidden state and restoration history, including pending actions. Task 2 tests external-change invalidation; Task 4 exercises actual movement/reveal.
4. A holding workspace becomes visible on a second monitor: refuse it or use a new owned inactive destination. Tasks 2 and 4 check all-monitor visibility, workspace disappearance and supported native states.
5. Control fails after the window is hidden: retain the original document and pending reveal, notify once per failed request, and retry on a later launch. Tasks 2–4 distinguish unavailable recovery from successful visible restoration.

## Files and boundaries

| File | Responsibility |
| --- | --- |
| `specs/product/linux-desktop.md` | Observable Hide/restore, refusal, manual movement and unavailable-control behavior |
| `specs/arch/desktop/linux-distribution.md` | Verified session/API, exact ownership, lifecycle and transport contract |
| Mirrored `proofs/product/linux-desktop.md`, `proofs/arch/desktop/linux-distribution.md` | Derived assertions, declared fixtures/mocks/forfeits and exact evidence scope |
| New `packages/desktop/src/hyprland-visibility.ts` | Desired visibility, ownership ledger, serialized reconciliation and outcomes |
| New `packages/desktop/src/hyprland-control.ts` | Bounded local control, validated Lua actions and compositor observations/events |
| `packages/desktop/src/index.ts` | Menu/startup/single-instance wiring and nonintrusive failure notification |
| New `packages/desktop/test/hyprland-visibility.test.ts`, `hyprland-control.test.ts` | Controller contracts and real subprocess/protocol boundaries |
| `packages/desktop/test/main.test.ts`, `connect-flow.test.ts` | Main-process lifecycle and connection/navigation regression |
| New `packages/desktop/test/e2e/linux-hyprland-observer.ts`, `hyprland-control.test.ts` | Independent compositor/session/window/workspace/output observation and generated-action seam |
| `packages/desktop/test/e2e/linux-packaged.test.ts` | Actual Hyprland packaged spine; ordinary non-Hyprland packaged behavior |
| `packages/desktop/linux/README.md` | Supported API, expected menu behavior and recovery limits |

No installer, launcher, updater, server or renderer redesign is expected. Report assets and private host receipts stay in the handoff workspace, not this repository.

### Task 1: Convert approved intent to specs and proofs

**Files:** Modify the two owning specs and mirrored proofs listed above; retain this working design/plan.

**Interfaces:** Consumes the approved design. Produces independently converged requirements and anchored proof obligations for Tasks 2–4.

- [ ] **Step 1:** Update `^linux-hyprland-hide` and the architecture lifecycle anchors. Replace the current Electron show/hide promise with origin-workspace restoration, manual-change precedence, unavailable-control notification/retry, unsupported-state refusal and exact-window continuity. Resolve the focused-window wording: only the owned main window is controllable; no focused window is a safe no-op and an unrelated focused window is never moved.
- [ ] **Step 2:** State the supported version/capability boundary. Initial adapter targets verified Hyprland 0.56.2 Lua APIs; other versions are unavailable until separately verified. Session-name matching still selects the menu/profile lock; actual compositor verification selects whether Hide can execute. Unknown session/API leaves the window visible with an explanation.
- [ ] **Step 3:** Independently converge every spec delta using the repository's exact `xhigh` reviewer gate. Human review of the actual spec deltas remains due before their first shared-branch merge; do not reinterpret proposal approval as line review of future edits.
- [ ] **Step 4:** Derive and independently converge proof assertions. Controller doubles replace only transport/Electron boundaries; real generated-action seam tests forfeit GUI semantics to the actual Hyprland spine. Replace fake `XDG_CURRENT_DESKTOP=Hyprland` on Weston as acceptance of this mechanism. Preserve previous failing evidence and ordinary Weston coverage with honest session identity.
- [ ] **Step 5:** Reconcile this plan with the converged specs/proofs. Any changed human intent returns to the human; derivable details remain autonomous. Commit the spec/proof/planning checkpoint locally with no co-author trailer.

### Task 2: Owned-window controller and Hyprland transport

**Files:** Create the two source modules, two unit test files, `packages/desktop/test/e2e/linux-hyprland-observer.ts` and `packages/desktop/test/e2e/hyprland-control.test.ts`.

**Interfaces:** Define/export these in `hyprland-visibility.ts`; the architecture spec owns their final contract.

```ts
type VisibilityOutcome = { status: 'visible' | 'hidden' | 'pending' | 'refused'; reason?: string };
type WindowOwner = { pid: number; applicationID: string; session: string; marker: string; address?: string };
type VisibilityIntent = { owner: WindowOwner; revision: number; expectedExternalRevision: number;
  visible: boolean; originWorkspace?: number; holdingWorkspace?: string };
type CompositorObservation =
  | { status: 'unavailable'; reason: string }
  | { status: 'missing' | 'ambiguous' | 'replaced' }
  | { status: 'owned'; owner: WindowOwner; workspace: number; workspaceName: string;
      visibleOnMonitors: number[]; normalWorkspaces: number[];
      activeNormalWorkspace: number | null; supportedWindowState: boolean; externalRevision: number };
interface HyprlandTransport {
  inspect(owner: WindowOwner): Promise<CompositorObservation>;
  apply(intent: VisibilityIntent): Promise<{ acknowledged: boolean }>;
  watch(owner: WindowOwner, changed: () => void): () => void;
  dispose(): void;
}
interface HyprlandVisibilityController {
  request(visible: boolean): Promise<VisibilityOutcome>;
  dispose(): void;
}
```

`createHyprlandControl(options: { session: string }): HyprlandTransport` lives in `hyprland-control.ts`. `createHyprlandVisibility(options: { owner: WindowOwner; transport: HyprlandTransport; notify: (message: string) => void }): HyprlandVisibilityController` lives in `hyprland-visibility.ts`. Outcomes report verified visibility, not a successful child exit or receipt.

`observeHyprlandWindow(owner: WindowOwner): Promise<CompositorObservation>` lives in the test observer. It reads actual clients/workspaces/monitors independently of the production adapter, never success from controller state, marker presence alone or Electron `isVisible()`. The seam test launches a dedicated real packaged candidate for its native target, imports the new transport in the Node test process, and runs its generated actions against that actual owned window. The package does not need Task 3 wiring for this seam.

- [ ] **Step 1: Write failing controller tests.** Named cases/assertions: `repeated hide keeps its first origin`; `show wins over a pending hide`; `lost hide receipt retains ownership`; `unavailable restore returns pending and never replaces the window`; `manual move or reveal cancels old origin and stale requests`; `removed origin restores to validated active normal workspace`; `visible holding destination is refused`; `disposed controller never dispatches`. Assert final observed outcome, exact owner, no unrelated action, and retained ledger after unknown completion.
- [ ] **Step 2: Run the narrow red baseline.** `npm test -- local --file packages/desktop/test/hyprland-visibility.test.ts`. Confirm intended behavioral failures, not missing infrastructure, before implementation.
- [ ] **Step 3: Implement the controller.** Record desired intent/revision before dispatch. Capture `expectedExternalRevision` from the reconciled observation when minting each action; never refresh that fence on an already pending old action. Serialize work, reconcile before and after commands, and keep pending visibility after transport failure. Notifications use `Television could not hide this window. It remains open.` only after verified visible refusal; unknown Hide uses `Television could not confirm whether its window is hidden. Open Television again to retry.` Failed restore uses `Television is still running, but could not restore its window. Open Television again to retry.` No scheduled endless retries, page reload or replacement window. Repeated Hide does not overwrite origin. Manual changes invalidate history and pending old actions; the next Hide captures a fresh origin.
- [ ] **Step 4: Write transport seam failures.** Execute the real generated Lua through a private actual Hyprland 0.56.2 session, not a mock that releases buffers on Hide. Require: unique main-window bootstrap and marker binding inside the action; rejection of ambiguity/reused identity; destination invisibility on every monitor; ownership/session check before move; stale revision ignored; external invalidation before delayed Hide; unsupported grouped/fullscreen refusal without moving other windows. Also test malformed JSON, timeout, nonzero exit, output limit and hostile workspace strings at the subprocess boundary.
- [ ] **Step 5: Implement the transport.** Invoke `hyprctl` with an argument vector, no shell, targeting the captured compositor session. Use a 2-second command deadline, 1 MiB output ceiling and a 10-second total visible-state observation deadline. Encode Lua string data as fixed-width decimal byte escapes; never interpolate workspace names as code. Use verified `hl` query/dispatch APIs and transient per-window markers, revision state and external-change observation. Validate/bootstrap PID + exact application identity + unique live main client within the compositor action, then require address + marker + session on subsequent actions. A client killed for timeout may have issued an action: inside that same action require both a non-stale application revision and equality with the captured `expectedExternalRevision`. Compositor-observed manual move/reveal increments the external revision, including before a previously unseen higher application revision arrives. Distinguish own confirmed movement from manual events; a Node queue alone is insufficient. Clean up only this controller's transient observers/markers.
- [ ] **Step 6: Verify green.** Run both targeted files through `npm test -- local --file <path>`, then `npm test -- local --file packages/desktop/test/e2e/hyprland-control.test.ts --retries 0` against the prepared private session/candidate. Test delivery of older Hide after newer reveal, and a previously unseen higher application revision minted before a manual move/reveal: the stale external fence rejects it, with no move away from the person's placement. If the installed API cannot enforce these contracts, stop adapter execution and return the limitation to the owning spec; do not silently broaden support or weaken ownership.
- [ ] **Step 7:** Independently converge the slice and commit locally. Ordinary app behavior is unchanged at this checkpoint; the controller is not wired to the menu yet.

### Task 3: Main-process wiring and packaged acceptance

**Files:** Modify `src/index.ts`, `test/main.test.ts`, `test/connect-flow.test.ts`, `test/e2e/linux-packaged.test.ts` (all under `packages/desktop/`).

**Interfaces:** Consume Task 2 factories/interfaces and independent `observeHyprlandWindow` helper.

- [ ] **Step 1: Write lifecycle failures.** Replace expectations that Hyprland calls `BrowserWindow.hide()` with requests to the owned controller. Assert no Electron Hide, no reload, unchanged window/document/connection; lock loser still exits before readiness/load; early launcher request wins once a real window exists; late ready-to-show cannot undo requested visibility; no focused/unrelated window causes no move; closed-window disposal cancels queued work. Non-Hyprland Minimize and Mac behavior stay covered.
- [ ] **Step 2: Verify red.** `npm test -- local --file packages/desktop/test/main.test.ts --grep 'Hyprland'`. Confirm failures arise from the old wiring.
- [ ] **Step 3: Wire the controller.** Preserve existing profile lock, `second-instance`, activation and connection code. Construct the owner for the one live main window after creation, bind to the verified compositor session, and delegate Hide/reveal. Native `Notification` supplies nonintrusive failure copy; unavailable notification support must not turn failure into success. A new process starts visibly; no previous-process adoption. Guard startup/ready/close callbacks against stale window/controller identity.
- [ ] **Step 4: Add the independent packaged spine and verify red.** Actual Hyprland session, actual portable/AppRun entrypoint, profile lock and real token-protected Television server; labeled HTML, editable Markdown and independent loopback URL fixtures. Before Hide, set a document sentinel and make an unsaved edit. For five cycles: prove absence from every visible output, deliver server update while hidden, launch the same entrypoint/profile, prove original-workspace visibility, then verify same PID/native window/document, no navigation, edit/update/socket/profile continuity and production renderer sandbox. Capture original before/hidden/after images with independent compositor identity/state receipts. A missing actual Hyprland/X11 observer is BLOCKED, never accepted by Weston or renderer pictures.
- [ ] **Step 5: Verify green and widen once.** Run the targeted main/connection files; desktop type-check; full desktop unit surface (`npm test -- local --surface unit:desktop`). Build with `npm run package:linux` into a separate output, use the provided installer in its own candidate prefix/XDG directories, and run the canonical packaged file against that package with `TV_LINUX_REQUIRE_SANDBOX=1`, `TV_LINUX_REQUIRE_WINDOW_MANAGER=1`, `--retries 0` on the prepared isolated Hyprland display. Explicit backend selection uses the existing launcher input; no harness sandbox opt-out is allowed. Preserve ordinary actual Wayland/X11 packaged cases with honest non-Hyprland identity on Weston.
- [ ] **Step 6:** Independently converge this slice and commit locally. Record any required but unavailable native acceptance as an open gate, not a passing implementation.

### Task 4: Real matrix, recovery breadth and integrated review

**Files:** The owning proofs, Linux README and packaged tests; handoff report/evidence outside the repo.

**Interfaces:** Consume Task 3's actual entrypoint/spine and independent observer. Produce candidate hashes, scoped results and original screenshots; never amend historical results into passes.

- [ ] **Step 1:** Execute the four actual Hyprland combinations sequentially: Wayland portable, Wayland extracted AppRun, X11 portable, X11 extracted AppRun. Five real launcher restore cycles per combination. AppRun proves the extracted entrypoint, not FUSE installation. A missing X11 listener remains blocked; do not change shared display services to obtain a pass.
- [ ] **Step 2:** Execute focused breadth cases: two profiles concurrently; control absent before Hide; lost Hide response; control unavailable after Hide then restored on a later launcher attempt; delayed startup/rapid desired visibility; target closed/replaced; deleted origin; manual move/manual reveal; visible holding destination on another monitor; normal/floating/maximized state preservation; unsupported group/fullscreen leaves original visible. Preserve actual failures and clean up only owned clients/fixtures/session resources.
- [ ] **Step 3:** Perform guarded physical Omarchy checks only with a current local foreground authorization. Use the dedicated candidate and synthetic server, brief native menu selection and real installed launcher activation. Prove absence/return on visible host monitors, identity, document, connection and sandbox. Respect any newer stop. Isolated Hyprland passes cannot accept host GPU/scaling or physical input; no foreground control is implied by design approval.
- [ ] **Step 4:** Update README recovery/support wording and proofs with exact candidate/test identities, test names, mocks/forfeits, unperformed checks, failures and recovered flakes. Preserve normal app, connection and Hyprland configuration hashes. Update the single handoff HTML test document with separate replacement PASS/FAIL/BLOCKED rows, small original screenshots and details; validate original images, links and readable wide/narrow layouts.
- [ ] **Step 5:** Once narrow required checks are green, run `npm run verify -- --no-publish` under the canonical provider policy and wait for completion. Do not bypass a host's remote-provider marker without the separate authorization its testing policy requires. If the broad gate finds a failure, isolate/fix it narrowly and repeat only the affected checks, then the full gate.
- [ ] **Step 6:** Independently converge the integrated result against specs/proofs/tests/code. Confirm every temporary failing baseline is healed, full verification is green, native gates are honest and docs prep is appropriate to WIP versus ready status. Commit the reviewed candidate locally. Prepare review materials; leave push/PR submission, shared-branch merge and release to later user instructions.

## Self-review and execution handoff

The four tasks cover every approved requirement, with two implementation slices (controller/transport, then app/packaged integration). Task 1 is the mandatory derivation gate; Task 4 accepts the integrated result. Interface names are shared once above. Version-specific Lua feasibility, real monitor visibility and unavailable-control recovery are explicit gates rather than assumed successes.

**Recommended execution:** Native implementation in this chat, with the independent reviewers required by `AGENTS.md` at spec/proof/slice/final gates. The two code slices share ownership and lifecycle interfaces; keeping one implementer reduces handoff drift. The alternative is fresh subagent-driven implementation/review for each slice. Human plan review and method selection precede implementation.
