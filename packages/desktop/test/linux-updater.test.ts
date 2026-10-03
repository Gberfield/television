import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Linux AppImage update adapter", () => {
  afterEach(() => vi.useRealTimers());
  async function setup(overrides: Record<string, unknown> = {}) {
    const { startLinuxUpdater } = await import("../src/linux-updater.ts");
    const client = Object.assign(new EventEmitter(), {
      autoDownload: false, autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn<() => Promise<{ downloadPromise?: Promise<unknown> } | null>>(async () => null), quitAndInstall: vi.fn(),
    });
    const onDownloaded = vi.fn();
    const onError = vi.fn();
    const createUpdater = vi.fn(() => client);
    const runtime = startLinuxUpdater({
      packaged: true, appImage: "/tmp/Television.AppImage", feedURL: "https://releases.example/tv/",
      onDownloaded, onError, createUpdater, ...overrides,
    });
    return { runtime, client, onDownloaded, onError, createUpdater };
  }

  it.each([undefined, "", "http://releases.example/tv", "https://user:pass@example.com/", "garbage"])(
    "does not construct an updater for an absent or unsafe feed %s", async feedURL => {
      const { createUpdater } = await setup({ feedURL });
      expect(createUpdater).not.toHaveBeenCalled();
    });
  it.each([{ packaged: false }, { appImage: undefined }])("does not update non-AppImage builds %j", async condition => {
    expect((await setup(condition)).createUpdater).not.toHaveBeenCalled();
  });
  it("checks immediately, reports each valid downloaded version once and restarts only after download", async () => {
    vi.useFakeTimers();
    const { runtime, client, onDownloaded } = await setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(client.autoDownload).toBe(true);
    expect(client.autoInstallOnAppQuit).toBe(true);
    runtime.restartAndInstall();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
    client.emit("update-downloaded", { version: "1.4.24" });
    client.emit("update-downloaded", { version: "1.4.24" });
    client.emit("update-downloaded", { version: "" });
    expect(onDownloaded.mock.calls).toEqual([["1.4.24"]]);
    runtime.restartAndInstall();
    expect(client.quitAndInstall).toHaveBeenCalledWith(false, true);
    runtime.dispose();
  });
  it("handles a rejected check and tries again four hours later, then stops after disposal", async () => {
    vi.useFakeTimers();
    const { runtime, client, onError } = await setup();
    client.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(client.checkForUpdates).toHaveBeenCalledTimes(2);
    runtime.dispose();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(client.checkForUpdates).toHaveBeenCalledTimes(2);
  });
  it("consumes a separately rejected payload download and permits the next check", async () => {
    vi.useFakeTimers();
    const { runtime, client, onError, onDownloaded } = await setup();
    const failure = new Error("payload checksum failed");
    client.checkForUpdates.mockImplementationOnce(async () => ({ downloadPromise: Promise.reject(failure) }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onDownloaded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(client.checkForUpdates).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });
});
