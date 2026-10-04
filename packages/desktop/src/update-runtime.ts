import todesktop from "@todesktop/runtime";
import type { LinuxUpdateRuntime } from "./linux-updater.ts";
import { isDesktopUpdateVersion } from "./desktop-update.ts";

export function startDesktopUpdates(onDownloaded: (version: string) => void): LinuxUpdateRuntime {
  // The Linux distribution build resolves this module to the Linux adapter.
  // Mac and development builds retain ToDesktop's own simulation support.
  const runtime = todesktop;
  runtime.init({ updateReadyAction: { showNotification: "never" } });
  runtime.autoUpdater?.on("update-downloaded", ({ updateInfo }) => {
    if (isDesktopUpdateVersion(updateInfo?.version)) onDownloaded(updateInfo.version);
  });
  return { restartAndInstall: () => runtime.autoUpdater?.restartAndInstall(), dispose() {} };
}
