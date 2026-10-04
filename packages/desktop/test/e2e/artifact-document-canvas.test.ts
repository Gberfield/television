import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Artifact } from "@telepath-computer/television-artifact";
import { TelevisionClient } from "@telepath-computer/television-shared";
import { startConnectTestServer } from "./connect-server.ts";
import { launchDesktop } from "./helpers.ts";

async function pixel(app: ElectronApplication, page: Page, x: number, y: number): Promise<number[]> {
  const image = (await page.screenshot({ scale: "css" })).toString("base64");
  return app.evaluate(({ nativeImage }, { image, x, y }) => {
    const bitmap = nativeImage.createFromBuffer(Buffer.from(image, "base64"))
      .crop({ x, y, width: 1, height: 1 }).toBitmap();
    return [bitmap[2], bitmap[1], bitmap[0]];
  }, { image, x, y });
}

// proofs/ui/app/artifact-frame/index.md#^af-ui-ac-document-canvas
for (const dpr of [1, 2]) test(`native document canvas preserves default and authored paint across appearances at DPR${dpr}`, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tv-document-canvas-"));
  let server: Awaited<ReturnType<typeof startConnectTestServer>> | undefined;
  const fixtures = [
    { id: "default", css: "", color: "rgb(0, 0, 0)", paint: [255, 255, 255] },
    { id: "authored", css: "html { background: rgb(32, 36, 42); color: rgb(240, 242, 244); }", color: "rgb(240, 242, 244)", paint: [32, 36, 42] },
    { id: "dark-canvas", css: ":root { color-scheme: dark; }", color: "rgb(255, 255, 255)", paint: null },
  ];
  let app: ElectronApplication | undefined;
  let userDataDir: string | undefined;
  try {
    server = await startConnectTestServer();
    const client = new TelevisionClient(server.serverURL, { token: server.token });
    const { channel } = await client.channels.create({ name: "Native canvas fixtures" });
    const artifacts: Artifact[] = [];
    for (const fixture of fixtures) {
      const file = path.join(dir, fixture.id + ".html");
      writeFileSync(file, `<!doctype html><html><head><style>${fixture.css}</style></head>
        <body><h1>Independent document</h1><input aria-label="Draft">
        <script>document.documentElement.dataset.loadId=crypto.randomUUID();</script></body></html>`);
      artifacts.push((await client.artifacts.create({ channelID: channel.id, kind: "path", path: file, title: fixture.id })).artifact);
    }
    await client.display.patch({ appearanceMode: "dark", focusedChannelId: channel.id });
    const launched = await launchDesktop({ connectTo: server, args: [`--force-device-scale-factor=${dpr}`], env: { TV_TEST_DESKTOP_APP_VERSION: undefined } });
    app = launched.app;
    userDataDir = launched.userDataDir;
    const page = launched.page;
    await expect(page.locator('#app[data-app-state="connected"]')).toBeVisible();
    const evaluateGuest = (id: number, expression: string) => app!.evaluate(
      ({ webContents }, { id, expression }) => webContents.fromId(id)!.executeJavaScript(expression), { id, expression });
    for (const [index, fixture] of fixtures.entries()) {
      await client.display.focus({ artifactID: artifacts[index].id });
      await expect(page.locator(".page[selected]")).toHaveAttribute("data-page-key", artifacts[index].id);
      const guestID = async () => app!.evaluate(({ webContents }, id) => webContents.getAllWebContents()
        .find(contents => contents.getType() === "webview" && !contents.isLoadingMainFrame() && contents.getURL().includes(`/artifact/${id}/`))?.id, artifacts[index].id);
      await expect.poll(guestID).toBeTruthy();
      const id = (await guestID())!;
      await expect.poll(() => evaluateGuest(id, "document.readyState")).toBe("complete");
      const rect = await evaluateGuest(id, '(() => { const r=document.querySelector("input").getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()');
      await app.evaluate(({ webContents }, { id, rect }) => {
        const guest = webContents.fromId(id)!;
        guest.focus();
        const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
        guest.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
        guest.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 });
        for (const character of "State retained") guest.sendInputEvent({ type: "char", keyCode: character });
      }, { id, rect });
      await expect.poll(() => evaluateGuest(id, 'document.querySelector("input").value')).toBe("State retained");
      const loadID = await evaluateGuest(id, "document.documentElement.dataset.loadId");
      expect(loadID).toBeTruthy();
      for (const appearance of ["dark", "light"] as const) {
        await client.display.patch({ appearanceMode: appearance });
        await expect.poll(() => app!.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe(appearance);
        await expect.poll(() => evaluateGuest(id, 'matchMedia("(prefers-color-scheme: dark)").matches')).toBe(appearance === "dark");
        expect(await guestID()).toBe(id);
        expect(await evaluateGuest(id, "document.documentElement.dataset.loadId")).toBe(loadID);
        expect(await evaluateGuest(id, 'document.querySelector("input").value')).toBe("State retained");
        expect(await evaluateGuest(id, 'getComputedStyle(document.querySelector("h1")).color')).toBe(fixture.color);
        const sample = async () => {
          // Server focus initiates stage motion. Read current geometry on every
          // observation rather than retaining an offscreen transition position.
          const box = await page.locator(".page[selected] webview").boundingBox();
          if (!box) throw new Error("Missing selected webview geometry");
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          const x = Math.round(box.x + box.width - 40), y = Math.round(box.y + 180);
          if (x < 0 || x >= viewport.width || y < 0 || y >= viewport.height) return [];
          return pixel(app!, page, x, y);
        };
        if (fixture.paint) await expect.poll(sample, { message: `${fixture.id}/${appearance}` }).toEqual(fixture.paint);
        else await expect.poll(async () => { const paint = await sample(); return paint.length === 3 ? Math.max(...paint) : 255; }, { message: `${fixture.id}/${appearance}` }).toBeLessThan(64);
      }
    }
  } finally {
    await app?.close().catch(() => {});
    await server?.dispose();
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
