*How the promises in Electron e2e harness are proven.*

# Electron e2e harness — proof

Proves [specs/arch/desktop/e2e-harness.md](../../../specs/arch/desktop/e2e-harness.md).

## Coverage model

Coverage declarations are carried inside the migrated assertion blocks below.

## Assertions

### Test assertions

Shapes follow [testing-policy.md](../../../specs/arch/testing-policy.md).

- **Contract — environment planning** (temporary Electron package/runtime filesystem fixtures; platform, display environment, command lookup, and file ownership/mode supplied as inputs — declared mocks that forfeit real host detection to the [runtime-setup seam](#^desktop-t-e2e-runtime-handoff)): covers every package/runtime classification in the [shared plan](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-environment-plan) and every host decision in the [Linux plan](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-linux-plan). The invocation contract additionally proves that the automatic headless path supplies an explicit 3200×2400, 24-bit screen, while an existing-display plan invokes Playwright directly. — *(covered by tests: all cases in `test/repo/electron-e2e-env.test.ts`)*. ^desktop-t-e2e-environment
- **Seam — runtime setup and executable handoff** (the real installed Electron package and installer, real filesystem, real host detection, and real Playwright Electron transport; no mocks): crosses the complete [global-setup sequence](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-global-setup) and [validated executable handoff](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-executable-handoff). — *(covered by test: `packages/desktop/test/e2e/runtime-setup.test.ts` “global setup hands Playwright the validated Electron executable”)*. ^desktop-t-e2e-runtime-handoff
- **Seam — launch, fixture, and teardown** (the real Playwright Electron transport, real desktop main process and BrowserWindow, and an authored static HTML fixture; no mocks): crosses the [launch](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-launch-contract), [timeout](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-launch-timeout), and [fixture](../../../specs/arch/desktop/e2e-harness.md#^desktop-e2e-fixture-hook) contracts; the fixture title and heading render, and application close leaves no owned Electron process — *(covered by inherited test: `packages/desktop/test/e2e/smoke.test.ts` “electron app launches, loads the fixture, and tears down”)*. ^desktop-t-e2e-smoke
- **Seam — default application-data identity.** The real-Electron assertion and its evidence are owned by [the desktop root](./index.md#^desktop-t-user-data-order); this harness supplies the isolated host directory without overriding Electron's default application-name-derived path.

- **Seam — usable headless window geometry** (real Xvfb, installed Electron runtime, BrowserWindow, webview guest and authored documents; no display or composition mocks): the automatic headless environment accommodates the requested desktop window without Xvfb’s distribution default shrinking it. Both cases in `packages/desktop/test/e2e/isolated-webview-layout.test.ts` retain their greater-than-900-pixel host-height assertions, and the DPR1/DPR2 cases in `packages/desktop/test/e2e/artifact-document-canvas.test.ts` retain their native composition and input assertions. The latter cases remain owned by [document-canvas acceptance](../../ui/app/artifact-frame/index.md#^af-ui-ac-document-canvas); this harness crossing claims virtual display capacity, not physical GPU/scaling acceptance. ^desktop-t-e2e-headless-geometry
