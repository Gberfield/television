import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "linux")("Optional Omarchy theme integration", () => {
  it("converts palettes and recovers missing files and deferred activation", () => {
    const tests = path.resolve(import.meta.dirname, "../../../contrib/omarchy-theme/tests");
    const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", tests, "-v"], {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      timeout: 25_000,
    });
    expect(result.error, "Python 3.11+ must be available on the Linux test host").toBeUndefined();
    expect(result.status, result.stderr + result.stdout).toBe(0);
  });
});
