import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporary: string[] = [];
afterEach(() => { for (const p of temporary.splice(0)) rmSync(p, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "tv linux package ")); temporary.push(root);
  const app = path.join(root, "Television portable"); mkdirSync(app);
  const capture = path.join(root, "args");
  writeFileSync(path.join(app, "television"), '#!/bin/sh\nprintf "%s\\0" "$@" > "$TV_CAPTURE"\n', { mode: 0o755 });
  const env = { ...process.env, WAYLAND_DISPLAY: "", TV_CAPTURE: capture, XDG_DATA_HOME: path.join(root, "user data") };
  return { root, app, capture, env };
}

describe.skipIf(process.platform !== "linux")("Linux distribution scripts", () => {
  it.each(["", "wayland-1"])("launches the selected backend for WAYLAND_DISPLAY=%s and preserves arguments", display => {
    const { app, capture, env } = fixture();
    const launcher = path.resolve(import.meta.dirname, "../linux/television-launcher");
    expect(existsSync(launcher)).toBe(true);
    copyFileSync(launcher, path.join(app, "television-launcher"));
    const result = spawnSync("bash", [path.join(app, "television-launcher"), "--user-data-dir=/tmp/profile with spaces", "literal $(false)"], { env: { ...env, WAYLAND_DISPLAY: display }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(capture, "utf8").split("\0").filter(Boolean)).toEqual([
      `--ozone-platform=${display ? "wayland" : "x11"}`, "--user-data-dir=/tmp/profile with spaces", "literal $(false)",
    ]);
  });
  it("preserves an explicitly supplied Ozone platform", () => {
    const { app, capture, env } = fixture();
    copyFileSync(path.resolve(import.meta.dirname, "../linux/television-launcher"), path.join(app, "television-launcher"));
    expect(spawnSync("bash", [path.join(app, "television-launcher"), "--ozone-platform=x11", "--version"], { env: { ...env, WAYLAND_DISPLAY: "wayland-1" } }).status).toBe(0);
    expect(readFileSync(capture, "utf8").split("\0").filter(Boolean)).toEqual(["--ozone-platform=x11", "--version"]);
  });
  it("installs into a user prefix containing spaces and creates a valid desktop launcher", () => {
    const { app, root, env } = fixture();
    const installer = path.resolve(import.meta.dirname, "../linux/install-television");
    expect(existsSync(installer)).toBe(true);
    copyFileSync(installer, path.join(app, "install-television"));
    copyFileSync(path.resolve(import.meta.dirname, "../linux/television-launcher"), path.join(app, "television-launcher"));
    mkdirSync(path.join(app, "resources"));
    writeFileSync(path.join(app, "resources/app.asar"), "fixture");
    writeFileSync(path.join(app, "television.png"), "fixture");
    const prefix = path.join(root, "installed application");
    const result = spawnSync("bash", [path.join(app, "install-television"), "--prefix", prefix], { env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const entry = path.join(env.XDG_DATA_HOME, "applications/computer.telepath.television.desktop");
    expect(existsSync(path.join(prefix, "television"))).toBe(true);
    expect(readFileSync(entry, "utf8")).toContain(`Exec=bash "${prefix}/television-launcher"`);
    expect(readFileSync(entry, "utf8")).not.toContain("--no-sandbox");
    expect(spawnSync("desktop-file-validate", [entry], { encoding: "utf8" }).status).toBe(0);
  });
  it("refuses to overwrite an unrelated nonempty installation folder", () => {
    const { app, root, env } = fixture();
    copyFileSync(path.resolve(import.meta.dirname, "../linux/install-television"), path.join(app, "install-television"));
    mkdirSync(path.join(app, "resources")); writeFileSync(path.join(app, "resources/app.asar"), "fixture");
    writeFileSync(path.join(app, "television.png"), "fixture");
    const prefix = path.join(root, "unrelated"); mkdirSync(prefix);
    writeFileSync(path.join(prefix, "keep.txt"), "existing user work");
    const result = spawnSync("bash", [path.join(app, "install-television"), "--prefix", prefix], { env, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(readFileSync(path.join(prefix, "keep.txt"), "utf8")).toBe("existing user work");
    expect(existsSync(path.join(prefix, "television"))).toBe(false);
  });
});
