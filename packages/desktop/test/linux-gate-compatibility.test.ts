// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, html } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";

describe("Linux compatibility with upstream's Mac upgrade gate", () => {
  it("replaces only the Mac instructions and preserves Lit's live update/restart range", async () => {
    const { installLinuxGateCompatibility } = await import("../src/linux-gate-compatibility.ts");
    const host = document.createElement("div");
    document.body.append(host);
    const stop = installLinuxGateCompatibility(document);
    const paint = (downloaded: boolean) => render(html`<div class="desktop-upgrade-gate">
      <div class="upgrade-gate-body" data-testid="upgrade-gate-body">${unsafeHTML(downloaded
        ? '<h1>Desktop app update required</h1><p>The new version has already downloaded.</p>'
        : '<h1>Desktop app update required</h1><p>Update <a href="https://dl.todesktop.com/260923p52umxx/mac/dmg/arm64">Television for Mac</a>.</p>')}</div>
      ${downloaded ? html`<button>Restart to update</button>` : null}</div>`, host);
    paint(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.textContent).toContain("Linux");
    expect(host.querySelector('a[href*="todesktop"]')).toBeNull();
    paint(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.textContent).toContain("already downloaded");
    expect(host.querySelector("button")?.textContent).toBe("Restart to update");
    paint(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(host.textContent).toContain("Linux");
    stop(); host.remove();
  });
});
