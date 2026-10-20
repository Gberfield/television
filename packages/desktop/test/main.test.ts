import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {CompositorObservation,VisibilityIntent,WindowOwner} from "../src/hyprland-visibility.ts";
import {
  DESKTOP_UPDATE_DOWNLOADED_CHANNEL,
  GET_DESKTOP_UPDATE_CHANNEL,
  RESTART_TO_INSTALL_UPDATE_CHANNEL,
} from "../src/desktop-update.ts";
import { SET_APPEARANCE_MODE_CHANNEL } from "../src/appearance-mode.ts";
import { OPEN_APPLICATION_LINK_CHANNEL } from "../src/application-link.ts";
import { COMPLETE_CONNECT_CHANNEL, DISCONNECT_CHANNEL, GET_CONNECT_STATE_CHANNEL } from "../src/connect-screen.ts";

type BrowserWindowOptions = {
  title?: string;
  icon?: string;
  minWidth?: number;
  minHeight?: number;
  show?: boolean;
  titleBarStyle?: string;
  trafficLightPosition?: { x: number; y: number };
  webPreferences?: {
    contextIsolation?: boolean;
    preload?: string;
  };
};

type WindowOpenHandler = (details: { url: string }) => { action: "allow" | "deny" };
type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;
type IpcListener = (event: unknown, ...args: unknown[]) => void;
type PermissionRequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
  details: unknown,
) => void;
type PermissionCheckHandler = (webContents: unknown, permission: string, requestingOrigin: string, details: unknown) => boolean;
type HeadersListener = (
  details: { url: string; responseHeaders?: Record<string, string[]> },
  callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
) => void;
type BeforeInputEventHandler = (
  event: { preventDefault(): void },
  input: {
    type: string;
    key: string;
    isAutoRepeat: boolean;
    isComposing: boolean;
    shift: boolean;
    control: boolean;
    alt: boolean;
    meta: boolean;
  },
) => void;

const mockState = vi.hoisted(() => {
  const appHandlers = new Map<string, (...args: unknown[]) => void>();
  const ipcHandlers = new Map<string, IpcHandler>();
  const ipcListeners = new Map<string, IpcListener>();
  const windowHandlers = new Map<string, () => void>();
  let autoEmitReadyToShowOnLoad = false;
  let loadFileBehavior: ((window: MockBrowserWindow) => Promise<void>) | undefined;

  class MockBrowserWindow {
    private onceHandlers = new Map<string, () => void>();
    static instances: MockBrowserWindow[] = [];
    options: BrowserWindowOptions;
    loadURL = vi.fn(async (_url: string) => {
      if (autoEmitReadyToShowOnLoad) this.emitOnce("ready-to-show");
    });
    loadFile = vi.fn(async (_file: string) => {
      if (loadFileBehavior) return loadFileBehavior(this);
      if (autoEmitReadyToShowOnLoad) this.emitOnce("ready-to-show");
    });
    show = vi.fn();
    hide = vi.fn();
    focus = vi.fn();
    isMinimized = vi.fn(() => false);
    isDestroyed = vi.fn(() => false);
    restore = vi.fn();
    webContents = { on: vi.fn(), send: vi.fn(), stop: vi.fn(), getType: () => "window", getURL: vi.fn(() => "") };

    constructor(options: BrowserWindowOptions) {
      this.options = options;
      MockBrowserWindow.instances.push(this);
    }

    once(event: string, handler: () => void): void {
      this.onceHandlers.set(event, handler);
    }

    private handlers = new Map<string, () => void>();
    on(event: string, handler: () => void): void { this.handlers.set(event, handler); windowHandlers.set(event, handler); }
    emit(event: string): void { this.handlers.get(event)?.(); }

    emitOnce(event: string): void {
      const handler = this.onceHandlers.get(event);
      if (handler) handler();
    }

    static getAllWindows(): MockBrowserWindow[] {
      return MockBrowserWindow.instances;
    }
  }

  // Every app call and the update runtime's start, in the order they happen.
  const callOrder: string[] = [];
  const recorded = <Args extends unknown[], Result>(name: string, implementation: (...args: Args) => Result) =>
    vi.fn((...args: Args) => {
      callOrder.push(name);
      return implementation(...args);
    });
  const app = {
    name: "Television",
    setName: recorded("app.setName", (_name: string) => {}),
    requestSingleInstanceLock: recorded("app.requestSingleInstanceLock", () => true),
    whenReady: recorded("app.whenReady", async () => {}),
    getPath: recorded("app.getPath", (_name: string) => "/tmp/television-test-userdata"),
    getVersion: recorded("app.getVersion", () => "0.1.170"),
    setAboutPanelOptions: recorded("app.setAboutPanelOptions", (_options: unknown) => {}),
    on: recorded("app.on", (event: string, handler: (...args: unknown[]) => void) => {
      appHandlers.set(event, handler);
    }),
    quit: recorded("app.quit", () => {}),
  };
  const autoUpdaterListeners = new Map<string, (payload: unknown) => void>();
  const runtime = {
    init: recorded("runtime.init", (..._args: unknown[]) => {}),
    autoUpdater: {
      on: vi.fn((event: string, listener: (payload: unknown) => void) => {
        autoUpdaterListeners.set(event, listener);
      }),
      restartAndInstall: vi.fn((..._args: unknown[]) => {}),
    },
  };
  const Menu = {
    buildFromTemplate: vi.fn((template: unknown) => template),
    setApplicationMenu: vi.fn(),
  };
  type TrayItem = { label?: string; enabled?: boolean; role?: string; click?: () => void | Promise<void> };
  class MockTray {
    static instances: MockTray[] = [];
    static failConstruction = false;
    menu: TrayItem[] = [];
    tooltip = "";
    handlers = new Map<string, () => void>();
    destroyed = false;
    readonly icon: string;
    constructor(icon: string) {
      this.icon = icon;
      if (MockTray.failConstruction) throw new Error("Tray unavailable");
      MockTray.instances.push(this);
    }
    setContextMenu(menu: TrayItem[]) { this.menu = menu; }
    setToolTip(value: string) { this.tooltip = value; }
    on(event: string, callback: () => void) { this.handlers.set(event, callback); }
    destroy() { this.destroyed = true; }
  }
  const ipcMain = {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      ipcHandlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, listener: IpcListener) => {
      ipcListeners.set(channel, listener);
    }),
  };
  const nativeTheme = { themeSource: "system" };
  const recordingSession = () => ({
    setPermissionRequestHandler: vi.fn((_handler: PermissionRequestHandler) => {}),
    setPermissionCheckHandler: vi.fn((_handler: PermissionCheckHandler) => {}),
    webRequest: { onHeadersReceived: vi.fn((_filter: unknown, _listener: HeadersListener) => {}) },
  });
  // Declared mock: each partition's session, by name, recording what the main
  // process sets up on it.
  const partitionSessions = new Map<string, ReturnType<typeof recordingSession>>();
  const session = {
    defaultSession: recordingSession(),
    fromPartition: vi.fn((partition: string) => {
      let partitionSession = partitionSessions.get(partition);
      if (!partitionSession) {
        partitionSession = recordingSession();
        partitionSessions.set(partition, partitionSession);
      }
      return partitionSession;
    }),
  };
  const shell = {
    openExternal: vi.fn(async (_url: string) => {}),
  };

  return {
    callOrder,
    runtime,
    autoUpdaterListeners,
    MockBrowserWindow,
    app,
    Menu,
    MockTray,
    ipcMain,
    nativeTheme,
    session,
    shell,
    appHandlers,
    ipcHandlers,
    ipcListeners,
    windowHandlers,
    partitionSessions,
    setAutoEmitReadyToShowOnLoad: (value: boolean) => {
      autoEmitReadyToShowOnLoad = value;
    },
    setLoadFileBehavior: (behavior?: (window: MockBrowserWindow) => Promise<void>) => { loadFileBehavior = behavior; },
  };
});

// Declared mock: records the update runtime's start and forfeits what the
// runtime does to the product's update path (proofs/product/desktop-app.md).
vi.mock("@todesktop/runtime", () => ({ default: mockState.runtime }));

// External compositor/notification boundaries only. App and visibility controller stay real.
// Native mutation and daemon presentation are forfeited to the packaged/physical spine.
const visibilityBoundary=vi.hoisted(() => {
  const entries:Array<{session:string;actions:VisibilityIntent[];disposed:boolean;
    cleanup?:()=>Promise<void>;state?:CompositorObservation;inspect?:(owner:WindowOwner)=>Promise<CompositorObservation>}> = [];
  const notifications:Array<{title:string;body:string}> = [];
  let notificationSupported=true;
  class Notification {
    static isSupported() {return notificationSupported;}
    private options:{title:string;body:string};
    constructor(options:{title:string;body:string}) {this.options=options;}
    show() {notifications.push(this.options);}
  }
  function owned(owner:WindowOwner):Extract<CompositorObservation,{status:"owned"}> {
    return {status:"owned",owner:{...owner,address:"0xabc"},workspace:7,workspaceName:"7",visibleOnMonitors:[0],
      existingWorkspaces:[7,9],normalWorkspaces:[7,9],activeNormalWorkspace:9,supportedWindowState:true,externalRevision:0};
  }
  return {entries,notifications,Notification,owned,setSupported:(value:boolean)=>{notificationSupported=value;},
    create:({session}:{session:string}) => {
      const entry:{session:string;actions:VisibilityIntent[];disposed:boolean;cleanup?:()=>Promise<void>;state?:CompositorObservation;
        inspect?:(owner:WindowOwner)=>Promise<CompositorObservation>}={session,actions:[],disposed:false};entries.push(entry);
      return {inspect:async(owner:WindowOwner)=>entry.inspect ? entry.inspect(owner) : entry.state??owned(owner),
        apply:async(intent:VisibilityIntent)=>{
          entry.actions.push(structuredClone(intent));
          if(entry.disposed)return {acknowledged:false};
          entry.state={...owned(intent.owner),workspace:intent.visible ? intent.originWorkspace! : -99,
            workspaceName:intent.visible ? String(intent.originWorkspace) : intent.holdingWorkspace!,
            visibleOnMonitors:intent.visible ? [0] : []};return {acknowledged:true};
        },watch:()=>()=>{},dispose:()=>{entry.disposed=true;return entry.cleanup?.();}};
    }};
});
vi.mock("../src/hyprland-control.ts",()=>({createHyprlandControl:visibilityBoundary.create}));
vi.mock("electron", () => ({
  app: mockState.app,
  BrowserWindow: mockState.MockBrowserWindow,
  Menu: mockState.Menu,
  Tray: mockState.MockTray,
  ipcMain: mockState.ipcMain,
  nativeTheme: mockState.nativeTheme,
  session: mockState.session,
  shell: mockState.shell,
  Notification: visibilityBoundary.Notification,
}));

const fsState = vi.hoisted(() => {
  const files = new Map<string, string>();
  return {
    files,
    reset: () => files.clear(),
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: string) => fsState.files.has(path),
    readFileSync: (path: string) => {
      const content = fsState.files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    writeFileSync: (path: string, content: string) => {
      fsState.files.set(path, content);
    },
    rmSync: (path: string) => {
      fsState.files.delete(path);
    },
    renameSync: (oldPath: string, newPath: string) => {
      const content = fsState.files.get(oldPath);
      if (content === undefined) throw new Error(`ENOENT: ${oldPath}`);
      fsState.files.set(newPath, content);
      fsState.files.delete(oldPath);
    },
  };
});

describe("Electron main process", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const connectCheckBody = {
    product: "television",
    additiveFutureIdentity: { tolerated: true },
  };

  beforeEach(() => {
    mockState.MockTray.instances.length = 0; mockState.MockTray.failConstruction = false;
    visibilityBoundary.entries.length=0;visibilityBoundary.notifications.length=0;visibilityBoundary.setSupported(true);
    vi.stubEnv("XDG_CURRENT_DESKTOP", "");
    mockState.app.requestSingleInstanceLock.mockReset().mockImplementation(() => {
      mockState.callOrder.push("app.requestSingleInstanceLock");
      return true;
    });
    mockState.app.quit.mockReset().mockImplementation(()=>{mockState.callOrder.push("app.quit");});
    mockState.MockBrowserWindow.instances.length = 0;
    mockState.appHandlers.clear();
    mockState.ipcHandlers.clear();
    mockState.ipcListeners.clear();
    mockState.windowHandlers.clear();
    mockState.partitionSessions.clear();
    mockState.session.fromPartition.mockClear();
    mockState.session.defaultSession.webRequest.onHeadersReceived.mockClear();
    mockState.nativeTheme.themeSource = "dark";
    mockState.setAutoEmitReadyToShowOnLoad(false);
    mockState.setLoadFileBehavior();
    mockState.app.on.mockClear();
    mockState.app.whenReady.mockClear();
    mockState.app.whenReady.mockImplementation(async () => { mockState.callOrder.push("app.whenReady"); });
    mockState.app.getVersion.mockClear();
    mockState.app.setAboutPanelOptions.mockClear();
    mockState.ipcMain.handle.mockClear();
    mockState.ipcMain.on.mockClear();
    mockState.shell.openExternal.mockClear();
    mockState.session.defaultSession.setPermissionRequestHandler.mockClear();
    mockState.session.defaultSession.setPermissionCheckHandler.mockClear();
    mockState.autoUpdaterListeners.clear();
    mockState.runtime.autoUpdater.restartAndInstall.mockClear();
    mockState.Menu.buildFromTemplate.mockClear();
    mockState.Menu.setApplicationMenu.mockClear();
    fsState.reset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(connectCheckBody), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    for(const window of mockState.MockBrowserWindow.instances) window.emit("closed");
    fsState.reset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function loadAppModule() {
    return await import("@telepath-computer/television-desktop");
  }

  // proofs/arch/desktop/linux-distribution.md#^linux-tray-contract
  describe("Linux tray", () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    beforeEach(() => Object.defineProperty(process, "platform", {...platform, value: "linux"}));
    afterEach(() => Object.defineProperty(process, "platform", platform));
    const tray = () => mockState.MockTray.instances[0];
    const item = (label: string) => {
      const found = tray()?.menu.find(entry => entry.label === label);
      expect(found, `exported tray menu item ${label}`).toBeDefined();
      return found!;
    };

    it("exports the Linux tray with setup and application commands", async () => {
      const main = await loadAppModule(); await new main.App().start();
      expect(mockState.MockTray.instances).toHaveLength(1);
      expect(tray().icon).toMatch(/assets[/\\]icon\.png$/);
      expect(tray().tooltip).toBe("Television");
      expect(item("Disconnect from Server").enabled).toBe(false);
      expect(tray().menu.some(i => i.label === "No saved server" && i.enabled === false)).toBe(true);
      expect(tray().menu.some(i => i.role === "about")).toBe(true);
      expect(tray().menu.some(i => i.role === "quit")).toBe(true);
    });

    it.each(["darwin", "win32"])("does not create a Linux tray on %s", async value => {
      Object.defineProperty(process, "platform", {...platform, value});
      const main = await loadAppModule(); await new main.App().start();
      expect(mockState.MockTray.instances).toHaveLength(0);
    });

    it("hides and restores the owned window, restoring minimized state without navigation", async () => {
      const main = await loadAppModule(); await new main.App().start();
      const owned = mockState.MockBrowserWindow.instances[0];
      const unrelated = new mockState.MockBrowserWindow({});
      const loads = [owned.loadFile.mock.calls.length, owned.loadURL.mock.calls.length];
      await item("Hide Television").click!();
      expect(owned.hide).toHaveBeenCalledOnce(); expect(unrelated.hide).not.toHaveBeenCalled();
      owned.isMinimized.mockReturnValue(true);
      await item("Show Television").click!();
      expect(owned.restore).toHaveBeenCalledOnce(); expect(owned.show).toHaveBeenCalledOnce();
      expect(owned.focus).toHaveBeenCalledOnce();
      tray().handlers.get("click")!();
      expect(owned.show).toHaveBeenCalledTimes(2);
      expect([owned.loadFile.mock.calls.length, owned.loadURL.mock.calls.length]).toEqual(loads);
      expect(mockState.app.quit).not.toHaveBeenCalled();
    });

    it("keeps early tray Hide in effect after the native Linux window finishes loading", async () => {
      const main=await loadAppModule(); await new main.App().start();
      const owned=mockState.MockBrowserWindow.instances[0];
      await item("Hide Television").click!(); owned.emitOnce("ready-to-show");
      expect(owned.hide).toHaveBeenCalledOnce(); expect(owned.show).not.toHaveBeenCalled();
      await item("Show Television").click!(); expect(owned.show).toHaveBeenCalledOnce();
    });

    it("routes tray Hide and Show through real Hyprland ownership independently of unrelated focus", async () => {
      vi.stubEnv("XDG_CURRENT_DESKTOP", "Hyprland"); vi.stubEnv("HYPRLAND_INSTANCE_SIGNATURE", "fixture_123_456");
      const main = await loadAppModule(); await new main.App().start();
      const owned = mockState.MockBrowserWindow.instances[0];
      new mockState.MockBrowserWindow({});
      const loads = [owned.loadFile.mock.calls.length, owned.loadURL.mock.calls.length];
      await item("Hide Television").click!();
      await vi.waitFor(() => expect(visibilityBoundary.entries[0].state).toMatchObject({visibleOnMonitors:[]}));
      await item("Show Television").click!();
      await vi.waitFor(() => expect(visibilityBoundary.entries[0].state).toMatchObject({workspace:7,visibleOnMonitors:[0]}));
      expect(visibilityBoundary.entries[0].actions.map(i=>i.visible)).toEqual([false,true]);
      expect(owned.hide).not.toHaveBeenCalled(); expect(owned.show).not.toHaveBeenCalled();
      expect([owned.loadFile.mock.calls.length, owned.loadURL.mock.calls.length]).toEqual(loads);
    });

    it("refreshes credential-free saved-server state and Disconnect clears it and reveals setup", async () => {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify(connectCheckBody), {status:200}));
      fsState.files.set("/tmp/television-test-userdata/connection.json", JSON.stringify({
        serverURL:"http://user:private-password@localhost:41449/path?token=private-query#private-fragment",token:"private-token",
      }));
      const main = await loadAppModule(); await new main.App().start();
      expect(item("Server: http://localhost:41449").enabled).toBe(false);
      expect(item("Disconnect from Server").enabled).toBe(true);
      expect(JSON.stringify(tray().menu)).not.toMatch(/private-|user:/);
      await item("Hide Television").click!();
      await item("Disconnect from Server").click!();
      expect(fsState.files.has("/tmp/television-test-userdata/connection.json")).toBe(false);
      expect(item("Disconnect from Server").enabled).toBe(false);
      expect(item("No saved server").enabled).toBe(false);
      expect(mockState.MockBrowserWindow.instances[0].show).toHaveBeenCalled();
      const connect = mockState.ipcHandlers.get("television:connect")!;
      const result = await connect(fromWindow(),"http://localhost:41450/?token=second-private-token");
      expect(result).toMatchObject({ok:true});
      expect(item("Server: http://localhost:41450").enabled).toBe(false);
      expect(item("Disconnect from Server").enabled).toBe(true);
      expect(JSON.stringify(tray().menu)).not.toContain("second-private-token");
    });

    it("refuses tray actions on a destroyed window and preserves tray through cancelled quit", async () => {
      const main = await loadAppModule(); await new main.App().start();
      const owned = mockState.MockBrowserWindow.instances[0];
      owned.isDestroyed.mockReturnValue(true);
      await item("Hide Television").click!(); await item("Show Television").click!();
      await item("Disconnect from Server").click!();
      expect(owned.hide).not.toHaveBeenCalled(); expect(owned.show).not.toHaveBeenCalled();
      expect(tray().destroyed).toBe(false);
      mockState.appHandlers.get("quit")!();
      expect(tray().destroyed).toBe(true);
    });

    it("retains the tray until the final quit after asynchronous compositor cleanup", async () => {
      vi.stubEnv("XDG_CURRENT_DESKTOP","Hyprland"); vi.stubEnv("HYPRLAND_INSTANCE_SIGNATURE","fixture_123_456");
      const main = await loadAppModule(); await new main.App().start();
      let release!: () => void;
      visibilityBoundary.entries[0].cleanup = () => new Promise<void>(resolve => {release=resolve;});
      const event = {preventDefault:vi.fn()};
      mockState.appHandlers.get("will-quit")!(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(tray().destroyed).toBe(false); expect(mockState.app.quit).not.toHaveBeenCalled();
      release(); await vi.waitFor(()=>expect(mockState.app.quit).toHaveBeenCalledOnce());
      expect(tray().destroyed).toBe(false);
      mockState.appHandlers.get("quit")!(); expect(tray().destroyed).toBe(true);
    });

    it("leaves normal launch and menus usable when the tray is unavailable", async () => {
      mockState.MockTray.failConstruction = true;
      const warning = vi.spyOn(console,"warn").mockImplementation(()=>{});
      try {
        const main = await loadAppModule(); await expect(new main.App().start()).resolves.toBeUndefined();
        expect(mockState.MockBrowserWindow.instances).toHaveLength(1);
        expect(mockState.Menu.setApplicationMenu).toHaveBeenCalled();
      } finally { warning.mockRestore(); }
    });
  });
  /** An IPC event from the window's own web contents. */
  function fromWindow(): { sender: unknown } {
    const win = mockState.MockBrowserWindow.instances[0];
    if (!win) throw new Error("The window was not created");
    return { sender: win.webContents };
  }

  /** An IPC event from an artifact webview's web contents, showing a page on the connected server. */
  function fromWebview(): { sender: unknown } {
    return {
      sender: {
        getType: () => "webview",
        getURL: () => "http://localhost:32848/artifact/01J00000000000000000000000/index.html",
        hostWebContents: mockState.MockBrowserWindow.instances[0]?.webContents ?? null,
      },
    };
  }

  // proofs/arch/desktop/updates.md#^desktop-updates-t-start
  it("starts the update runtime once, with only its notification turned off, straight after naming the app", async () => {
    mockState.callOrder.length = 0;
    mockState.runtime.init.mockClear();

    await loadAppModule();

    expect(mockState.runtime.init).toHaveBeenCalledTimes(1);
    expect(mockState.runtime.init.mock.calls[0]).toEqual([
      { updateReadyAction: { showNotification: "never" } },
    ]);
    expect(mockState.app.setName).toHaveBeenCalledWith("Television");
    const nameIndex = mockState.callOrder.indexOf("app.setName");
    expect(nameIndex).toBeGreaterThanOrEqual(0);
    expect(mockState.callOrder.slice(nameIndex, nameIndex + 2)).toEqual(["app.setName", "runtime.init"]);
  });

  function downloadedEvent(version: string | undefined): unknown {
    return {
      disableUpdateReadyAction: false,
      sources: ["auto-check-on-interval"],
      updateInfo: version === undefined ? null : { version, releaseDate: "2026-09-26T00:00:00.000Z" },
    };
  }

  // proofs/arch/desktop/updates.md#^desktop-updates-t-record
  it("records the runtime's downloaded update, reports each new version to the window, and restarts only with a record", async () => {
    vi.stubEnv("TV_TEST_MODE", "");
    const main = await loadAppModule();
    await new main.App().start();

    const win = mockState.MockBrowserWindow.instances[0]!;
    const getUpdate = mockState.ipcHandlers.get(GET_DESKTOP_UPDATE_CHANNEL);
    const restart = mockState.ipcListeners.get(RESTART_TO_INSTALL_UPDATE_CHANNEL);
    const downloaded = mockState.autoUpdaterListeners.get("update-downloaded");
    if (!getUpdate || !restart || !downloaded) throw new Error("desktop update wiring was not registered");
    const reported = () =>
      win.webContents.send.mock.calls.filter(([channel]) => channel === DESKTOP_UPDATE_DOWNLOADED_CHANNEL);
    const restartAndInstall = mockState.runtime.autoUpdater.restartAndInstall;

    expect(await getUpdate(fromWindow())).toBeNull();
    restart(fromWindow());
    expect(restartAndInstall).not.toHaveBeenCalled();

    downloaded(downloadedEvent("1.5.0"));
    expect(await getUpdate(fromWindow())).toBe("1.5.0");
    expect(reported()).toEqual([[DESKTOP_UPDATE_DOWNLOADED_CHANNEL, "1.5.0"]]);

    // The runtime re-emits after every later check while the update waits.
    downloaded(downloadedEvent("1.5.0"));
    downloaded(downloadedEvent(undefined));
    expect(reported()).toHaveLength(1);
    expect(await getUpdate(fromWindow())).toBe("1.5.0");

    downloaded(downloadedEvent("1.6.0"));
    expect(await getUpdate(fromWindow())).toBe("1.6.0");
    expect(reported()).toEqual([
      [DESKTOP_UPDATE_DOWNLOADED_CHANNEL, "1.5.0"],
      [DESKTOP_UPDATE_DOWNLOADED_CHANNEL, "1.6.0"],
    ]);

    restart(fromWindow());
    expect(restartAndInstall).toHaveBeenCalledTimes(1);
    expect(restartAndInstall).toHaveBeenCalledWith();
  });

  // proofs/arch/desktop/updates.md#^desktop-updates-t-record
  it("records a restart for the test instead of calling the runtime in test mode", async () => {
    vi.stubEnv("TV_TEST_MODE", "true");
    const globalState = globalThis as typeof globalThis & { __televisionRestartToInstallLog?: string[] };
    delete globalState.__televisionRestartToInstallLog;
    const main = await loadAppModule();
    await new main.App().start();

    mockState.autoUpdaterListeners.get("update-downloaded")!(downloadedEvent("1.5.0"));
    mockState.ipcListeners.get(RESTART_TO_INSTALL_UPDATE_CHANNEL)!(fromWindow());

    expect(mockState.runtime.autoUpdater.restartAndInstall).not.toHaveBeenCalled();
    expect(globalState.__televisionRestartToInstallLog).toEqual(["1.5.0"]);
    delete globalState.__televisionRestartToInstallLog;
  });

  it("creates BrowserWindow with contextIsolation and the connect preload", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    expect(mockState.MockBrowserWindow.instances).toHaveLength(1);
    const win = mockState.MockBrowserWindow.instances[0];
    expect(win.options.webPreferences?.contextIsolation).toBe(true);
    expect(win.options.webPreferences?.preload).toMatch(/connect-preload\.cjs$/);
  });

  it("starts native appearance at system and accepts only valid IPC values", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    expect(mockState.nativeTheme.themeSource).toBe("system");
    const listener = mockState.ipcListeners.get("television:set-appearance-mode");
    expect(listener).toBeDefined();
    const event = fromWindow();

    for (const mode of ["light", "dark", "system"] as const) {
      listener!(event, mode);
      expect(mockState.nativeTheme.themeSource).toBe(mode);
    }
    for (const invalid of ["sepia", null, 1, {}]) {
      listener!(event, invalid);
      expect(mockState.nativeTheme.themeSource).toBe("system");
    }
  });

  // proofs/arch/desktop/index.md#^desktop-t-window-identity
  it("creates BrowserWindow with Television title and the packaged icon", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const expectedIcon = path.resolve(import.meta.dirname, "../assets/icon.png");
    const win = mockState.MockBrowserWindow.instances[0];
    expect({ title: win.options.title, icon: win.options.icon }).toEqual({
      title: "Television",
      icon: expectedIcon,
    });
    expect(statSync(expectedIcon).size).toBeGreaterThan(0);
  });

  it("creates BrowserWindow with the authoritative window minimum", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const win = mockState.MockBrowserWindow.instances[0];
    expect({ minWidth: win.options.minWidth, minHeight: win.options.minHeight }).toEqual({
      minWidth: 500,
      minHeight: 500,
    });
  });

  it("creates the hidden titlebar at the authored traffic-light position", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });
    const main = await loadAppModule();
    await new main.App().start();
    Object.defineProperty(process, "platform", platform);

    const win = mockState.MockBrowserWindow.instances[0];
    expect({
      titleBarStyle: win.options.titleBarStyle,
      trafficLightPosition: win.options.trafficLightPosition,
    }).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 15, y: 15 },
    });
    expect(win.options.show).toBe(false);
  });

  it("provides a native Linux frame without Mac traffic-light coordinates", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    try {
    const main = await loadAppModule();
    await new main.App().start();
    const win = mockState.MockBrowserWindow.instances[0];
    expect(win.options.titleBarStyle).toBe("default");
    expect(win.options.trafficLightPosition).toBeUndefined();
    expect(win.options.show).toBe(true);
    } finally { Object.defineProperty(process, "platform", platform); }
  });

  it.each([false, true, undefined])("Linux Window menu toggles the focused native window (maximized=%s)", async maximized => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    try {
      const main = await loadAppModule();
      await new main.App().start();
      // Declared process-boundary mock: method calls, not compositor behavior
      // (proofs/product/linux-desktop.md#^linux-window-menu-contract).
      const focusedWindow = maximized === undefined ? undefined : {
        isMaximized: vi.fn(() => maximized), maximize: vi.fn(), unmaximize: vi.fn(),
      };
      const template = mockState.Menu.buildFromTemplate.mock.calls[0][0] as Array<{
        label?: string;
        submenu?: Array<{ role?: string; label?: string; click?: (item: unknown, window: typeof focusedWindow) => void }>;
      }>;
      const submenu = template.find(item => item.label === "Window")?.submenu;
      expect(submenu?.map(item => item.role ?? item.label)).toEqual(["minimize", "Maximize / Restore", "close"]);
      const toggle = submenu?.find(item => item.label === "Maximize / Restore")?.click;
      expect(toggle).toBeTypeOf("function");
      expect(() => toggle!(undefined, focusedWindow)).not.toThrow();
      if (focusedWindow) {
        expect(focusedWindow.isMaximized).toHaveBeenCalledOnce();
        expect(focusedWindow.maximize).toHaveBeenCalledTimes(maximized ? 0 : 1);
        expect(focusedWindow.unmaximize).toHaveBeenCalledTimes(maximized ? 1 : 0);
      }
    } finally { Object.defineProperty(process, "platform", platform); }
  });

  it.each(["darwin", "win32"])("retains the standard Window menu on %s", async value => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value });
    try {
      const main = await loadAppModule();
      await new main.App().start();
      const template = mockState.Menu.buildFromTemplate.mock.calls[0][0] as Array<{ role?: string; label?: string }>;
      expect(template.filter(item => item.role === "windowMenu")).toHaveLength(1);
      expect(template.some(item => item.label === "Window")).toBe(false);
    } finally { Object.defineProperty(process, "platform", platform); }
  });

  // Electron process-boundary contracts; actual OS lock/visibility and retained
  // live connection are carried by the packaged walk, not this double.
  // proofs/arch/desktop/linux-distribution.md#^linux-hyprland-session
  describe("Hyprland Hide lifecycle", () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    beforeEach(() => {
      Object.defineProperty(process, "platform", { ...platform, value: "linux" });
      vi.stubEnv("XDG_CURRENT_DESKTOP", "Hyprland");
      vi.stubEnv("HYPRLAND_INSTANCE_SIGNATURE", "fixture_123_456");
    });
    afterEach(() => { Object.defineProperty(process, "platform", platform); });

    function hideItem() {
      const template = mockState.Menu.setApplicationMenu.mock.calls.at(-1)![0] as Array<{
        label?: string; submenu?: Array<{ role?: string; label?: string;
          click?: (item: unknown, window: InstanceType<typeof mockState.MockBrowserWindow> | undefined) => void }>;
      }>;
      return template.find(item => item.label === "Window")!.submenu![0];
    }

    it.each([
      ["Hyprland", "Hide", true], [" GNOME : hYpRlAnD :", "Hide", true],
      ["NotHyprland", "minimize", false], ["Hyprland-session", "minimize", false],
      ["GNOME", "minimize", false], ["", "minimize", false],
    ])("selects native window behavior for desktop %j", async (desktop, label, locked) => {
      vi.stubEnv("XDG_CURRENT_DESKTOP", desktop);
      const main = await loadAppModule();
      await new main.App().start();
      expect(hideItem().label ?? hideItem().role).toBe(label);
      expect(mockState.app.requestSingleInstanceLock).toHaveBeenCalledTimes(locked ? 1 : 0);
    });

    it.each(["darwin", "win32"])("does not arbitrate Hyprland-named sessions on %s", async value => {
      Object.defineProperty(process, "platform", { ...platform, value });
      const main = await loadAppModule(); await new main.App().start();
      expect(mockState.app.requestSingleInstanceLock).not.toHaveBeenCalled();
      expect(mockState.appHandlers.has("second-instance")).toBe(false);
    });

    // proofs/arch/desktop/linux-distribution.md#^linux-hyprland-lock
    it("quits a duplicate Hyprland profile before readiness or connection loading", async () => {
      mockState.app.requestSingleInstanceLock.mockReturnValue(false);
      const main = await loadAppModule();
      mockState.app.getPath.mockClear();
      await new main.App().start();
      expect(mockState.app.quit).toHaveBeenCalledOnce();
      expect(mockState.app.whenReady).not.toHaveBeenCalled();
      expect(mockState.app.getPath).not.toHaveBeenCalled();
      expect(mockState.MockBrowserWindow.instances).toHaveLength(0);
      expect(mockState.Menu.setApplicationMenu).not.toHaveBeenCalled();
    });

    it("acquires the Hyprland profile lock before readiness and connection loading", async () => {
      mockState.callOrder.length = 0;
      const main = await loadAppModule(); await new main.App().start();
      const lock = mockState.callOrder.indexOf("app.requestSingleInstanceLock");
      expect(lock).toBeGreaterThan(mockState.callOrder.indexOf("app.setName"));
      expect(lock).toBeLessThan(mockState.callOrder.indexOf("app.whenReady"));
      expect(lock).toBeLessThan(mockState.callOrder.indexOf("app.getPath"));
    });

    // proofs/arch/desktop/linux-distribution.md#^linux-hyprland-reveal-contract
    it("hides only its focused owned main window and ignores missing or unrelated focus", async () => {
      const main=await loadAppModule();await new main.App().start();
      const primary=mockState.MockBrowserWindow.instances[0],unrelated=new mockState.MockBrowserWindow({});
      const hide=hideItem().click!;hide(undefined,undefined);hide(undefined,unrelated);
      await Promise.resolve();expect(visibilityBoundary.entries[0].actions).toEqual([]);
      expect(unrelated.hide).not.toHaveBeenCalled();hide(undefined,primary);
      await vi.waitFor(()=>expect(visibilityBoundary.entries[0].actions).toHaveLength(1));
      expect(visibilityBoundary.entries[0].session).toBe("fixture_123_456");
      expect(visibilityBoundary.entries[0].actions[0]).toMatchObject({visible:false,
        owner:{pid:process.pid,applicationID:"computer.telepath.television",session:"fixture_123_456"}});
      expect(primary.hide).not.toHaveBeenCalled();expect(mockState.app.quit).not.toHaveBeenCalled();
    });
    it.each(["second-instance","activate"])("%s restores the same held window through compositor control without reloading",async event=>{
      const main=await loadAppModule();await new main.App().start();
      const win=mockState.MockBrowserWindow.instances[0],loads=[win.loadFile.mock.calls.length,win.loadURL.mock.calls.length],saved=[...fsState.files];
      hideItem().click!(undefined,win);
      await vi.waitFor(()=>expect(visibilityBoundary.entries[0].state).toMatchObject({visibleOnMonitors:[]}));
      win.emitOnce("ready-to-show");expect(win.show).not.toHaveBeenCalled();
      mockState.appHandlers.get(event)!();
      await vi.waitFor(()=>expect(visibilityBoundary.entries[0].state).toMatchObject({workspace:7,visibleOnMonitors:[0]}));
      expect(visibilityBoundary.entries[0].actions.map(a=>a.visible)).toEqual([false,true]);
      expect(mockState.MockBrowserWindow.instances).toEqual([win]);expect(win.hide).not.toHaveBeenCalled();
      expect(win.show).not.toHaveBeenCalled();expect(win.focus).not.toHaveBeenCalled();
      expect([win.loadFile.mock.calls.length,win.loadURL.mock.calls.length]).toEqual(loads);expect([...fsState.files]).toEqual(saved);
    });
    it("restores native minimized state before requesting compositor reveal",async()=>{
      const main=await loadAppModule();await new main.App().start();const win=mockState.MockBrowserWindow.instances[0];
      win.isMinimized.mockReturnValue(true);mockState.appHandlers.get("second-instance")!();
      await vi.waitFor(()=>expect(visibilityBoundary.entries[0].actions).toHaveLength(1));
      expect(win.restore).toHaveBeenCalledOnce();expect(visibilityBoundary.entries[0].actions[0].visible).toBe(true);
      expect(win.show).not.toHaveBeenCalled();expect(win.focus).not.toHaveBeenCalled();
    });
    it("failed control keeps the window and reports restore failure through native notification",async()=>{
      const main=await loadAppModule();await new main.App().start();const win=mockState.MockBrowserWindow.instances[0];
      const loads=[win.loadFile.mock.calls.length,win.loadURL.mock.calls.length];
      visibilityBoundary.entries[0].state={status:"unavailable",reason:"control absent"};
      mockState.appHandlers.get("second-instance")!();
      await vi.waitFor(()=>expect(visibilityBoundary.notifications).toEqual([{title:"Television",body:expect.stringMatching(/still running.*restore.*retry/i)}]));
      expect(visibilityBoundary.entries[0].actions).toEqual([]);expect(mockState.MockBrowserWindow.instances).toEqual([win]);
      expect([win.loadFile.mock.calls.length,win.loadURL.mock.calls.length]).toEqual(loads);expect(win.hide).not.toHaveBeenCalled();
    });
    it("a cancelled quit leaves the surviving window able to Hide and reveal",async()=>{
      const main=await loadAppModule();await new main.App().start();const win=mockState.MockBrowserWindow.instances[0];
      // Electron emits before-quit before the renderer can refuse closure. No closed/will-quit follows cancellation.
      mockState.appHandlers.get("before-quit")?.();
      hideItem().click!(undefined,win);
      await vi.waitFor(()=>expect(visibilityBoundary.entries[0].state).toMatchObject({visibleOnMonitors:[]}));
      mockState.appHandlers.get("second-instance")!();
      await vi.waitFor(()=>expect(visibilityBoundary.entries[0].state).toMatchObject({workspace:7,visibleOnMonitors:[0]}));
      expect(mockState.MockBrowserWindow.instances).toEqual([win]);
    });
    it("final quit is deferred beyond the native will-quit callback's microtask checkpoint",async()=>{
      const main=await loadAppModule();await new main.App().start();const win=mockState.MockBrowserWindow.instances[0];
      win.emit("closed");await Promise.resolve();
      // Electron resets its native quitting flag only after the JS will-quit callback and its microtasks return.
      let nativeCallbackActive=true,acceptedQuits=0;
      mockState.app.quit.mockImplementation(()=>{if(!nativeCallbackActive)++acceptedQuits;});
      mockState.appHandlers.get("will-quit")?.({preventDefault:vi.fn()});
      for(let i=0;i<8;i++)await Promise.resolve();
      nativeCallbackActive=false;
      await vi.waitFor(()=>expect(acceptedQuits).toBe(1));
    });
    it("final quit waits for the closed window's owned cleanup before exiting",async()=>{
      const main=await loadAppModule();await new main.App().start();const win=mockState.MockBrowserWindow.instances[0];
      let complete!:()=>void;visibilityBoundary.entries[0].cleanup=()=>new Promise<void>(resolve=>{complete=resolve;});
      win.emit("closed");const preventDefault=vi.fn();
      mockState.appHandlers.get("will-quit")?.({preventDefault});
      expect(preventDefault).toHaveBeenCalledOnce();expect(mockState.app.quit).not.toHaveBeenCalled();
      complete();await vi.waitFor(()=>expect(mockState.app.quit).toHaveBeenCalledOnce());
      const finalPreventDefault=vi.fn();mockState.appHandlers.get("will-quit")?.({preventDefault:finalPreventDefault});
      expect(finalPreventDefault).not.toHaveBeenCalled();
    });

    it("closing its owned window invalidates an unfinished observation",async()=>{
      const main=await loadAppModule();await new main.App().start();const win=mockState.MockBrowserWindow.instances[0];
      let release!:(value:CompositorObservation)=>void;let captured:WindowOwner|undefined;
      visibilityBoundary.entries[0].inspect=owner=>{captured=owner;return new Promise(resolve=>{release=resolve;});};
      hideItem().click!(undefined,win);await vi.waitFor(()=>expect(captured).toBeDefined());win.emit("closed");
      expect(visibilityBoundary.entries[0].disposed).toBe(true);release(visibilityBoundary.owned(captured!));
      await new Promise(resolve=>setTimeout(resolve,0));expect(visibilityBoundary.entries[0].actions).toEqual([]);
      expect(visibilityBoundary.notifications).toEqual([]);
    });
    it("stale closed and ready callbacks cannot clear or show a replacement window",async()=>{
      const main=await loadAppModule();await new main.App().start();const old=mockState.MockBrowserWindow.instances[0];
      old.emit("closed");mockState.MockBrowserWindow.instances.length=0;mockState.appHandlers.get("activate")!();
      await vi.waitFor(()=>expect(mockState.MockBrowserWindow.instances).toHaveLength(1));
      const replacement=mockState.MockBrowserWindow.instances[0];old.emit("closed");old.emitOnce("ready-to-show");
      hideItem().click!(undefined,replacement);
      await vi.waitFor(()=>expect(visibilityBoundary.entries.at(-1)!.actions).toHaveLength(1));
      expect(replacement.show).not.toHaveBeenCalled();expect(visibilityBoundary.entries.at(-1)!.disposed).toBe(false);
    });

    it("keeps the initial window visible after a second launch during readiness", async () => {
      let ready!: () => void;
      mockState.app.whenReady.mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
      const main = await loadAppModule(); const start = new main.App().start();
      expect(mockState.appHandlers.has("second-instance")).toBe(true);
      mockState.appHandlers.get("second-instance")!();
      expect(mockState.MockBrowserWindow.instances).toHaveLength(0);
      ready(); await start;
      expect(mockState.MockBrowserWindow.instances).toHaveLength(1);
      expect(mockState.MockBrowserWindow.instances[0].options.show).toBe(true);
    });
  });

  it("makes the Linux release version available through the About menu", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    try {
    const main = await loadAppModule();
    await new main.App().start();
    expect(mockState.app.setAboutPanelOptions).toHaveBeenCalledWith(expect.objectContaining({
      applicationName: "Television", applicationVersion: "0.1.170", version: "",
    }));
    const template = mockState.Menu.buildFromTemplate.mock.calls[0][0] as Array<{
      submenu?: Array<{ role?: string }>;
    }>;
    expect(template.flatMap(item => item.submenu ?? []).some(item => item.role === "about")).toBe(true);
    } finally { Object.defineProperty(process, "platform", platform); }
  });

  it("quits cleanly when the visible Linux window closes during its initial page load", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { ...platform, value: "linux" });
    try {
      const before = mockState.app.quit.mock.calls.length;
      mockState.setLoadFileBehavior(async window => {
        window.emit("closed");
        mockState.appHandlers.get("window-all-closed")?.();
        throw new Error("ERR_ABORTED: window closed");
      });
      const main = await loadAppModule();
      await expect(new main.App().start()).resolves.toBeUndefined();
      expect(mockState.app.quit.mock.calls.length).toBe(before + 1);
    } finally { Object.defineProperty(process, "platform", platform); }
  });

  it("allows Disconnect to replace an initial load on the same window", async () => {
    fsState.files.set("/tmp/television-test-userdata/connection.json", JSON.stringify({
      serverURL: "http://localhost:32848", token: "saved-fixture-token",
    }));
    let rejectInitial!: (error: Error) => void;
    let markInitialStarted!: () => void;
    const initialStarted = new Promise<void>(resolve => { markInitialStarted = resolve; });
    let loads = 0;
    mockState.setLoadFileBehavior(async () => {
      if (++loads !== 1) return;
      await new Promise<void>((_resolve, reject) => {
        rejectInitial = reject;
        markInitialStarted();
      });
    });
    const main = await loadAppModule();
    const startup = new main.App().start();
    const outcome = startup.then(() => undefined, error => error);
    await initialStarted;
    await mockState.ipcHandlers.get("television:disconnect")!(fromWindow());
    rejectInitial(new Error("ERR_ABORTED: navigation replaced"));
    expect(await outcome).toBeUndefined();
    expect(mockState.MockBrowserWindow.instances[0].webContents.stop).toHaveBeenCalledOnce();
    expect(loads).toBe(2);
    expect(fsState.files.has("/tmp/television-test-userdata/connection.json")).toBe(false);
  });

  it("still rejects a genuine failure of the current connect-screen load", async () => {
    const error = new Error("connect.html missing");
    mockState.setLoadFileBehavior(async () => { throw error; });
    const main = await loadAppModule();
    await expect(new main.App().start()).rejects.toBe(error);
  });

  // spec: proofs/arch/artifact-frame/artifact-bridge.md#^ab-ac-preload-attachment
  it("gives every webview the bridge preload with context isolation", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const win = mockState.MockBrowserWindow.instances[0];
    const call = win.webContents.on.mock.calls.find(([event]) => event === "will-attach-webview");
    expect(call).toBeDefined();
    const handler = call![1] as (event: unknown, webPreferences: BrowserWindowOptions["webPreferences"]) => void;
    const webPreferences: BrowserWindowOptions["webPreferences"] = {};

    handler({}, webPreferences);

    expect(webPreferences.preload).toMatch(/webview-bridge-preload\.cjs$/);
    expect(webPreferences.contextIsolation).toBe(true);
  });

  it("consumes a matching webview chord and sends its arrow once to the embedding renderer", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const createdHandler = mockState.appHandlers.get("web-contents-created");
    expect(createdHandler).toBeDefined();
    const hostSend = vi.fn();
    const guestOn = vi.fn();
    const guest = {
      getType: () => "webview",
      hostWebContents: { send: hostSend },
      on: guestOn,
      setWindowOpenHandler: vi.fn(),
    };
    createdHandler!({}, guest);

    const call = guestOn.mock.calls.find(([event]) => event === "before-input-event");
    expect(call).toBeDefined();
    const handler = call![1] as BeforeInputEventHandler;
    const event = { preventDefault: vi.fn() };
    handler(event, {
      type: "keyDown",
      key: "ArrowRight",
      isAutoRepeat: false,
      isComposing: false,
      shift: false,
      control: process.platform !== "darwin",
      alt: process.platform === "darwin",
      meta: false,
    });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(hostSend).toHaveBeenCalledOnce();
    expect(hostSend).toHaveBeenCalledWith("television:navigation-key", "ArrowRight");
  });

  // spec: proofs/arch/artifact-frame/artifact-bridge.md#^ab-ac-application-link-main
  it("blocks non-web main-frame navigation but leaves browser-local subframes native", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const createdHandler = mockState.appHandlers.get("web-contents-created");
    const guestOn = vi.fn();
    createdHandler!({}, {
      getType: () => "webview",
      hostWebContents: { send: vi.fn() },
      on: guestOn,
      setWindowOpenHandler: vi.fn(),
    });
    const call = guestOn.mock.calls.find(([event]) => event === "will-frame-navigate");
    expect(call).toBeDefined();
    const handler = call![1] as (event: { url: string; isMainFrame: boolean; preventDefault(): void }) => void;

    for (const url of [
      "example-app://open/item",
      "javascript:document.body.textContent='owned'",
      "file:///tmp/note.html",
    ]) {
      const event = { url, isMainFrame: true, preventDefault: vi.fn() };
      handler(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    const web = { url: "https://example.com", isMainFrame: true, preventDefault: vi.fn() };
    handler(web);
    expect(web.preventDefault).not.toHaveBeenCalled();

    for (const url of [
      "about:srcdoc",
      "about:blank",
      "data:text/html,nested",
      "blob:https://television.test/id",
    ]) {
      const event = { url, isMainFrame: false, preventDefault: vi.fn() };
      handler(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    const applicationSubframe = {
      url: "example-app://open/from-subframe",
      isMainFrame: false,
      preventDefault: vi.fn(),
    };
    handler(applicationSubframe);
    expect(applicationSubframe.preventDefault).toHaveBeenCalledOnce();
  });

  it("does not attach native navigation before a webview has a host", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const createdHandler = mockState.appHandlers.get("web-contents-created");
    const guestOn = vi.fn();
    createdHandler!({}, {
      getType: () => "webview",
      hostWebContents: null,
      on: guestOn,
      setWindowOpenHandler: vi.fn(),
    });

    expect(guestOn).not.toHaveBeenCalledWith("before-input-event", expect.any(Function));
  });

  it("leaves BrowserWindow input to the renderer shell handler", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const createdHandler = mockState.appHandlers.get("web-contents-created");
    const windowOn = vi.fn();
    createdHandler!({}, {
      getType: () => "window",
      on: windowOn,
      setWindowOpenHandler: vi.fn(),
    });

    expect(windowOn).not.toHaveBeenCalledWith("before-input-event", expect.any(Function));
  });

  it("loads the connect screen when no connection is saved", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const win = mockState.MockBrowserWindow.instances[0];
    expect(win.loadFile).toHaveBeenCalledTimes(1);
    expect(win.loadFile).toHaveBeenCalledWith(expect.stringMatching(/connect\.html$/));
    expect(win.loadURL).not.toHaveBeenCalled();
  });

  // Spec: ^updates-t-preflight-desktop-contract
  it("connect IPC accepts additive connect-check JSON, saves normalized fields, and loads the versioned remote URL", async () => {
    const main = await loadAppModule();
    await new main.App().start();
    mockState.app.getVersion.mockClear();

    const win = mockState.MockBrowserWindow.instances[0];
    win.loadFile.mockClear();
    win.loadURL.mockClear();

    const handler = mockState.ipcHandlers.get("television:connect");
    expect(handler).toBeDefined();

    const result = await handler!(fromWindow(), "localhost:32848/?token=abc123");
    expect(result).toMatchObject({ ok: true, attempt: expect.any(Number) });
    await mockState.ipcHandlers.get("television:complete-connect")!(fromWindow(), (result as { attempt: number }).attempt);

    const saved = JSON.parse(fsState.files.get("/tmp/television-test-userdata/connection.json")!);
    expect(saved.serverURL).toBe("http://localhost:32848");
    expect(saved.token).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:32848/desktop/connect-check?desktopAppVersion=0.1.170",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer abc123" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockState.app.getVersion).toHaveBeenCalledTimes(1);
    expect(win.loadURL).toHaveBeenCalledTimes(1);
    const loaded = new URL(win.loadURL.mock.calls[0][0]);
    expect(loaded.protocol).toBe("http:");
    expect(loaded.host).toBe("localhost:32848");
    expect(loaded.searchParams.get("mode")).toBe("electron");
    expect(loaded.searchParams.get("token")).toBe("abc123");
    expect(loaded.searchParams.get("desktopAppVersion")).toBe("0.1.170");
  });

  it("connect IPC does not save submitted fields before URL validation", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const handler = mockState.ipcHandlers.get("television:connect");
    await expect(handler!(fromWindow(), "not a url!!!")).resolves.toEqual({
      ok: false,
      message: "Enter a valid http or https URL",
    });

    expect(fsState.files.get("/tmp/television-test-userdata/connection.json")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("connect IPC does not save submitted fields or loadURL when the connect check fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    const main = await loadAppModule();
    await new main.App().start();

    const win = mockState.MockBrowserWindow.instances[0];
    win.loadURL.mockClear();

    const handler = mockState.ipcHandlers.get("television:connect");
    await expect(handler!(fromWindow(), "http://127.0.0.1:9")).resolves.toEqual({
      ok: false,
      message: "This link is missing an access token. Ask your agent for the current link.",
    });

    expect(fsState.files.get("/tmp/television-test-userdata/connection.json")).toBeUndefined();
    expect(win.loadURL).not.toHaveBeenCalled();
  });

  it("connect IPC loads remote URL without ?token= when token is empty", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const win = mockState.MockBrowserWindow.instances[0];
    win.loadURL.mockClear();

    const handler = mockState.ipcHandlers.get("television:connect");
    const result = await handler!(fromWindow(), "https://tv.example.com") as { attempt: number };
    await mockState.ipcHandlers.get("television:complete-connect")!(fromWindow(), result.attempt);

    const loaded = new URL(win.loadURL.mock.calls[0][0]);
    expect(loaded.searchParams.get("mode")).toBe("electron");
    expect(loaded.searchParams.has("token")).toBe(false);
  });

  it("shows the Mac window once ready-to-show fires", async () => {
    const platform=Object.getOwnPropertyDescriptor(process,"platform")!;
    Object.defineProperty(process,"platform",{...platform,value:"darwin"});
    try {
      mockState.setAutoEmitReadyToShowOnLoad(true);
      const main = await loadAppModule(); await new main.App().start();
      const win = mockState.MockBrowserWindow.instances[0];
      expect(win.show).toHaveBeenCalledTimes(1);
    } finally { Object.defineProperty(process,"platform",platform); }
  });

  // Proof: [[arch/desktop/index.md#^desktop-t-about-version|About-panel version configuration]].
  it("configures the macOS About panel before installing the application menu", async () => {
    mockState.app.getVersion.mockReturnValueOnce("1.3.1");
    const main = await loadAppModule();
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { ...platform, value: "darwin" });

    try {
      await new main.App().start();
    } finally {
      Object.defineProperty(process, "platform", platform!);
    }

    expect(mockState.app.setAboutPanelOptions).toHaveBeenCalledWith({
      applicationVersion: "1.3.1",
      version: "",
    });
    expect(mockState.app.setAboutPanelOptions.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.Menu.setApplicationMenu.mock.invocationCallOrder[0],
    );
  });

  it("registers a Disconnect from Server menu item", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    expect(mockState.Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
    const template = mockState.Menu.buildFromTemplate.mock.calls[0][0] as Array<{
      submenu?: Array<{ label?: string }>;
    }>;
    const labels = template.flatMap((item) => item.submenu?.map((sub) => sub.label) ?? []);
    expect(labels).toContain("Disconnect from Server");
  });

  it("routes webContents window-open URLs to shell.openExternal", async () => {
    const main = await loadAppModule();
    await new main.App().start();

    const createdHandler = mockState.appHandlers.get("web-contents-created");
    expect(createdHandler).toBeDefined();
    const setWindowOpenHandler = vi.fn();
    createdHandler!({}, { getType: () => "window", setWindowOpenHandler });

    expect(setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const handler = setWindowOpenHandler.mock.calls[0][0] as WindowOpenHandler;
    expect(handler({ url: "https://example.com/page" })).toEqual({ action: "deny" });
    expect(mockState.shell.openExternal).toHaveBeenCalledWith("https://example.com/page");

    mockState.shell.openExternal.mockClear();
    expect(handler({ url: "example-app://open/item" })).toEqual({ action: "deny" });
    expect(mockState.shell.openExternal).not.toHaveBeenCalled();
  });

  // spec: proofs/arch/artifact-frame/artifact-bridge.md#^ab-ac-application-link-main
  it("opens an application link only from the window's own web contents, and only an application value", async () => {
    vi.stubEnv("TV_TEST_MODE", "");
    const main = await loadAppModule();
    await new main.App().start();

    const listener = mockState.ipcListeners.get(OPEN_APPLICATION_LINK_CHANNEL);
    expect(listener).toBeDefined();

    listener!(fromWindow(), "example-app://open/item");
    expect(mockState.shell.openExternal).toHaveBeenCalledTimes(1);
    expect(mockState.shell.openExternal).toHaveBeenCalledWith("example-app://open/item");

    mockState.shell.openExternal.mockClear();
    listener!(fromWebview(), "example-app://open/item");
    for (const sender of [fromWindow(), fromWebview()]) {
      for (const denied of [
        "https://example.com",
        "javascript:document.body.textContent='owned'",
        "file:///tmp/note.html",
        "data:text/html,<p>page</p>",
        "about:blank",
        "http://[",
        42,
        null,
      ]) {
        listener!(sender, denied);
      }
    }
    expect(mockState.shell.openExternal).not.toHaveBeenCalled();
  });

  // spec: proofs/arch/desktop/index.md#^desktop-t-ipc-senders
  it("acts on IPC from the window's own web contents and on none from a webview, on every channel it handles", async () => {
    vi.stubEnv("TV_TEST_MODE", "");
    const main = await loadAppModule();
    await new main.App().start();
    const win = mockState.MockBrowserWindow.instances[0]!;
    mockState.autoUpdaterListeners.get("update-downloaded")!(downloadedEvent("1.5.0"));
    // The probes connect more than once, and a response's body is read once.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(connectCheckBody), { status: 200 }));

    const invoke = (channel: string, event: unknown, ...args: unknown[]) => {
      const handler = mockState.ipcHandlers.get(channel);
      if (!handler) throw new Error(`${channel} has no handler`);
      return Promise.resolve(handler(event, ...args));
    };
    const send = (channel: string, event: unknown, ...args: unknown[]) => {
      const listener = mockState.ipcListeners.get(channel);
      if (!listener) throw new Error(`${channel} has no listener`);
      listener(event, ...args);
    };
    const connectFromWindow = async () =>
      await invoke("television:connect", fromWindow(), "localhost:32848/?token=abc123") as { ok: boolean; attempt: number };

    // For each channel, a value the main process acts on from the window, and
    // whether it acted.
    const probes: Record<string, (event: unknown) => Promise<boolean>> = {
      [SET_APPEARANCE_MODE_CHANNEL]: async (event) => {
        mockState.nativeTheme.themeSource = "system";
        send(SET_APPEARANCE_MODE_CHANNEL, event, "dark");
        return mockState.nativeTheme.themeSource === "dark";
      },
      [GET_DESKTOP_UPDATE_CHANNEL]: async (event) => await invoke(GET_DESKTOP_UPDATE_CHANNEL, event) === "1.5.0",
      [RESTART_TO_INSTALL_UPDATE_CHANNEL]: async (event) => {
        mockState.runtime.autoUpdater.restartAndInstall.mockClear();
        send(RESTART_TO_INSTALL_UPDATE_CHANNEL, event);
        return mockState.runtime.autoUpdater.restartAndInstall.mock.calls.length > 0;
      },
      [GET_CONNECT_STATE_CHANNEL]: async (event) => await invoke(GET_CONNECT_STATE_CHANNEL, event) !== undefined,
      "television:connect": async (event) => {
        fetchMock.mockClear();
        const result = await invoke("television:connect", event, "localhost:32848/?token=abc123");
        return fetchMock.mock.calls.length > 0 || result !== undefined;
      },
      [COMPLETE_CONNECT_CHANNEL]: async (event) => {
        const { attempt } = await connectFromWindow();
        win.loadURL.mockClear();
        await invoke(COMPLETE_CONNECT_CHANNEL, event, attempt);
        return win.loadURL.mock.calls.length > 0;
      },
      [DISCONNECT_CHANNEL]: async (event) => {
        const { attempt } = await connectFromWindow();
        await invoke(COMPLETE_CONNECT_CHANNEL, fromWindow(), attempt);
        win.loadFile.mockClear();
        await invoke(DISCONNECT_CHANNEL, event);
        return win.loadFile.mock.calls.length > 0;
      },
      [OPEN_APPLICATION_LINK_CHANNEL]: async (event) => {
        mockState.shell.openExternal.mockClear();
        send(OPEN_APPLICATION_LINK_CHANNEL, event, "example-app://open/item");
        return mockState.shell.openExternal.mock.calls.length > 0;
      },
    };

    const channels = [...mockState.ipcHandlers.keys(), ...mockState.ipcListeners.keys()];
    expect(channels.filter((channel) => !(channel in probes))).toEqual([]);
    for (const channel of channels) {
      expect({ channel, acted: await probes[channel]!(fromWebview()) }).toEqual({ channel, acted: false });
      expect({ channel, acted: await probes[channel]!(fromWindow()) }).toEqual({ channel, acted: true });
    }
  });

  // spec: proofs/arch/artifact-frame/isolation.md#^iso-t-permissions
  it("grants a webview only clipboard writing, fullscreen and media keys in every session, and grants the window everything", async () => {
    const main = await loadAppModule();
    await new main.App().start();
    const win = mockState.MockBrowserWindow.instances[0]!;
    win.webContents.getURL.mockReturnValue("http://localhost:32848/?mode=electron");
    for (const partition of ["tv-artifact:01J00000000000000000000000", "tv-url-artifact", undefined]) {
      attachWebview(partition);
    }
    const sessions = [mockState.session.defaultSession, ...mockState.partitionSessions.values()];
    expect(sessions).toHaveLength(4);

    for (const session of sessions) {
      expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
      expect(session.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
      const request = session.setPermissionRequestHandler.mock.calls[0]![0];
      const check = session.setPermissionCheckHandler.mock.calls[0]![0];
      const requested = (webContents: unknown, permission: string) => {
        const callback = vi.fn();
        request(webContents, permission, callback, { requestingUrl: "http://localhost:32848/" });
        expect(callback).toHaveBeenCalledTimes(1);
        return callback.mock.calls[0]![0] as boolean;
      };
      const checked = (webContents: unknown, permission: string) =>
        check(webContents, permission, "http://localhost:32848", { requestingUrl: "http://localhost:32848/" });

      // Every permission Electron's request and check handlers can name.
      const permissions = [
        "clipboard-read", "clipboard-sanitized-write", "deprecated-sync-clipboard-read", "display-capture",
        "fileSystem", "fullscreen", "geolocation", "hid", "idle-detection", "keyboardLock", "media",
        "mediaKeySystem", "midi", "midiSysex", "notifications", "openExternal", "pointerLock", "serial",
        "speaker-selection", "storage-access", "top-level-storage-access", "unknown", "usb", "window-management",
      ];
      const granted = ["clipboard-sanitized-write", "fullscreen", "mediaKeySystem"];
      const webviews = [
        "http://localhost:32848/artifact/01J00000000000000000000000/index.html",
        "https://third-party.example/page",
        "http://localhost:32848/views/markdown/",
      ].map((url) => ({ getType: () => "webview", getURL: () => url }));
      for (const webview of webviews) {
        for (const permission of permissions) {
          const expected = granted.includes(permission);
          expect({ url: webview.getURL(), permission, requested: requested(webview, permission) })
            .toEqual({ url: webview.getURL(), permission, requested: expected });
          expect({ url: webview.getURL(), permission, checked: checked(webview, permission) })
            .toEqual({ url: webview.getURL(), permission, checked: expected });
        }
      }

      const windowContents = mockState.MockBrowserWindow.instances[0]!.webContents;
      for (const permission of permissions) {
        expect({ permission, requested: requested(windowContents, permission) }).toEqual({ permission, requested: true });
        expect({ permission, checked: checked(windowContents, permission) }).toEqual({ permission, checked: true });
      }
    }
  });

  /** Attaches a webview asking for `partition`, as Electron's `will-attach-webview` does. */
  function attachWebview(partition: string | undefined) {
    const win = mockState.MockBrowserWindow.instances[0]!;
    const call = win.webContents.on.mock.calls.find(([event]) => event === "will-attach-webview");
    if (!call) throw new Error("No will-attach-webview handler");
    const handler = call[1] as (
      event: { preventDefault(): void },
      webPreferences: { partition?: string; preload?: string; contextIsolation?: boolean },
    ) => void;
    const event = { preventDefault: vi.fn() };
    const webPreferences: { partition?: string; preload?: string; contextIsolation?: boolean } = {};
    if (partition !== undefined) webPreferences.partition = partition;
    handler(event, webPreferences);
    return { refused: event.preventDefault.mock.calls.length > 0, webPreferences };
  }

  const RECORD_FILE = "/tmp/television-test-userdata/artifact-partitions.json";

  function artifactPartition(origin: string, id: string): string {
    return `persist:artifact-${createHash("sha256").update(`${origin}\n${id}`, "utf8").digest("hex").slice(0, 32)}`;
  }

  // spec: proofs/arch/desktop/artifact-partitions.md#^dp-t-attach
  it("places each attaching webview in its partition, sets up the partition's session first, and refuses unknown partitions", async () => {
    const main = await loadAppModule();
    await new main.App().start();
    const win = mockState.MockBrowserWindow.instances[0]!;
    win.webContents.getURL.mockReturnValue("http://localhost:32848/?mode=electron");
    const artifactID = "01J00000000000000000000000";
    const expectedArtifact = artifactPartition("http://localhost:32848", artifactID);

    const setUp = (partition: string) => {
      const partitionSession = mockState.partitionSessions.get(partition);
      return partitionSession === undefined ? null : {
        request: partitionSession.setPermissionRequestHandler.mock.calls.length,
        check: partitionSession.setPermissionCheckHandler.mock.calls.length,
      };
    };

    for (let time = 0; time < 2; time++) {
      const artifact = attachWebview(`tv-artifact:${artifactID}`);
      expect(artifact).toEqual({
        refused: false,
        webPreferences: { partition: expectedArtifact, preload: expect.stringMatching(/webview-bridge-preload\.cjs$/), contextIsolation: true, transparent: false },
      });
      const url = attachWebview("tv-url-artifact");
      expect(url).toEqual({
        refused: false,
        webPreferences: { partition: "persist:url-artifacts", preload: expect.stringMatching(/webview-bridge-preload\.cjs$/), contextIsolation: true, transparent: false },
      });
      const fallback = attachWebview(undefined);
      expect(fallback).toEqual({
        refused: false,
        webPreferences: { partition: "persist:webview-fallback", preload: expect.stringMatching(/webview-bridge-preload\.cjs$/), contextIsolation: true, transparent: false },
      });
      // Each session is set up once, however many webviews use it.
      for (const partition of [expectedArtifact, "persist:url-artifacts", "persist:webview-fallback"]) {
        expect({ partition, setUp: setUp(partition) }).toEqual({ partition, setUp: { request: 1, check: 1 } });
      }
    }
    // Only the artifact partition is recorded, under the window's origin.
    expect(JSON.parse(fsState.files.get(RECORD_FILE)!)).toEqual({
      version: 1,
      servers: { "http://localhost:32848": { [expectedArtifact.slice("persist:".length)]: artifactID } },
    });

    const sessionsBefore = [...mockState.partitionSessions.keys()];
    for (const partition of ["persist:arbitrary", "tv-artifact:", "tv-url-artifacts", "anything"]) {
      expect({ partition, refused: attachWebview(partition).refused }).toEqual({ partition, refused: true });
    }
    win.webContents.getURL.mockReturnValue("file:///Applications/Television.app/connect.html");
    expect(attachWebview(`tv-artifact:${artifactID}`).refused).toBe(true);
    expect([...mockState.partitionSessions.keys()]).toEqual(sessionsBefore);
    expect(mockState.session.fromPartition.mock.calls.map(([partition]) => partition)).not.toContain("");
    expect(mockState.session.defaultSession.webRequest.onHeadersReceived).not.toHaveBeenCalled();
  });

  // spec: proofs/arch/artifact-frame/isolation.md#^iso-t-desktop-header-sessions
  it("rewrites headers in artifact and URL-artifact partitions only", async () => {
    const main = await loadAppModule();
    await new main.App().start();
    const win = mockState.MockBrowserWindow.instances[0]!;
    win.webContents.getURL.mockReturnValue("http://localhost:32848/?mode=electron");
    const artifact = attachWebview("tv-artifact:01J00000000000000000000000").webPreferences.partition!;
    attachWebview("tv-url-artifact");
    attachWebview(undefined);

    const installed = (partition: string) => mockState.partitionSessions.get(partition)!.webRequest.onHeadersReceived.mock.calls;
    expect(installed("persist:webview-fallback")).toEqual([]);
    expect(mockState.session.defaultSession.webRequest.onHeadersReceived).not.toHaveBeenCalled();
    for (const partition of [artifact, "persist:url-artifacts"]) {
      expect(installed(partition)).toHaveLength(1);
      const [filter, listener] = installed(partition)[0]!;
      expect(filter).toEqual({ urls: ["*://*/artifact/*"] });
      const answer = (url: string, responseHeaders: Record<string, string[]>) => {
        let response: unknown;
        (listener as HeadersListener)({ url, responseHeaders }, (value) => { response = value; });
        return response;
      };
      expect(answer("http://localhost:32848/artifact/01J/index.html", {
        "X-TV-Version": ["1"], "Content-Security-Policy": ["sandbox allow-scripts"], "Referrer-Policy": ["no-referrer"],
      })).toEqual({ responseHeaders: { "X-TV-Version": ["1"], "Referrer-Policy": ["strict-origin-when-cross-origin"] } });
      expect(answer("http://localhost:32848/artifact/01J/index.html", { "Content-Security-Policy": ["sandbox"] })).toEqual({});
    }
  });

  // spec: proofs/arch/desktop/artifact-partitions.md#^dp-t-reaper-schedule
  it("starts and stops the reaper from the window's page events", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      fsState.files.set("/tmp/television-test-userdata/connection.json", JSON.stringify({ serverURL: "http://localhost:32848", token: "tok" }));
      const signals: AbortSignal[] = [];
      let hold = false;
      fetchMock.mockImplementation(async (input, init) => {
        if (String(input).endsWith("/artifacts")) {
          if (init?.signal) signals.push(init.signal);
          if (hold) return await new Promise<Response>(() => {});
          return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
        }
        return new Response(JSON.stringify(connectCheckBody), { status: 200 });
      });
      const main = await loadAppModule();
      await new main.App().start();
      await vi.waitFor(() => expect(mockState.MockBrowserWindow.instances[0]!.loadURL).toHaveBeenCalled());
      const win = mockState.MockBrowserWindow.instances[0]!;
      const listener = (name: string) => {
        const call = win.webContents.on.mock.calls.find(([event]) => event === name);
        if (!call) throw new Error(`No ${name} listener`);
        return call[1] as (...args: unknown[]) => void;
      };
      const reapings = () => fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/artifacts")).length;
      const load = async (url: string) => {
        win.webContents.getURL.mockReturnValue(url);
        listener("did-finish-load")();
        await vi.advanceTimersByTimeAsync(0);
      };
      const navigate = (isSameDocument = false, isMainFrame = true) =>
        listener("did-start-navigation")({ isMainFrame, isSameDocument, url: "http://localhost:32848/" });
      const anHour = () => vi.advanceTimersByTimeAsync(60 * 60_000);

      await load("http://localhost:32848/?mode=electron&desktopAppVersion=0.1.170");
      expect(reapings()).toBe(1);
      await anHour();
      expect(reapings()).toBe(2);
      // Same-document and subframe navigations leave it running.
      navigate(true);
      navigate(false, false);
      await anHour();
      expect(reapings()).toBe(3);

      // A navigation of the main frame stops it, and aborts a request in flight.
      hold = true;
      await anHour();
      expect(reapings()).toBe(4);
      navigate();
      expect(signals.at(-1)!.aborted).toBe(true);
      hold = false;
      await anHour();
      await anHour();
      expect(reapings()).toBe(4);

      // Loads of any page but the connection's stop it.
      for (const url of ["http://elsewhere.example/", "file:///Applications/Television.app/connect.html", "http://localhost:4173/fixture.html"]) {
        await load("http://localhost:32848/?mode=electron");
        const before = reapings();
        await load(url);
        await anHour();
        expect({ url, reapings: reapings() - before }).toEqual({ url, reapings: 0 });
      }

      // Disconnect from Server stops it, aborting a request in flight.
      let before = reapings();
      hold = true;
      await load("http://localhost:32848/?mode=electron");
      expect(reapings()).toBe(before + 1);
      await mockState.ipcHandlers.get(DISCONNECT_CHANNEL)!(fromWindow());
      expect(signals.at(-1)!.aborted).toBe(true);
      hold = false;
      await anHour();
      await anHour();
      expect(reapings()).toBe(before + 1);
      // Without a saved connection, the server's page never reaps.
      await load("http://localhost:32848/?mode=electron");
      await anHour();
      expect(reapings()).toBe(before + 1);

      // Connecting again restarts it on the server's page; closing the window
      // stops it, aborting a request in flight.
      const reconnected = await mockState.ipcHandlers.get("television:connect")!(fromWindow(), "localhost:32848/?token=tok") as { ok: boolean; attempt: number };
      expect(reconnected.ok).toBe(true);
      await mockState.ipcHandlers.get(COMPLETE_CONNECT_CHANNEL)!(fromWindow(), reconnected.attempt);
      before = reapings();
      hold = true;
      await load("http://localhost:32848/?mode=electron");
      expect(reapings()).toBe(before + 1);
      mockState.windowHandlers.get("closed")!();
      expect(signals.at(-1)!.aborted).toBe(true);
      hold = false;
      await anHour();
      await anHour();
      expect(reapings()).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });

});
