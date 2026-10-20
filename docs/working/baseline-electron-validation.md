# Headless Electron baseline repair

Base: `e7167dee0d1b437cc1cd183308b610db891d124e`. This branch is separate from PR #19 and does not change its manual-trigger patch.

The host’s default Xvfb screen was 640×480, shrinking requested 1400×1000 windows. The headless harness now supplies a 3200×2400, 24-bit screen, allowing the requested window at DPR1 and DPR2. Existing display sessions keep their own invocation.

The application-link test now uses the existing trusted embedder gesture helper, including for third-party rejection, so dropped input cannot satisfy a negative assertion. The helper targets the selected Stage page. The canvas regression observes real Stage motion until settlement, verifies its native input click, and sends native guest character events afterward. It maps CSS sample coordinates to decoded screenshot dimensions: this Electron runtime returns a 2800×1942 image for a 1400×971 CSS viewport at DPR2 despite the CSS-scale option. Fixture-defined RGB, state, identity, appearance, activation, and navigation assertions remain unchanged.

## Checks before this commit

- `npm test -- local --file test/repo/electron-e2e-env.test.ts`: expected red before the invocation fix, then 9 passed.
- `npm test -- local --file packages/desktop/test/e2e/artifact-document-canvas.test.ts --retries 0`: 2 passed.
- `npm test -- local --surface e2e:desktop --retries 0`: 76 passed, 26 existing opt-in skips; zero recovered flakes, process leaks, or infrastructure failures.

The controller retains original failures, temporary diagnostics, normalized runner records, and raw DPR1/DPR2 screenshots outside this checkout. Diagnostic source, fallbacks, and capture barriers were removed. No product behavior, test expectations, workflow permissions, retries, or skips changed.

Independent spec, proof, and whole implementation review converged with gpt-6-astra at xhigh. Human spec acceptance and committed-tree full verification remain separate gates; the checks above do not establish merge readiness. This working record remains with the unfinished contribution.
