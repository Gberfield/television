import { type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../../test/helpers/playwright.ts";
import { launchProductServer, type ProductServer } from "../../../../test/helpers/product-server.ts";
import { APPLICATION_SHELL_STATES, waitForApplicationRender } from "../../../../test/helpers/application-readiness.ts";
import { artifactNavigationStorageKey } from "../../src/services/artifact-navigation-state.ts";
import { configureTestMotion, pickChannelByName } from "./helpers.ts";

type NavigationRecord = {
  v: 1;
  entries: Array<{ url: string }>;
  cursor: number;
  lastWritten: number;
};

function html(body: string): string {
  return `<!doctype html><html><head><style>
    body { font-family: sans-serif; margin: 0; padding: 16px; }
  </style></head><body>${body}</body></html>`;
}

async function defaultChannel(server: ProductServer): Promise<{ id: string; name: string }> {
  const response = await fetch(`${server.serverURL}/channels`);
  expect(response.status).toBe(200);
  const { channels } = (await response.json()) as { channels: Array<{ id: string; name: string }> };
  const channel = channels[0];
  if (!channel) throw new Error("Product server did not create a default channel");
  return channel;
}

async function channelID(server: ProductServer): Promise<string> {
  return (await defaultChannel(server)).id;
}

async function createChannel(server: ProductServer, name: string): Promise<string> {
  const response = await fetch(`${server.serverURL}/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { channel: { id: string } };
  return body.channel.id;
}

async function createPathArtifact(server: ProductServer, filePath: string, title = "Artifact", targetChannelID?: string): Promise<string> {
  const response = await fetch(`${server.serverURL}/artifacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "path", title, path: filePath, channelID: targetChannelID ?? await channelID(server) }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { artifact: { id: string } };
  return body.artifact.id;
}

async function openApp(page: Page, server: ProductServer, baseURL: string | undefined): Promise<void> {
  if (!baseURL) throw new Error("Expected Playwright baseURL");
  const appBaseURL = await server.appURL(baseURL);
  await page.goto(`${appBaseURL}/packages/web/src/index.html?serverURL=${encodeURIComponent(appBaseURL)}`);
  await waitForApplicationRender(page, APPLICATION_SHELL_STATES, 15_000);
  await configureTestMotion(page);
}

async function navigationRecord(page: Page, artifactID: string): Promise<NavigationRecord | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, artifactNavigationStorageKey(artifactID));
}

async function activateFrameLink(page: Page, selector: string): Promise<void> {
  await page.frameLocator(".artifact-view iframe.artifact-content").first().locator(selector).click();
}


test.describe("real-stack browser navigable history", () => {
  let server: ProductServer | null;

  test.beforeEach(async () => {
    server = await launchProductServer();
  });

  test.afterEach(async () => {
    await server?.dispose();
    server = null;
  });

  test("channel switch preserves browser iframe navigation state", async ({ page, baseURL }) => {
    if (!server) throw new Error("Product server was not started");
    const { id: defaultChannelID, name: defaultChannelName } = await defaultChannel(server);
    await createChannel(server, "Other Channel");
    const siteDir = path.join(server.home, "channel-switch-site");
    mkdirSync(siteDir, { recursive: true });
    writeFileSync(path.join(siteDir, "index.html"), html(`
      <h1>Index</h1>
      <a id="page1" href="page1.html">Page 1</a>
    `));
    writeFileSync(path.join(siteDir, "page1.html"), html(`
      <h1>Page 1</h1>
      <a id="page2" href="page2.html">Page 2</a>
    `));
    writeFileSync(path.join(siteDir, "page2.html"), html(`<h1>Page 2</h1>`));
    const artifactID = await createPathArtifact(server, `${siteDir}${path.sep}`, "Channel Switch Site", defaultChannelID);

    await openApp(page, server, baseURL);
    const frame = page.frameLocator(".artifact-view iframe.artifact-content").first();
    const back = page.locator(".artifact-view button[aria-label='Back']");
    const forward = page.locator(".artifact-view button[aria-label='Forward']");
    await expect(frame.locator("h1")).toHaveText("Index");

    await activateFrameLink(page, "#page1");
    await expect(frame.locator("h1")).toHaveText("Page 1");
    await activateFrameLink(page, "#page2");
    await expect(frame.locator("h1")).toHaveText("Page 2");
    await back.click();
    await expect(frame.locator("h1")).toHaveText("Page 1");
    await expect.poll(() => navigationRecord(page, artifactID)).toMatchObject({
      entries: [
        { url: `/artifact/${artifactID}/page1.html` },
        { url: `/artifact/${artifactID}/page2.html` },
      ],
      cursor: 0,
    });
    await expect(forward).toBeEnabled();

    await pickChannelByName(page, "Other Channel");
    await expect(page.locator(".artifact-view")).toHaveCount(0);

    await pickChannelByName(page, defaultChannelName);
    await expect(page.locator(".artifact-view iframe.artifact-content")).toHaveAttribute(
      "src",
      new RegExp(`/artifact/${artifactID}/page1\\.html$`),
    );
    await expect(frame.locator("h1")).toHaveText("Page 1");
    await expect.poll(() => navigationRecord(page, artifactID)).toMatchObject({
      entries: [
        { url: `/artifact/${artifactID}/page1.html` },
        { url: `/artifact/${artifactID}/page2.html` },
      ],
      cursor: 0,
    });
    await expect(back).toBeEnabled();
    await expect(forward).toBeEnabled();

    await forward.click();
    await expect(frame.locator("h1")).toHaveText("Page 2");
    await expect.poll(() => navigationRecord(page, artifactID)).toMatchObject({ cursor: 1 });
  });

  test.describe("external browser navigation", () => {

  // spec: proofs/product/artifact-navigation.md#^ac-external-normal
  test("ordinary external HTML links open outside with the document and history unchanged", async ({ page, baseURL }) => {
    if (!server) throw new Error("Product server was not started");
    const destination = await launchProductServer();
    try {
      const externalURL = `${destination.serverURL}/health`;
      const siteDir = path.join(server.home, "external-site");
      mkdirSync(siteDir, { recursive: true });
      writeFileSync(path.join(siteDir, "index.html"), html(`<h1>Index</h1><a id="external" href="${externalURL}">External</a>`));
      const artifactID = await createPathArtifact(server, `${siteDir}${path.sep}`, "External Site");
      await openApp(page, server, baseURL);
      const frame = page.frameLocator(".artifact-view iframe.artifact-content").first();
      await expect(frame.locator("h1")).toHaveText("Index");
      const before = await navigationRecord(page, artifactID);
      const popupPromise = page.waitForEvent("popup");
      await activateFrameLink(page, "#external");
      const popup = await popupPromise;
      await popup.waitForLoadState("domcontentloaded");
      expect(popup.url()).toBe(externalURL);
      await expect(frame.locator("h1")).toHaveText("Index");
      expect(await navigationRecord(page, artifactID)).toEqual(before);
      await popup.close();
    } finally {
      await destination.dispose();
    }
  });
  });

  // spec: proofs/product/artifact-navigation.md#^ac-return-document
  test("return to document skips the browsing trail and clears history", async ({ page, baseURL }) => {
    if (!server) throw new Error("Product server was not started");
    const siteDir = path.join(server.home, "return-site");
    mkdirSync(siteDir, { recursive: true });
    writeFileSync(path.join(siteDir, "index.html"), html('<h1>Original</h1><a id="next" href="two.html">Next</a>'));
    writeFileSync(path.join(siteDir, "two.html"), html('<h1>Second</h1><a id="next" href="three.html">Next</a>'));
    writeFileSync(path.join(siteDir, "three.html"), html('<h1>Third</h1>'));
    const artifactID = await createPathArtifact(server, siteDir, "Return document");
    await openApp(page, server, baseURL);
    const frame = page.frameLocator(".artifact-view iframe.artifact-content").first();
    await activateFrameLink(page, "#next");
    await expect(frame.locator("h1")).toHaveText("Second");
    await activateFrameLink(page, "#next");
    await expect(frame.locator("h1")).toHaveText("Third");
    await page.getByRole("button", { name: "Return to document", exact: true }).click();
    await expect(frame.locator("h1")).toHaveText("Original");
    expect(await navigationRecord(page, artifactID)).toMatchObject({ entries: [], cursor: -1 });
    await expect(page.getByRole("button", { name: "Return to document", exact: true })).toHaveCount(0);
  });

  // spec: proofs/product/artifact-navigation.md#^ac-markdown-reading-position
  test("return to Markdown restores its reading position through the real host", async ({ page, baseURL }) => {
    if (!server || !baseURL) throw new Error("Product server was not started");
    const markdownPath = path.join(server.home, "reading-position.md");
    writeFileSync(markdownPath, "# Reading position");
    await createPathArtifact(server, markdownPath, "Reading position");
    const htmlPath = path.join(server.home, "linked.html");
    writeFileSync(htmlPath, html("<h1>Linked document</h1>"));
    const htmlID = await createPathArtifact(server, htmlPath, "Linked document");
    const appURL = await server.appURL(baseURL);
    const localURL = `${appURL}/artifact/${htmlID}/linked.html`;
    const LINK_PARAGRAPH = 20;
    const PARAGRAPH_COUNT = 80;
    writeFileSync(markdownPath, "# Reading position\n\n" + Array.from({ length: PARAGRAPH_COUNT }, (_, index) =>
      `${index === LINK_PARAGRAPH ? `[Local document](${localURL})\n\n` : ""}Paragraph ${index}: Reading position fixture.\n\n`
    ).join(""));
    await openApp(page, server, baseURL);
    const frame = page.frameLocator(".artifact-view iframe.artifact-content[data-content-url]");
    const scroller = frame.locator(".cm-scroller");
    const READING_OFFSET = 600;
    await scroller.evaluate((node, offset) => { node.scrollTop = offset; }, READING_OFFSET);
    const link = frame.locator(`a.cm-md-link[data-href="${localURL}"]`);
    await link.scrollIntoViewIfNeeded();
    const previous = await scroller.evaluate((node) => node.scrollTop);
    expect(previous).toBeGreaterThan(0);
    await link.click();
    await expect(page.getByRole("button", { name: "Return to document", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Return to document", exact: true }).click();
    await expect(frame.locator(".cm-content")).toContainText("Reading position");
    await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBe(previous);
  });

  test("markdown artifact loads and saves through the real source-served browser iframe editor", async ({ page, baseURL }) => {
    if (!server) throw new Error("Product server was not started");
    const markdownPath = path.join(server.home, "note.md");
    writeFileSync(markdownPath, "# Markdown from disk\n\n[external](https://example.com)");
    const artifactID = await createPathArtifact(server, markdownPath, "Markdown");

    await openApp(page, server, baseURL);
    const frame = page.frameLocator(".artifact-view iframe.artifact-content").first();
    await expect(page.locator(".artifact-view iframe.artifact-content")).toHaveAttribute("src", "/views/markdown/");
    await expect(frame.locator(".cm-content")).toContainText("Markdown from disk", { timeout: 15_000 });

    await frame.locator(".cm-content").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type("# Saved from browser");
    await expect.poll(() => readFileSync(markdownPath, "utf8"), { timeout: 15_000 }).toBe("# Saved from browser");

    expect((await navigationRecord(page, artifactID))?.entries ?? []).toEqual([]);
  });
})
