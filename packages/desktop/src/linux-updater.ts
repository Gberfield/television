import { AppImageUpdater } from "electron-updater";
import { isDesktopUpdateVersion } from "./desktop-update.ts";

interface LinuxUpdateClient {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, callback: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<{ downloadPromise?: Promise<unknown> | null } | null>;
  quitAndInstall(silent: boolean, forceRunAfter: boolean): void;
}

export interface LinuxUpdaterOptions {
  packaged: boolean;
  appImage?: string;
  feedURL?: string;
  onDownloaded(version: string): void;
  onError?(error: unknown): void;
  createUpdater?(url: string): LinuxUpdateClient;
}

export interface LinuxUpdateRuntime {
  restartAndInstall(): void;
  dispose(): void;
}

const UPDATE_CHECK_INTERVAL_MS = 14_400_000;

export function isLinuxUpdateFeed(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** The production download mechanism is injected only at its external seam. */
export function startLinuxUpdater(options: LinuxUpdaterOptions): LinuxUpdateRuntime {
  const idle: LinuxUpdateRuntime = { restartAndInstall() {}, dispose() {} };
  if (!options.packaged || !options.appImage || !isLinuxUpdateFeed(options.feedURL)) return idle;

  const updater = options.createUpdater?.(options.feedURL)
    ?? new AppImageUpdater({ provider: "generic", url: options.feedURL });
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  let downloaded: string | null = null;
  let disposed = false;
  let checking = false;
  const reportError = (error: unknown): void => { if (!disposed) options.onError?.(error); };
  updater.on("error", reportError);
  updater.on("update-downloaded", (info: { version?: unknown }) => {
    if (disposed || !isDesktopUpdateVersion(info?.version) || info.version === downloaded) return;
    downloaded = info.version;
    options.onDownloaded(downloaded);
  });
  const check = async (): Promise<void> => {
    if (disposed || checking) return;
    checking = true;
    try {
      const result = await updater.checkForUpdates();
      // electron-updater starts autoDownload independently of the metadata
      // check. Consume its failure too, including checksum/network errors.
      await result?.downloadPromise;
    }
    catch (error) { reportError(error); }
    finally { checking = false; }
  };
  const initial = setTimeout(() => void check(), 0);
  const recurring = setInterval(() => void check(), UPDATE_CHECK_INTERVAL_MS);
  initial.unref?.();
  recurring.unref?.();
  return {
    restartAndInstall(): void { if (!disposed && downloaded !== null) updater.quitAndInstall(false, true); },
    dispose(): void {
      disposed = true;
      clearTimeout(initial);
      clearInterval(recurring);
    },
  };
}
