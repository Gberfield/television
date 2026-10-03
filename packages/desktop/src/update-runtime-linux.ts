import { app } from "electron";
import { startLinuxUpdater, type LinuxUpdateRuntime } from "./linux-updater.ts";

declare const __TV_LINUX_UPDATE_URL__: string | undefined;

export function startDesktopUpdates(onDownloaded: (version: string) => void): LinuxUpdateRuntime {
  const runtime = startLinuxUpdater({
    packaged: app.isPackaged,
    appImage: process.env.APPIMAGE,
    feedURL: typeof __TV_LINUX_UPDATE_URL__ === "string" ? __TV_LINUX_UPDATE_URL__ : undefined,
    onDownloaded,
    onError: error => console.warn("Television could not check for a Linux update:", error instanceof Error ? error.message : "update unavailable"),
  });
  app.on("before-quit", () => runtime.dispose());
  return runtime;
}
