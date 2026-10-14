import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import WebSocket from "ws";
import {
  DEFAULT_PAGE_GEOMETRY,
  DEFAULT_PAGE_SIZE,
  type ServerEvent,
  type TabPage,
} from "@telepath-computer/television-shared";
import { Server } from "../src/server.ts";
import { createServingStore } from "../../../test/helpers/serving-store.ts";

// Proves the placement contract in specs/arch/layout/index.md#^ly-placement
// (proofs/arch/layout/index.md, "Placing a page before or after an artifact").

function page(
  artifactIds: string[],
  fullScreen = false,
  size: { width: number; height: number } = DEFAULT_PAGE_SIZE,
): TabPage {
  return {
    artifactIds,
    geometry: fullScreen ? { kind: "single", full_screen: true } : { ...DEFAULT_PAGE_GEOMETRY },
    size: { ...size },
  };
}

const MOVED_SIZE = { width: 512.5, height: 640 };

// The receiving channel holds three pages, so a placement at either end and
// between two pages is each visible.
const TARGET_BEFORE = [page(["target-a"]), page(["target-b"]), page(["target-c"])];
const SOURCE_BEFORE = [page(["moved"], true, MOVED_SIZE), page(["source-other"])];

interface Fixture {
  storagePath: string;
  source: string;
  target: string;
}

function createFixture(): Fixture {
  const storagePath = mkdtempSync(path.join(os.tmpdir(), "television-artifact-placement-"));
  const store = createServingStore(storagePath);
  const source = store.createChannel({ id: "source-channel", name: "Source" });
  const target = store.createChannel({ id: "target-channel", name: "Target" });
  for (const [id, channelID] of [
    ["moved", source.id],
    ["source-other", source.id],
    ["target-a", target.id],
    ["target-b", target.id],
    ["target-c", target.id],
  ] as const) {
    store.createArtifact({ id, kind: "url", title: id, channelID, url: `https://example.com/${id}` });
  }
  store.updateChannel({ channelID: source.id, fields: { layout: SOURCE_BEFORE } });
  store.dispose();
  return { storagePath, source: source.id, target: target.id };
}

function channelPath(storagePath: string, channelID: string): string {
  return path.join(storagePath, "state", "channels", `${channelID}.json`);
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function openEvents(server: Server, token: string): Promise<WebSocket> {
  const ws = new WebSocket(`${server.getBaseURL().replace(/^http/, "ws")}/events?token=${encodeURIComponent(token)}`);
  await new Promise<void>((resolve) => ws.on("open", resolve));
  return ws;
}

/** Collects events until a `channel-updated` for `channelID` arrives. */
function eventsUntilChannelUpdate(ws: WebSocket, channelID: string): Promise<ServerEvent[]> {
  return new Promise((resolve, reject) => {
    const events: ServerEvent[] = [];
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`Timed out waiting for channel update: ${channelID}`));
    }, 2_000);
    const onMessage = (data: WebSocket.RawData): void => {
      const event = JSON.parse(String(data)) as ServerEvent;
      events.push(event);
      if (event.type !== "channel-updated" || event.channel.id !== channelID) return;
      clearTimeout(timeout);
      ws.off("message", onMessage);
      resolve(events);
    };
    ws.on("message", onMessage);
  });
}

describe("placing a page before or after an artifact", () => {
  const dirs: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.dispose();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function fixture(): Fixture {
    const created = createFixture();
    dirs.push(created.storagePath);
    return created;
  }

  async function start(fx: Fixture): Promise<{ server: Server; token: string }> {
    const store = createServingStore(fx.storagePath);
    const server = new Server({ store, host: "127.0.0.1", port: 0, auth: true });
    servers.push(server);
    await server.start();
    return { server, token: store.authToken };
  }

  async function stop(server: Server): Promise<void> {
    await server.dispose();
    servers.splice(servers.indexOf(server), 1);
  }

  async function layoutOf(server: Server, token: string, channelID: string): Promise<TabPage[]> {
    const response = await request(server.httpServer).get(`/channels/${channelID}`).set(auth(token)).expect(200);
    return response.body.channel.layout;
  }

  function create(server: Server, token: string, channelID: string, placement: Record<string, string>) {
    return request(server.httpServer)
      .post("/artifacts")
      .set(auth(token))
      .send({ kind: "url", title: "Placed", url: "https://example.com/placed", channelID, ...placement });
  }

  function move(server: Server, token: string, artifactID: string, channelID: string, placement: Record<string, string>) {
    return request(server.httpServer).post(`/artifacts/${artifactID}/move`).set(auth(token)).send({ channelID, ...placement });
  }

  // proofs/arch/layout/index.md#^ly-ac-placement-create
  it.each([
    ["before the first", { before: "target-a" }, 0],
    ["before the last", { before: "target-c" }, 2],
    ["after the first", { after: "target-a" }, 1],
    ["after the last", { after: "target-c" }, 3],
  ])("creates an artifact %s artifact through HTTP, websocket, and restart", async (_case, placement, index) => {
    const fx = fixture();
    const first = await start(fx);
    const ws = await openEvents(first.server, first.token);
    const events = eventsUntilChannelUpdate(ws, fx.target);

    const created = await create(first.server, first.token, fx.target, placement).expect(201);
    const id = created.body.artifact.id as string;
    const expected = [...TARGET_BEFORE];
    expected.splice(index, 0, page([id]));

    const received = await events;
    ws.close();
    expect(received.map((event) => event.type)).toEqual(["artifact-created", "channel-updated"]);
    expect((received[1] as Extract<ServerEvent, { type: "channel-updated" }>).channel.layout).toEqual(expected);
    expect(await layoutOf(first.server, first.token, fx.target)).toEqual(expected);

    await stop(first.server);
    const restarted = await start(fx);
    expect(await layoutOf(restarted.server, restarted.token, fx.target)).toEqual(expected);
  });

  // proofs/arch/layout/index.md#^ly-ac-placement-move
  it.each([
    ["after the first", { after: "target-a" }, 1],
    ["before the first", { before: "target-a" }, 0],
  ])("moves an artifact %s artifact through HTTP, websocket, and restart", async (_case, placement, index) => {
    const fx = fixture();
    const first = await start(fx);
    const ws = await openEvents(first.server, first.token);
    const events = eventsUntilChannelUpdate(ws, fx.target);
    const expected = [...TARGET_BEFORE];
    expected.splice(index, 0, page(["moved"], true, MOVED_SIZE));

    await move(first.server, first.token, "moved", fx.target, placement)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ outcome: "moved", artifactID: "moved", channelID: fx.target }));

    const received = await events;
    ws.close();
    expect((received.at(-1) as Extract<ServerEvent, { type: "channel-updated" }>).channel.layout).toEqual(expected);
    expect(await layoutOf(first.server, first.token, fx.target)).toEqual(expected);
    expect(await layoutOf(first.server, first.token, fx.source)).toEqual([page(["source-other"])]);

    await stop(first.server);
    const restarted = await start(fx);
    expect(await layoutOf(restarted.server, restarted.token, fx.target)).toEqual(expected);
  });

  // proofs/arch/layout/index.md#^ly-ac-placement-rejected
  it.each([
    ["creation", "an artifact on another channel", { before: "source-other" }, "Artifact source-other is not on channel target-channel."],
    ["creation", "an unknown artifact", { after: "no-such-artifact" }, "Artifact no-such-artifact is not on channel target-channel."],
    ["creation", "both before and after", { before: "target-a", after: "target-b" }, null],
    ["move", "an artifact on another channel", { before: "source-other" }, "Artifact source-other is not on channel target-channel."],
    ["move", "an unknown artifact", { after: "no-such-artifact" }, "Artifact no-such-artifact is not on channel target-channel."],
    ["move", "both before and after", { before: "target-a", after: "target-b" }, null],
  ])("rejects a %s naming %s without changing anything", async (kind, _case, placement, message) => {
    const fx = fixture();
    const { server, token } = await start(fx);
    const storedBefore = [fx.source, fx.target].map((id) => readFileSync(channelPath(fx.storagePath, id)));
    const artifactsBefore = (await request(server.httpServer).get("/artifacts").set(auth(token)).expect(200)).body.artifacts;
    const recordsDir = path.join(fx.storagePath, "state", "artifacts");
    const recordsBefore = existsSync(recordsDir) ? readdirSync(recordsDir).sort() : [];

    const response = kind === "creation"
      ? await create(server, token, fx.target, placement)
      : await move(server, token, "moved", fx.target, placement);

    expect(response.status).toBe(400);
    if (message !== null) expect(response.body.error).toBe(message);
    expect(await layoutOf(server, token, fx.source)).toEqual(SOURCE_BEFORE);
    expect(await layoutOf(server, token, fx.target)).toEqual(TARGET_BEFORE);
    expect([fx.source, fx.target].map((id) => readFileSync(channelPath(fx.storagePath, id)))).toEqual(storedBefore);
    expect((await request(server.httpServer).get("/artifacts").set(auth(token)).expect(200)).body.artifacts).toEqual(artifactsBefore);
    expect(existsSync(recordsDir) ? readdirSync(recordsDir).sort() : []).toEqual(recordsBefore);
  });

  // proofs/arch/layout/index.md#^ly-ac-placement-move-same
  it("ignores a placement when the artifact is already on the channel", async () => {
    const fx = fixture();
    const { server, token } = await start(fx);
    const storedBefore = readFileSync(channelPath(fx.storagePath, fx.target));

    // The named artifact is on another channel, so a placement checked before
    // the same-channel return would be rejected.
    await move(server, token, "target-c", fx.target, { before: "source-other" })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ outcome: "unchanged", artifactID: "target-c", channelID: fx.target }));

    expect(await layoutOf(server, token, fx.target)).toEqual(TARGET_BEFORE);
    expect(readFileSync(channelPath(fx.storagePath, fx.target))).toEqual(storedBefore);
  });
});
