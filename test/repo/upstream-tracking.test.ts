import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const load = () => import("../../scripts/upstream-tracking.mjs");
const sha = "a".repeat(40);
describe("downstream upstream tracking", () => {
  it("detects Television against integrated ancestry, not the observed SHA", async () => {
    const { pendingUpdates } = await load();
    expect(pendingUpdates({ television: { integrated_sha: "b".repeat(40), observed_sha: sha }, omarchy: { baseline_sha: sha, stable_tag: "v4.0.4", default_branch: "quattro" } }, { television: sha, omarchy: { sha, tag: "v4.0.4", default_branch: "quattro", relevant: [] } }, [])).toEqual(["television"]);
  });
  it("detects stable releases, relevant compatibility changes and default branch drift", async () => {
    const { pendingUpdates } = await load();
    const manifest = { television: { integrated_sha: sha }, omarchy: { baseline_sha: sha, stable_tag: "v4.0.4", default_branch: "quattro" } };
    for (const update of [{ tag: "v4.0.5" }, { relevant: ["default/hypr/monitors.conf"] }, { default_branch: "next" }]) {
      expect(pendingUpdates(manifest, { television: sha, omarchy: { sha, tag: "v4.0.4", default_branch: "quattro", relevant: [], ...update } }, [])).toEqual(["omarchy"]);
    }
  });
  it("keeps one pending draft per track and preserves human edits", async () => {
    const { pendingUpdates, branchAvailable } = await load();
    expect(pendingUpdates({ television: { integrated_sha: "b".repeat(40) }, omarchy: { stable_tag: "v4.0.4", default_branch: "quattro" } }, { television: sha, omarchy: { sha, tag: "v4.0.4", default_branch: "quattro", relevant: [] } }, [{ head: { ref: "sync/television-old", repo: { full_name: "Gberfield/television" } } }])).toEqual([]);
    expect(branchAvailable({ sha: "human-head" })).toBe(false);
    expect(branchAvailable(null)).toBe(true);
  });
  it("recognizes Omarchy themes, Hyprland and package/launcher changes", async () => {
    const { relevantOmarchyPath } = await load();
    for (const path of ["themes/tokyo-night/colors.toml", "default/hypr/input.conf", "install/packages.sh", "bin/omarchy-theme-set", "bin/omarchy-launch-browser"]) expect(relevantOmarchyPath(path)).toBe(true);
    expect(relevantOmarchyPath("README.md")).toBe(false);
  });
  it("preserves fork versions and merged dependency edits", async () => {
    const { preserveVersions } = await load();
    const root = mkdtempSync(join(tmpdir(), "tv-tracker-"));
    try {
      execFileSync("git", ["init", "-q", root]);
      execFileSync("git", ["-C", root, "config", "user.name", "Synthetic"]);
      execFileSync("git", ["-C", root, "config", "user.email", "synthetic@example.invalid"]);
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.4.23", dependencies: {} }));
      writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "1.4.23", packages: { "": { version: "1.4.23" } } }));
      execFileSync("git", ["-C", root, "add", "."]); execFileSync("git", ["-C", root, "commit", "-qm", "base"]);
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.4.26", dependencies: { added: "1.0.0" } }));
      preserveVersions(root, "HEAD");
      expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8"))).toEqual({ version: "1.4.23", dependencies: { added: "1.0.0" } });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

import { parse as parseYaml } from "yaml";
const workflow = (name: string) => parseYaml(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
describe("sync workflow trust boundaries", () => {
  it("separates read-only discovery from the only PR writer", () => {
    const config = workflow("upstream-tracking");
    expect(config.on.schedule).toHaveLength(1);
    expect(config.on.workflow_dispatch).toBeNull();
    expect(config.permissions).toEqual({ contents: "read" });
    expect(config.jobs.detect.permissions).toBeUndefined();
    expect(config.jobs.prepare.permissions).toEqual({ contents: "write", "pull-requests": "write" });
    expect(JSON.stringify(config.jobs.prepare)).not.toMatch(/npm|secrets\./);
    expect(config.jobs.prepare.steps[0].with["persist-credentials"]).toBe(false);
  });
  it("validates draft sync branches with actual tests and no write/deploy capability", () => {
    const config = workflow("sync-validation");
    expect(config.on.push.branches).toEqual(["sync/**"]);
    expect(config.permissions).toEqual({ contents: "read" });
    expect(config.jobs["attest-write"]).toBeUndefined();
    expect(config.jobs["attest-check"].outputs.skip).toBe("false");
    expect(JSON.stringify(config)).not.toMatch(/secrets\.|contents":"write|draft == false/);
    for (const job of Object.values(config.jobs) as { steps: { uses?: string; with?: Record<string, unknown> }[] }[]) {
      for (const step of job.steps) if (step.uses?.startsWith("actions/checkout@")) expect(step.with?.["persist-credentials"]).toBe(false);
    }
    for (const name of ["publish", "desktop-build", "desktop-candidate-build"]) expect(JSON.stringify(workflow(name))).toContain("github.repository == 'telepath-computer/television'");
  });
});

describe("synthetic ancestry and conflicts", () => {
  it.each(["clean", "conflict", "symlink"])("keeps ancestry or reports unsafe integration (%s)", async (mode) => {
    const conflict = mode === "conflict";
    const { mergeCandidate } = await load();
    const root = mkdtempSync(join(tmpdir(), "tv-merge-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    try {
      execFileSync("git", ["init", "-q", root]);
      git("config", "user.name", "Synthetic"); git("config", "user.email", "synthetic@example.invalid");
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.4.23" }));
      writeFileSync(join(root, "package-lock.json"), JSON.stringify({ version: "1.4.23", packages: { "": { version: "1.4.23" } } }));
      writeFileSync(join(root, "content.txt"), "original\n"); git("add", "."); git("commit", "-qm", "base");
      git("checkout", "-qb", "upstream"); writeFileSync(join(root, "content.txt"), "upstream\n");
      writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.4.26" }));
      if (mode === "symlink") {
        rmSync(join(root, "package.json")); const { symlinkSync } = await import("node:fs"); symlinkSync("package-lock.json", join(root, "package.json"));
      }
      git("add", "."); git("commit", "-qm", "upstream"); const upstream = git("rev-parse", "HEAD");
      git("checkout", "-qb", "downstream", "HEAD~1");
      writeFileSync(join(root, conflict ? "content.txt" : "linux.txt"), "downstream\n"); git("add", "."); git("commit", "-qm", "downstream"); const base = git("rev-parse", "HEAD");
      const result = mergeCandidate(root, base, upstream);
      expect(result.integrated).toBe(mode === "clean");
      expect(result.conflicts).toEqual(conflict ? ["content.txt"] : mode === "symlink" ? ["review-required: invalid, nonregular or escaping manifest/lockfile"] : []);
      if (mode === "symlink") { expect(git("rev-parse", "HEAD")).toBe(base); expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("1.4.23"); }
      else if (conflict) { expect(git("rev-parse", "HEAD")).toBe(base); expect(readFileSync(join(root, "content.txt"), "utf8")).toBe("downstream\n"); }
      else {
        git("add", "."); git("commit", "-qm", "merge");
        expect(git("show", "-s", "--format=%P")).toBe(`${base} ${upstream}`);
        expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("1.4.23");
        expect(readFileSync(join(root, "linux.txt"), "utf8")).toBe("downstream\n");
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("review regressions", () => {
  it("uses stable release and branch identity in Omarchy proposal branches", async () => {
    const { syncBranch } = await load();
    const first = { sha, stable_sha: "b".repeat(40), tag: "v4.0.4", default_branch: "quattro" };
    expect(syncBranch("omarchy", first)).not.toBe(syncBranch("omarchy", { ...first, tag: "v4.0.5" }));
    expect(syncBranch("omarchy", first)).not.toBe(syncBranch("omarchy", { ...first, default_branch: "next" }));
    expect(syncBranch("omarchy", first)).toBe(syncBranch("omarchy", first));
  });
  it("requires review for Linux build/feed selectors", async () => {
    const { protectedIntegrationPath } = await load();
    for (const file of ["packages/desktop/build.mjs", "packages/desktop/scripts/linux-build.mjs", "packages/desktop/linux/feed.json", ".github/workflows/publish.yml", "specs/arch/updates/update-channel.json"]) expect(protectedIntegrationPath(file)).toBe(true);
    expect(protectedIntegrationPath("packages/view-markdown/src/editor.ts")).toBe(false);
  });
  it("retains updated nested dependency versions and refuses symlinked manifests", async () => {
    const { preserveVersions } = await load();
    const root = mkdtempSync(join(tmpdir(), "tv-dependency-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args]);
    try {
      execFileSync("git", ["init", "-q", root]); git("config", "user.name", "Synthetic"); git("config", "user.email", "synthetic@example.invalid");
      writeFileSync(join(root, "package.json"), '{"version":"1.4.23"}');
      const old = { version: "1.4.23", packages: { "": { version: "1.4.23" }, "packages/cli/node_modules/foo": { version: "1.0.0", resolved: "foo-1.0.0.tgz" } } };
      writeFileSync(join(root, "package-lock.json"), JSON.stringify(old)); git("add", "."); git("commit", "-qm", "base");
      const current = structuredClone(old); current.packages["packages/cli/node_modules/foo"] = { version: "2.0.0", resolved: "foo-2.0.0.tgz" };
      writeFileSync(join(root, "package-lock.json"), JSON.stringify(current));
      preserveVersions(root, "HEAD");
      expect(JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages["packages/cli/node_modules/foo"]).toEqual({ version: "2.0.0", resolved: "foo-2.0.0.tgz" });
      rmSync(join(root, "package.json"));
      const { symlinkSync } = await import("node:fs"); symlinkSync("package-lock.json", join(root, "package.json"));
      expect(() => preserveVersions(root, "HEAD")).toThrow(/regular|symlink/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});


describe("Omarchy stable commit identity", () => {
  it("reports a stable tag moved to a different commit", async () => {
    const { pendingUpdates } = await load();
    expect(pendingUpdates({ television: { integrated_sha: sha }, omarchy: { stable_tag: "v4.0.4", stable_sha: sha, default_branch: "quattro" } }, { television: sha, omarchy: { sha, stable_sha: "b".repeat(40), tag: "v4.0.4", default_branch: "quattro", relevant: [] } }, [])).toEqual(["omarchy"]);
  });
});
