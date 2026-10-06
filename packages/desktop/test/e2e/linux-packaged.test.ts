import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import type { Duplex } from "node:stream";
import { createServer } from "node:http";
import { build } from "esbuild";
import os from "node:os";
import path from "node:path";
import { TelevisionClient } from "@telepath-computer/television-shared";
import { startConnectTestServer } from "./connect-server.ts";
import {observeHyprlandWindow} from "./linux-hyprland-observer.ts";
import type {WindowOwner} from "../../src/hyprland-visibility.ts";
import {randomUUID} from "node:crypto";
import { disconnectFromServerMenu } from "./helpers.ts";
import { DESKTOP_UPDATE_DOWNLOADED_CHANNEL, RESTART_TO_INSTALL_UPDATE_CHANNEL } from "../../src/desktop-update.ts";

const packageDir = process.env.TV_LINUX_PACKAGE_DIR;
const packageLauncher = process.env.TV_LINUX_PACKAGE_LAUNCHER ?? "television-launcher";
const evidenceDir = process.env.TV_LINUX_EVIDENCE_DIR;
const requireWindowManager = process.env.TV_LINUX_REQUIRE_WINDOW_MANAGER === "1";
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
    let windowMenuAcceptance: { normal: Electron.Rectangle; maximized: Electron.Rectangle; restored: Electron.Rectangle } | undefined;
    if (requireWindowManager) {
      const savedConnection = readFileSync(path.join(profile, "connection.json"));
      const windowState = () => app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return { maximized: window.isMaximized(), bounds: window.getBounds() };
      });
      // Activates the installed real Menu callback; physical menu selection is
      // forfeited to host evidence (proofs/product/linux-desktop.md).
      const activateToggle = () => app.evaluate(({ BrowserWindow, Menu }) => {
        const menu = Menu.getApplicationMenu()?.items.find(item => item.label === "Window")?.submenu;
        const item = menu?.items.find(item => item.label === "Maximize / Restore");
        if (!item) throw new Error("Missing Linux Maximize / Restore menu item");
        item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
      });
      await client.display.focus({ artifactID: overview.artifact.id });
      await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Actual packaged Electron client")]));
      const normal = await windowState();
      expect(normal.maximized).toBe(false);
      if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `linux-${backend}-menu-before.png`) });
      await activateToggle();
      await expect.poll(windowState).toMatchObject({ maximized: true });
      const maximized = await windowState();
      await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
      expect(readFileSync(path.join(profile, "connection.json"))).toEqual(savedConnection);
      if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `linux-${backend}-menu-maximized.png`) });
      await activateToggle();
      await expect.poll(windowState).toEqual(normal);
      await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
      expect(readFileSync(path.join(profile, "connection.json"))).toEqual(savedConnection);
      if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `linux-${backend}-menu-restored.png`) });
      windowMenuAcceptance = { normal: normal.bounds, maximized: maximized.bounds, restored: (await windowState()).bounds };
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
        rendererSandboxStatus, windowMenuAcceptance,
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

// proofs/product/linux-desktop.md#^linux-hyprland-hide-acceptance
// proofs/arch/desktop/linux-distribution.md#^linux-hyprland-profile-acceptance
// Real entrypoint/profile lock, server, document and generated control in actual private Hyprland.
// Native captures/observations forfeit physical input, installed host backend and scaling.
test("packaged Hyprland Hide restores its live connected window on a second launch", async () => {
  test.skip(process.env.TV_LINUX_HYPRLAND_FIXTURE!=="1"||!process.env.HYPRLAND_INSTANCE_SIGNATURE, "BLOCKED: Hide acceptance requires an owned actual Hyprland observer/session");
  expect(evidenceDir, "BLOCKED: Hide acceptance requires an original compositor capture destination").toBeTruthy();
  const temporary = mkdtempSync(path.join(os.tmpdir(), "tv-hide-"));
  const config = path.join(temporary, "config");
  let server: Awaited<ReturnType<typeof startConnectTestServer>> | undefined;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  let independent: typeof app;
  let secondary: ReturnType<typeof spawn> | undefined;
  let website: ReturnType<typeof createServer> | undefined;
  const waitForExit = async (child: ReturnType<typeof spawn>, timeout: number): Promise<boolean> => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onExit!: () => void;
    const exited = new Promise<boolean>(resolve => { onExit = () => resolve(true); child.once("exit", onExit); });
    try {
      return await Promise.race([exited, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeout); })]);
    } finally { clearTimeout(timer); child.off("exit", onExit); }
  };
  try {
    mkdirSync(config);
    const runningServer = server = await startConnectTestServer({ bundledViews: true });
    const sockets: Duplex[] = [];
    runningServer.server.httpServer.on("upgrade", (request, socket) => {
      if (new URL(request.url!, runningServer.serverURL).pathname === "/events") sockets.push(socket);
    });
    const client = new TelevisionClient(runningServer.serverURL, { token: runningServer.token });
    const { channel } = await client.channels.create({ name: "Hide continuity fixture" });
    const markdown = path.join(temporary, "retained.md");
    writeFileSync(markdown, "# Retained live document\n\nDeclared synthetic Hide/reopen acceptance content.\n");
    const notes=await client.artifacts.create({ channelID: channel.id, kind: "path", title: "Retained live document", path: markdown });
    const html=path.join(temporary,"retained.html");
    writeFileSync(html,'<!doctype html><html><head><style>body{background:#f3f6fc;color:#172033;font:20px system-ui;padding:28px}input{display:block;margin-top:20px;width:95%;font:inherit;padding:12px}</style></head><body><h1>Persistent HTML fixture</h1><p>Declared synthetic unsaved document state.</p><label>Unsaved draft<input aria-label="Unsaved draft" value="Initial draft"></label></body></html>');
    const overview=await client.artifacts.create({channelID:channel.id,kind:"path",title:"Persistent HTML fixture",path:html});
    website=createServer((_request,response)=>{response.setHeader("Content-Type","text/html");response.end('<!doctype html><body style="background:white;color:#172033"><h1>Independent Hide URL fixture</h1><p>Declared independent loopback website.</p></body>');});
    await new Promise<void>(resolve=>website!.listen(0,"127.0.0.1",resolve));
    const address=website.address();if(!address||typeof address==="string")throw new Error("Website failed to bind");
    const external=await client.artifacts.create({channelID:channel.id,kind:"url",title:"Independent Hide URL fixture",url:`http://127.0.0.1:${address.port}/`});
    await client.display.patch({ focusedChannelId: channel.id });
    const env = { ...process.env, XDG_CONFIG_HOME: config, XDG_CURRENT_DESKTOP: "Hyprland", DO_NOT_TRACK: "1" } as Record<string, string>;
    delete env.TV_TEST_MODE;
    if (requireSandbox) delete env.ELECTRON_DISABLE_SANDBOX;
    const args = !requireSandbox && process.env.ELECTRON_DISABLE_SANDBOX === "1" ? ["--no-sandbox"] : [];
    const executablePath = path.join(packageDir!, packageLauncher);
    const primary = app = await electron.launch({ executablePath, args, env, timeout: 20_000 });
    const page = await primary.firstWindow();
    const menuLabel = await primary.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.find(item => item.label === "Window")?.submenu?.items[0].label);
    expect(menuLabel).toBe("Hide");
    await page.getByRole("textbox", { name: "Link from your agent" }).fill(`${runningServer.serverURL}/?token=${runningServer.token}`);
    await page.getByRole("textbox", { name: "Link from your agent" }).press("Enter");
    await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
    const guestText = () => primary.evaluate(async ({ webContents }) => Promise.all(webContents.getAllWebContents()
      .filter(contents => contents.getType() === "webview")
      .map(contents => contents.executeJavaScript("document.body.innerText").catch(() => ""))));
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Declared synthetic Hide/reopen")]));
    await expect.poll(() => sockets.length).toBeGreaterThan(0);
    const originalSockets = [...sockets];
    const profile = path.join(config, "Television");
    const saved = readFileSync(path.join(profile, "connection.json"));
    const state = () => primary.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return { mainPID: process.pid, windowID: window.id, contentsID: window.webContents.id,
        nativeHandle: window.getNativeWindowHandle().toString("hex"),
        count: BrowserWindow.getAllWindows().length, visible: window.isVisible(),
        ozone: app.commandLine.getSwitchValue("ozone-platform"),
        sandboxDisabled: app.commandLine.hasSwitch("no-sandbox"),
        rendererPID: window.webContents.getOSProcessId(),
        sandbox: (window.webContents as Electron.WebContents & { getLastWebPreferences(): { sandbox?: boolean } }).getLastWebPreferences().sandbox };
    });
    const before = await state();
    expect(before.visible).toBe(true);
    let owner:WindowOwner={pid:before.mainPID,applicationID:"computer.telepath.television",
      session:env.HYPRLAND_INSTANCE_SIGNATURE,marker:randomUUID()};
    await expect.poll(async()=> (await observeHyprlandWindow(owner)).status).toBe("owned");
    const origin=await observeHyprlandWindow(owner);if(origin.status!=="owned")throw new Error("Native origin unavailable");owner=origin.owner;
    const observations:Array<{stage:string;observation:Awaited<ReturnType<typeof observeHyprlandWindow>>}>=[];
    const expectMapping=async(visible:boolean,stage:string)=>{
      await expect.poll(async()=>{const observed=await observeHyprlandWindow(owner);
        return observed.status==="owned" ? {visible:observed.visibleOnMonitors.length>0,workspace:visible?observed.workspace:null} : observed;
      },{timeout:10000,intervals:[100,200,400],message:`Original owned window output visibility=${visible} (${stage})`})
        .toEqual({visible,workspace:visible?origin.workspace:null});
      const observation=await observeHyprlandWindow(owner);expect(observation.status).toBe("owned");
      observations.push({stage,observation});
      if(evidenceDir){mkdirSync(evidenceDir,{recursive:true});writeFileSync(path.join(evidenceDir,`hide-${before.ozone}-${stage}-native.json`),JSON.stringify(observation,null,2)+"\n");}
    };
    const capture=(stage:string)=>{
      if(evidenceDir){mkdirSync(evidenceDir,{recursive:true});execFileSync("grim",[path.join(evidenceDir,`hide-${before.ozone}-${stage}-compositor.png`)],{timeout:5000});}
    };
    await expectMapping(true, "before");
    await client.display.focus({artifactID:external.artifact.id});
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Independent Hide URL fixture")]));
    await client.display.focus({artifactID:notes.artifact.id});
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Declared synthetic Hide/reopen")]));
    await client.display.focus({artifactID:overview.artifact.id});
    await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Persistent HTML fixture")]));
    const htmlGuestID=await primary.evaluate(async({webContents})=>{
      for(const guest of webContents.getAllWebContents().filter(w=>w.getType()==="webview"))
        if((await guest.executeJavaScript("document.body.innerText")).includes("Persistent HTML fixture"))return guest.id;
      throw new Error("HTML guest absent");
    });
    await primary.evaluate(({webContents},id)=>webContents.fromId(id)!.executeJavaScript('window.artifactContinuitySentinel="retained-artifact-lifetime"; document.querySelector("input").value="Synthetic unsaved draft"'),htmlGuestID);
    const artifactState=()=>primary.evaluate(({webContents},id)=>webContents.fromId(id)!.executeJavaScript('({sentinel:window.artifactContinuitySentinel,draft:document.querySelector("input").value})'),htmlGuestID);
    // Capture after artifact focus movement settles, so the draft is not clipped mid-transition.
    await expect.poll(()=>page.evaluate(id=>{
      const guest=document.querySelector(`webview[src*="${id}"]`);
      if(!guest)return false;const bounds=guest.getBoundingClientRect();
      return bounds.width>0&&bounds.left>=0&&bounds.right<=innerWidth;
    },overview.artifact.id)).toBe(true);
    await page.evaluate(() => { Object.assign(window, { hideContinuitySentinel: "retained-document-lifetime" }); });
    let navigations = 0;
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
    if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `hide-${before.ozone}-before.png`) });
    const sandboxStatus = (native: typeof before) => {
      if (!requireSandbox) return undefined;
      expect(native.sandboxDisabled).toBe(false); expect(native.sandbox).toBe(true);
      const status = readFileSync(`/proc/${native.rendererPID}/status`, "utf8");
      const actual = { seccomp: /^Seccomp:\s+(\d+)$/m.exec(status)?.[1], noNewPrivileges: /^NoNewPrivs:\s+(\d+)$/m.exec(status)?.[1] };
      expect(actual).toEqual({ seccomp: "2", noNewPrivileges: "1" }); return actual;
    };
    capture("before");
    const sandboxBefore = sandboxStatus(before);
    const cycles: Array<{ cycle: number; hidden: typeof before; after: typeof before; sandboxAfter: ReturnType<typeof sandboxStatus> }> = [];
    for (let cycle = 1; cycle <= 5; cycle++) {
      await primary.evaluate(({ BrowserWindow, Menu }) => {
        const item = Menu.getApplicationMenu()!.items.find(item => item.label === "Window")!.submenu!.items.find(item => item.label === "Hide")!;
        item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
      });
      // Compositor Hide keeps Electron mapped/visible and its document alive.
      await expect.poll(state).toEqual(before);
      await expectMapping(false, `cycle-${cycle}-hidden`);
      const hidden = await state();
      capture(`cycle-${cycle}-hidden`);
      const update = `Update received while hidden ${cycle}`;
      await client.channels.update({ channelID: channel.id, name: update });
      // Actual entrypoint and profile lock; no injected instance event.
      const child = secondary = spawn(executablePath, args, { env, stdio: "ignore" });
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
        child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal }));
      });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([exited, new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => reject(new Error("Secondary entrypoint did not exit within 15 seconds")), 15_000);
        })]);
        expect(result).toEqual({ code: 0, signal: null });
      } finally { clearTimeout(deadline); }
      await expect.poll(state).toEqual(before);
      await expectMapping(true, `cycle-${cycle}-restored`);
      await page.waitForFunction(() => document.visibilityState === "visible", undefined, { polling: 100, timeout: 10_000 });
      await page.evaluate(() => {
        Object.assign(window, { hideRepaintObserved: false });
        requestAnimationFrame(() => requestAnimationFrame(() => { Object.assign(window, { hideRepaintObserved: true }); }));
      });
      await page.waitForFunction(() => (window as typeof window & { hideRepaintObserved?: boolean }).hideRepaintObserved === true,
        undefined, { polling: 100, timeout: 10_000 });
      // Final continuity is checked after independent compositor placement and repaint.
      expect(await page.evaluate(() => (window as typeof window & { hideContinuitySentinel?: string }).hideContinuitySentinel)).toBe("retained-document-lifetime");
      expect(navigations).toBe(0);
      await expect(page.getByText(update, { exact: true }).first()).toBeVisible();
      await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
      await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Declared synthetic Hide/reopen")]));
      expect(readFileSync(path.join(profile, "connection.json"))).toEqual(saved);
      expect(sockets).toEqual(originalSockets);
      expect(originalSockets.every(socket => !socket.destroyed)).toBe(true);
      const after = await state(); expect(after).toEqual(before);
      expect(await artifactState()).toEqual({sentinel:"retained-artifact-lifetime",draft:"Synthetic unsaved draft"});
      capture(`cycle-${cycle}-restored`);
      cycles.push({ cycle, hidden, after, sandboxAfter: sandboxStatus(after) });
    }
    if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `hide-${before.ozone}-restored.png`) });
    independent = await electron.launch({ executablePath, args, env: { ...env, XDG_CONFIG_HOME: path.join(temporary, "independent") }, timeout: 20_000 });
    await expect((await independent.firstWindow()).locator(".setup-screen")).toBeVisible();
    const otherPID = await independent.evaluate(() => process.pid);
    expect(otherPID).not.toBe(before.mainPID); expect(await state()).toEqual(before);
    if (evidenceDir) writeFileSync(path.join(evidenceDir, `hide-${before.ozone}-acceptance.json`), JSON.stringify({
      packageLauncher, desktopIdentityFixture: "Hyprland", before, cycles,
      compositorObserver: "Actual Hyprland clients/workspaces/all monitor inventories, exact PID/class/address",
      owner,origin,observations,unsavedHTMLDraftRetained:true,
      secondaryExited: true, retainedDocumentSentinel: true, navigations,
      savedConnectionIdentical: true, liveEventSocketsRetained: true,
      updateWhileHiddenReceived: true, independentProfilePID: otherPID,
      sandboxBefore, physicalHyprlandAccepted: false,
    }, null, 2) + "\n");
  } finally {
    try {
      if (secondary && secondary.exitCode === null && secondary.signalCode === null && secondary.pid !== undefined) {
        secondary.kill("SIGTERM");
        if (!await waitForExit(secondary, 5_000)) {
          secondary.kill("SIGKILL");
          expect(await waitForExit(secondary, 5_000), "Owned secondary terminated before profile removal").toBe(true);
        }
      }
    } finally {
      await independent?.close().catch(() => {});
      await app?.close().catch(() => {});
      try { await server?.dispose(); } finally {
        try {if(website)await new Promise<void>(resolve=>website!.close(()=>resolve()));}
        finally {rmSync(temporary, { recursive: true, force: true });}
      }
    }
  }
});
