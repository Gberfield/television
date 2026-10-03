import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { build } from "esbuild";
import os from "node:os";
import path from "node:path";
import { TelevisionClient } from "@telepath-computer/television-shared";
import { startConnectTestServer } from "./connect-server.ts";
import { disconnectFromServerMenu } from "./helpers.ts";
import { DESKTOP_UPDATE_DOWNLOADED_CHANNEL, RESTART_TO_INSTALL_UPDATE_CHANNEL } from "../../src/desktop-update.ts";

const packageDir = process.env.TV_LINUX_PACKAGE_DIR;
const packageLauncher = process.env.TV_LINUX_PACKAGE_LAUNCHER ?? "television-launcher";
const evidenceDir = process.env.TV_LINUX_EVIDENCE_DIR;
const requireSandbox = process.env.TV_LINUX_REQUIRE_SANDBOX === "1";
test.skip(process.platform !== "linux" || !packageDir, "Requires the actual built Linux package");

test("packaged Linux client authenticates, renders artifacts, applies native appearance and retains its default profile", async () => {
  const backend = process.env.WAYLAND_DISPLAY ? "wayland" : "x11";
  const temporary = mkdtempSync(path.join(os.tmpdir(), "tv-packaged-"));
  const config = path.join(temporary, "config"); mkdirSync(config);
  const server = await startConnectTestServer({ bundledViews: true });
  const website = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><title>Independent website fixture</title><h1>Independent website fixture</h1><p>This page is served by a separate HTTP server inside a real Electron webview.</p>');
  });
  await new Promise<void>(resolve => website.listen(0, "127.0.0.1", resolve));
  const address = website.address(); if (!address || typeof address === "string") throw new Error("Website did not bind");
  const client = new TelevisionClient(server.serverURL, { token: server.token });
  const { channel } = await client.channels.create({ name: "Linux parity lab" });
  const htmlPath = path.join(temporary, "overview.html");
  writeFileSync(htmlPath, '<!doctype html><html><head><title>Linux build overview</title><style>body{font:18px system-ui;background:#eef4f6;color:#162c35;padding:40px}h1{font-size:40px}section{padding:24px;background:white;border-radius:16px}strong{color:#1b806c}</style></head><body><h1>Television on Linux</h1><section><strong>Actual packaged Electron client</strong><p>Channels, artifacts and external webviews use the shared Mac implementation.</p><p>Synthetic lab content · Omarchy / Wayland target</p></section></body></html>');
  const markdownPath = path.join(temporary, "notes.md"); writeFileSync(markdownPath, "# Linux acceptance notes\n\nThis is synthetic lab content rendered in the real Markdown editor.\n");
  const overview = await client.artifacts.create({ channelID: channel.id, kind: "path", title: "Linux build overview", path: htmlPath });
  const notes = await client.artifacts.create({ channelID: channel.id, kind: "path", title: "Linux acceptance notes", path: markdownPath });
  const external = await client.artifacts.create({ channelID: channel.id, kind: "url", title: "Independent website fixture", url: `http://127.0.0.1:${address.port}/` });
  await client.display.patch({ focusedChannelId: channel.id });
  const env = { ...process.env, XDG_CONFIG_HOME: config, DO_NOT_TRACK: "1" } as Record<string, string>;
  delete env.TV_TEST_MODE;
  if (requireSandbox) delete env.ELECTRON_DISABLE_SANDBOX;
  // The generic development/cloud harness may require a test-only sandbox
  // opt-out. Strict host acceptance omits it; distribution never supplies it.
  // Use the distribution entrypoint so backend selection occurs before
  // Playwright's early app.whenReady() call, exactly as on a user's desktop.
  const args: string[] = [];
  if (!requireSandbox && process.env.ELECTRON_DISABLE_SANDBOX === "1") args.push("--no-sandbox");
  const launch = () => electron.launch({ executablePath: path.join(packageDir!, packageLauncher), args, env, timeout: 20_000 });
  let app!: Awaited<ReturnType<typeof launch>>;
  try {
    app = await launch();
    let page = await app.firstWindow();
    await expect(page.locator(".setup-screen")).toBeVisible();
    const profile = await app.evaluate(({ app }) => app.getPath("userData"));
    expect(profile).toBe(path.join(config, "Television"));
    const native = await app.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged, name: app.getName(), version: app.getVersion(),
      ozone: app.commandLine.getSwitchValue("ozone-platform"), sandboxDisabled: app.commandLine.hasSwitch("no-sandbox"),
      title: BrowserWindow.getAllWindows()[0].getTitle(), maximizable: BrowserWindow.getAllWindows()[0].isMaximizable(),
      visible: BrowserWindow.getAllWindows()[0].isVisible(),
      rendererPID: BrowserWindow.getAllWindows()[0].webContents.getOSProcessId(),
      rendererSandbox: (BrowserWindow.getAllWindows()[0].webContents as Electron.WebContents & {
        getLastWebPreferences(): { sandbox?: boolean };
      }).getLastWebPreferences().sandbox,
    }));
    expect(native).toMatchObject({ packaged: true, name: "Television", version: "1.4.23", ozone: backend, maximizable: true, visible: true });
    let rendererSandboxStatus: { seccomp: string; noNewPrivileges: string } | undefined;
    if (requireSandbox) {
      expect(native.sandboxDisabled, "Host acceptance must retain the production sandbox").toBe(false);
      expect(native.rendererSandbox).toBe(true);
      const status = readFileSync(`/proc/${native.rendererPID}/status`, "utf8");
      rendererSandboxStatus = {
        seccomp: /^Seccomp:\s+(\d+)$/m.exec(status)?.[1] ?? "missing",
        noNewPrivileges: /^NoNewPrivs:\s+(\d+)$/m.exec(status)?.[1] ?? "missing",
      };
      expect(rendererSandboxStatus).toEqual({ seccomp: "2", noNewPrivileges: "1" });
    }
    await page.getByRole("textbox", { name: "Link from your agent" }).fill(`${server.serverURL}/?token=invalid-fixture-token`);
    await page.getByRole("textbox", { name: "Link from your agent" }).press("Enter");
    await expect(page.locator(".setup-screen")).toHaveAttribute("data-state", "error");
    await page.getByRole("textbox", { name: "Link from your agent" }).fill(`${server.serverURL}/?token=${server.token}`);
    await page.getByRole("textbox", { name: "Link from your agent" }).press("Enter");
    await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
    expect(new URL(page.url()).searchParams.has("token")).toBe(false);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--traffic-light-x-reserve").trim())).toBe("0px");
    const guestText = () => app.evaluate(async ({ webContents }) => Promise.all(webContents.getAllWebContents()
      .filter(contents => contents.getType() === "webview")
      .map(contents => contents.executeJavaScript("document.body.innerText").catch(() => ""))));
    await client.display.focus({ artifactID: overview.artifact.id });
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Actual packaged Electron client")]));
    if (evidenceDir) { mkdirSync(evidenceDir, { recursive: true }); await page.screenshot({ path: path.join(evidenceDir, `linux-${backend}-overview.png`) }); }
    await client.display.focus({ artifactID: notes.artifact.id });
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Linux acceptance notes")]));
    await client.display.focus({ artifactID: external.artifact.id });
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Independent website fixture")]));
    for (const mode of ["dark", "light"] as const) {
      await page.evaluate(mode => (globalThis as typeof globalThis & { __televisionNativeBridge: { setAppearanceMode(mode: string): void } }).__televisionNativeBridge.setAppearanceMode(mode), mode);
      await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe(mode);
    }
    expect(JSON.parse(readFileSync(path.join(profile, "connection.json"), "utf8"))).toEqual({ serverURL: server.serverURL, token: server.token });
    await app.close();
    app = await launch(); page = await app.firstWindow();
    await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
    const disconnect = await app.evaluate(({ Menu }) => {
      const stack = [...(Menu.getApplicationMenu()?.items ?? [])];
      while (stack.length) {
        const item = stack.pop()!;
        if (item.label === "Disconnect from Server") return { enabled: item.enabled, accelerator: item.accelerator };
        if (item.submenu) stack.push(...item.submenu.items);
      }
      return null;
    });
    expect(disconnect).toEqual({ enabled: true, accelerator: "CmdOrCtrl+," });
    await disconnectFromServerMenu(app);
    await expect(page.locator(".setup-screen")).toBeVisible();
    expect(existsSync(path.join(profile, "connection.json"))).toBe(false);
    if (evidenceDir) {
      await page.screenshot({ path: path.join(evidenceDir, `linux-${backend}-setup.png`) });
      writeFileSync(path.join(evidenceDir, `linux-${backend}-acceptance.json`), JSON.stringify({
        backend, packageLauncher, native, defaultProfileVerified: true, tokenRejection: true, authenticatedConnection: true,
        htmlArtifact: true, markdownArtifact: true, independentURLWebview: true, nativeAppearanceIPC: true,
        savedConnectionRelaunch: true, nativeDisconnectMenu: true, disconnectAcceleratorRegistered: true, syntheticContent: true,
        sandboxEnabledHostAcceptance: requireSandbox && !native.sandboxDisabled && native.rendererSandbox === true,
        rendererSandboxStatus,
      }, null, 2) + "\n");
    }
  } finally {
    await app?.close().catch(() => {});
    await server.dispose(); await new Promise<void>(resolve => website.close(() => resolve()));
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("packaged Linux preload translates upstream Mac gate markup and preserves Lit update/restart IPC", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "tv-legacy-gate-"));
  const script = path.join(temporary, "gate.js");
  await build({
    absWorkingDir: path.resolve(import.meta.dirname, "../../../.."),
    stdin: { contents: `
      import { render, html } from "lit-html";
      import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
      const host = document.getElementById("fixture");
      const paint = downloaded => render(html\`<div class="desktop-upgrade-gate">
        <div class="upgrade-gate-body">\${unsafeHTML(downloaded
          ? '<h1>Desktop app update required</h1><p>The new version has already downloaded.</p>'
          : '<h1>Desktop app update required</h1><p>Update <a href="https://dl.todesktop.com/260923p52umxx/mac/dmg/arm64">Television for Mac</a>.</p>')}</div>
        \${downloaded ? html\`<button @click=\${() => window.__televisionNativeBridge.restartToInstallUpdate()}>Restart to update</button>\` : null}
      </div>\`, host);
      paint(false);
      window.__televisionNativeBridge.onDesktopUpdateDownloaded(() => paint(true));
      window.reconnectFixture = () => paint(false);
    `, resolveDir: path.resolve(import.meta.dirname, "../../../.."), loader: "js" },
    bundle: true, format: "iife", platform: "browser", outfile: script,
  });
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/gate.js" ? "text/javascript" : "text/html");
    response.end(request.url === "/gate.js" ? readFileSync(script) : '<!doctype html><title>Known upstream gate markup fixture</title><main id="fixture"></main><script src="/gate.js"></script>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Gate fixture did not bind");
  const args = ["--test-fixture", `http://127.0.0.1:${address.port}/`];
  if (!requireSandbox && process.env.ELECTRON_DISABLE_SANDBOX === "1") args.push("--no-sandbox");
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(temporary, "config"), TV_TEST_MODE: "true" } as Record<string, string>;
  if (requireSandbox) delete env.ELECTRON_DISABLE_SANDBOX;
  let app!: Awaited<ReturnType<typeof electron.launch>>;
  try {
    app = await electron.launch({ executablePath: path.join(packageDir!, packageLauncher), args, env });
    const page = await app.firstWindow();
    await expect(page.locator(".upgrade-gate-body")).toContainText("Linux");
    await expect(page.locator('a[href*="/mac/"]')).toHaveCount(0);
    await app.evaluate(({ ipcMain }, channel) => {
      const state = globalThis as typeof globalThis & { legacyGateRestartCount: number };
      state.legacyGateRestartCount = 0;
      ipcMain.on(channel, () => { state.legacyGateRestartCount++; });
    }, RESTART_TO_INSTALL_UPDATE_CHANNEL);
    await app.evaluate(({ BrowserWindow }, channel) => {
      BrowserWindow.getAllWindows()[0].webContents.send(channel, "1.4.24");
    }, DESKTOP_UPDATE_DOWNLOADED_CHANNEL);
    await expect(page.locator(".upgrade-gate-body")).toContainText("already downloaded");
    await page.getByRole("button", { name: "Restart to update" }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { legacyGateRestartCount: number }).legacyGateRestartCount)).toBe(1);
    await page.evaluate(() => (window as typeof window & { reconnectFixture(): void }).reconnectFixture());
    await expect(page.locator(".upgrade-gate-body")).toContainText("Linux");
  } finally {
    await app?.close(); await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(temporary, { recursive: true, force: true });
  }
});
