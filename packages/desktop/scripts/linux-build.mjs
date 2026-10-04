#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, Platform, Arch } from "electron-builder";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(packageDir, "../..");
const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
const output = path.resolve(process.env.TV_LINUX_OUTPUT_DIR ?? path.join(packageDir, "release"));
if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Build this distribution on x86_64 Linux");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} exited ${result.status}`);
};
function normalizePayloadModes(directory) {
  chmodSync(directory, 0o755);
  for (const name of readdirSync(directory)) {
    const file = path.join(directory, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) normalizePayloadModes(file);
    else chmodSync(file, stat.mode & 0o111 ? 0o755 : 0o644);
  }
}
const stage = mkdtempSync(path.join(os.tmpdir(), "television-linux-stage-"));
mkdirSync(output, { recursive: true });
try {
  run(process.execPath, [path.join(packageDir, "build.mjs")], { env: {
    ...process.env, TV_DESKTOP_TARGET: "linux", TV_DESKTOP_OUTPUT_DIR: path.join(stage, "dist"),
    TV_DESKTOP_INVENTORY_DIR: path.join(stage, "inventory"),
  } });
  cpSync(path.join(packageDir, "assets"), path.join(stage, "assets"), { recursive: true });
  copyFileSync(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));
  writeFileSync(path.join(stage, "package.json"), JSON.stringify({
    name: "television", productName: "Television", version: manifest.version,
    description: "Visual artifacts for your personal agent", homepage: manifest.homepage,
    author: manifest.author, license: manifest.license, main: "dist/electron.cjs",
    desktopName: "computer.telepath.television.desktop",
  }, null, 2) + "\n");
  const require = createRequire(path.join(root, "package.json"));
  const electronDist = path.join(path.dirname(require.resolve("electron/package.json")), "dist");
  if (!existsSync(path.join(electronDist, "electron"))) {
    throw new Error("Install the exact Electron runtime first: node node_modules/electron/install.js");
  }
  const feed = process.env.TV_LINUX_UPDATE_URL;
  await build({
    targets: Platform.LINUX.createTarget(["dir", "AppImage"], Arch.x64),
    config: {
      appId: "computer.telepath.television", productName: "Television",
      electronVersion: manifest.devDependencies.electron, electronDist,
      directories: { app: stage, output, buildResources: path.join(packageDir, "assets") },
      files: ["dist/**/*", "assets/**/*", "LICENSE", "package.json"],
      asar: true, npmRebuild: false,
      artifactName: "Television-${version}-linux-${arch}.${ext}",
      publish: feed ? { provider: "generic", url: feed } : null,
      appImage: { executableArgs: [] },
      linux: {
        syncDesktopName: true,
        executableName: "television", icon: path.join(packageDir, "assets/icon.png"),
        category: "Utility", desktop: { entry: { StartupWMClass: "computer.telepath.television" } },
      },
      afterPack: async ({ appOutDir }) => {
        for (const name of ["AppRun", "television-launcher", "install-television"]) {
          copyFileSync(path.join(packageDir, "linux", name), path.join(appOutDir, name));
          chmodSync(path.join(appOutDir, name), 0o755);
        }
        copyFileSync(path.join(packageDir, "assets/icon.png"), path.join(appOutDir, "television.png"));
        copyFileSync(path.join(root, "LICENSE"), path.join(appOutDir, "LICENSE.television.txt"));
        copyFileSync(path.join(stage, "dist/THIRD-PARTY-NOTICES.txt"), path.join(appOutDir, "THIRD-PARTY-NOTICES.txt"));
        copyFileSync(path.join(packageDir, "linux/README.md"), path.join(appOutDir, "README-LINUX.md"));
        copyFileSync(path.join(packageDir, "linux/Install Television.desktop"), path.join(appOutDir, "Install Television.desktop"));
        chmodSync(path.join(appOutDir, "Install Television.desktop"), 0o755);
        normalizePayloadModes(appOutDir);
      },
    },
  });
  const portableName = `Television-${manifest.version}-linux-x64`;
  const portable = path.join(output, `${portableName}.tar.gz`);
  // Use a top-level directory and preserve executable modes and symlinks.
  run("tar", ["--transform", `s,^linux-unpacked,${portableName},`, "-czf", portable, "-C", output, "linux-unpacked"]);
  const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
  const archiveSHA = digest(portable);
  const pkgbuild = readFileSync(path.join(packageDir, "linux/PKGBUILD.in"), "utf8")
    .replaceAll("@VERSION@", manifest.version).replaceAll("@ARCHIVE@", path.basename(portable))
    .replaceAll("@SHA256@", archiveSHA).replaceAll("@DIRECTORY@", portableName);
  const archDir = path.join(output, "arch"); mkdirSync(archDir, { recursive: true });
  writeFileSync(path.join(archDir, "PKGBUILD"), pkgbuild);
  copyFileSync(path.join(packageDir, "linux/computer.telepath.television.desktop"), path.join(archDir, "computer.telepath.television.desktop"));
  copyFileSync(portable, path.join(archDir, path.basename(portable)));
  const artifacts = readdirSync(output).filter(name => /\.(AppImage|tar\.gz|yml)$/.test(name));
  writeFileSync(path.join(output, "SHA256SUMS"), artifacts.map(name => `${digest(path.join(output, name))}  ${name}`).join("\n") + "\n");
  writeFileSync(path.join(output, "build-info.json"), JSON.stringify({
    product: "Television", version: manifest.version, platform: "linux", arch: "x64",
    electron: manifest.devDependencies.electron, builder: manifest.devDependencies["electron-builder"],
    updater: manifest.dependencies["electron-updater"], updateFeedConfigured: Boolean(feed),
    appId: "computer.telepath.television", artifacts,
  }, null, 2) + "\n");
  console.log(`Linux distribution ready: ${output}`);
} finally { rmSync(stage, { recursive: true, force: true }); }
