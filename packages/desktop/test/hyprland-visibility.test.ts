// Contract: proofs/arch/desktop/linux-distribution.md#^linux-hyprland-controller
// Transport observations/receipts are boundary doubles; native Lua/output behavior belongs to the real seam.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHyprlandVisibility, type CompositorObservation, type HyprlandTransport,
  type VisibilityIntent, type WindowOwner } from "../src/hyprland-visibility.ts";

const owner: WindowOwner = { pid: 410, applicationID: "computer.telepath.television", session: "owned-session", marker: "owned-window", address: "0xabc" };
function observed(overrides: Partial<Extract<CompositorObservation, {status:"owned"}>> = {}): CompositorObservation {
  return { status: "owned", owner, workspace: 7, workspaceName: "7", visibleOnMonitors: [0],
    existingWorkspaces: [7, 9], normalWorkspaces: [7, 9], activeNormalWorkspace: 9,
    supportedWindowState: true, externalRevision: 0, ...overrides };
}
function boundary() {
  const actions: VisibilityIntent[] = [];
  const notifications: string[] = [];
  let state: CompositorObservation = observed();
  let changed = () => {};
  let inspect = async (): Promise<CompositorObservation> => state;
  let apply = async (intent: VisibilityIntent): Promise<{acknowledged:boolean}> => {
    state = observed({ ...(state.status === "owned" ? state : {}), workspace: intent.visible ? intent.originWorkspace! : -99,
      workspaceName: intent.visible ? String(intent.originWorkspace) : intent.holdingWorkspace!,
      visibleOnMonitors: intent.visible ? [0] : [] });
    return { acknowledged: true };
  };
  const transport: HyprlandTransport = {
    inspect: () => inspect(),
    apply: async intent => { actions.push(structuredClone(intent)); return apply(intent); },
    watch: (_owner, callback) => { changed = callback; return () => {changed = () => {};}; },
    dispose: () => {},
  };
  const controller = createHyprlandVisibility({ owner, transport, notify: message => notifications.push(message) });
  cleanup.push(() => controller.dispose());
  return { controller, actions, notifications, state: (value: CompositorObservation) => { state = value; changed(); },
    changed: () => changed(), inspect: (value: typeof inspect) => {inspect = value;},
    apply: (value: typeof apply) => { apply = value; } };
}
const cleanup: Array<() => void> = [];
afterEach(() => { for (const fn of cleanup.splice(0)) fn(); vi.useRealTimers(); });

describe("owned Hyprland visibility", () => {
  it("repeated hide keeps its first origin", async () => {
    const b = boundary();
    expect((await b.controller.request(false)).status).toBe("hidden");
    expect((await b.controller.request(false)).status).toBe("hidden");
    expect((await b.controller.request(true)).status).toBe("visible");
    const hides=b.actions.filter(a => !a.visible);
    expect(hides).toHaveLength(2);
    expect(hides[1]).toMatchObject({originWorkspace:7,holdingWorkspace:hides[0]!.holdingWorkspace});
    expect(hides[1]!.revision).toBeGreaterThan(hides[0]!.revision);
    expect(b.actions.at(-1)).toMatchObject({ owner, visible: true, originWorkspace: 7 });
  });
  it("still-existing special origin is retained", async () => {
    const b = boundary(); b.state(observed({workspace:-12,workspaceName:"special:notes",existingWorkspaces:[-12,9],normalWorkspaces:[9]}));
    await b.controller.request(false); await b.controller.request(true);
    expect(b.actions.at(-1)?.originWorkspace).toBe(-12);
  });
  it("show wins over a pending hide", async () => {
    const b = boundary(); let release!: () => void; let entered!: () => void;
    const started = new Promise<void>(resolve => {entered = resolve;});
    b.apply(async intent => { if (!intent.visible) { entered(); await new Promise<void>(resolve => {release = resolve;});
      b.state(observed({workspace:-99,workspaceName:intent.holdingWorkspace!,visibleOnMonitors:[]}));
    } else b.state(observed()); return {acknowledged:true}; });
    const hide = b.controller.request(false);
    const reached = await Promise.race([started.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 50))]);
    expect(reached).toBe(true);
    const show = b.controller.request(true); release();
    await hide; expect((await show).status).toBe("visible");
    expect(b.actions.map(a => a.visible)).toEqual([false,true]);
    expect(b.actions[1]!.revision).toBeGreaterThan(b.actions[0]!.revision);
  });
  it("lost hide receipt retains ownership", async () => {
    const b = boundary();
    b.apply(async intent => {
      b.state(observed({workspace:-99,workspaceName:intent.holdingWorkspace!,visibleOnMonitors:[]}));
      throw new Error("lost receipt after real action");
    });
    expect((await b.controller.request(false)).status).toBe("hidden");
    b.apply(async () => { b.state(observed()); return {acknowledged:true}; });
    expect((await b.controller.request(true)).status).toBe("visible");
    expect(b.actions.at(-1)?.originWorkspace).toBe(7);
  });
  it("unavailable restore returns pending and never replaces the window", async () => {
    const b = boundary(); await b.controller.request(false);
    b.state({status:"unavailable",reason:"socket absent"});
    expect((await b.controller.request(true)).status).toBe("pending");
    expect(b.notifications.at(-1)).toMatch(/still running.*restore.*retry/i);
    expect(b.actions).toHaveLength(1);
    b.state(observed({workspace:-99,workspaceName:b.actions[0]!.holdingWorkspace!,visibleOnMonitors:[]}));
    expect((await b.controller.request(true)).status).toBe("visible");
    expect(b.actions.at(-1)).toMatchObject({owner,originWorkspace:7});
  });
  it.each(["move","reveal"])("manual %s cancels old origin and stale requests", async kind => {
    const b = boundary(); await b.controller.request(false);
    b.state(observed({ workspace: kind === "move" ? 9 : -99,
      workspaceName: kind === "move" ? "9" : b.actions[0]!.holdingWorkspace!, visibleOnMonitors:[1],
      existingWorkspaces:[7,9,-99],externalRevision:1 }));
    await b.controller.request(true);
    expect(b.actions.at(-1)?.originWorkspace).toBe(kind === "move" ? 9 : -99);
    b.state(observed({workspace:9,workspaceName:"9",externalRevision:1}));
    await b.controller.request(false);
    expect(b.actions.at(-1)).toMatchObject({originWorkspace:9,expectedExternalRevision:1});
    expect(b.actions.at(-1)?.holdingWorkspace).not.toBe(b.actions[0]!.holdingWorkspace);
  });
  it("removed origin restores to validated active normal workspace", async () => {
    const b = boundary(); await b.controller.request(false);
    b.state(observed({workspace:-99,workspaceName:b.actions[0]!.holdingWorkspace!,visibleOnMonitors:[],existingWorkspaces:[9,-99],normalWorkspaces:[9]}));
    await b.controller.request(true); expect(b.actions.at(-1)?.originWorkspace).toBe(9);
  });
  it("unsupported window state is refused while visibly open", async () => {
    const b = boundary(); b.state(observed({supportedWindowState:false})); b.apply(async () => ({acknowledged:false}));
    expect((await b.controller.request(false)).status).toBe("refused");
    // A destination-free fence supersedes old delivery without requesting movement.
    expect(b.actions).toEqual([{owner,revision:1,expectedExternalRevision:0,visible:false}]);
    expect(b.notifications.at(-1)).toMatch(/remains open/i);
  });
  it("restore without a validated destination publishes a newer movement-free fence", async () => {
    const b = boundary(); await b.controller.request(false);
    b.state(observed({workspace:-99,workspaceName:b.actions[0]!.holdingWorkspace!,visibleOnMonitors:[],
      existingWorkspaces:[],normalWorkspaces:[],activeNormalWorkspace:null}));
    b.apply(async () => ({acknowledged:false}));
    expect((await b.controller.request(true)).status).toBe("pending");
    expect(b.actions.at(-1)).toEqual({owner,revision:2,expectedExternalRevision:0,visible:true});
  });
  it("initial observation cannot complete a request after its total deadline", async () => {
    vi.useFakeTimers(); const b = boundary(); let reply!: (value:CompositorObservation) => void;
    b.inspect(() => new Promise(resolve => {reply=resolve;}));
    let outcome: Awaited<ReturnType<typeof b.controller.request>> | undefined;
    const request=b.controller.request(false).then(value => {outcome=value;});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(outcome?.status).toBe("pending"); expect(b.actions).toEqual([]);
    reply(observed()); await request; await vi.advanceTimersByTimeAsync(0);
    expect(b.actions).toEqual([]); expect(outcome?.status).toBe("pending");
  });
  it("request deadline includes waiting behind an unfinished passive observation", async () => {
    vi.useFakeTimers(); const b=boundary(); let reply!: (value:CompositorObservation) => void;
    b.inspect(() => new Promise(resolve => {reply=resolve;})); b.changed();
    await vi.advanceTimersByTimeAsync(0);
    let outcome: Awaited<ReturnType<typeof b.controller.request>> | undefined;
    const request=b.controller.request(true).then(value => {outcome=value;});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(outcome?.status).toBe("pending"); expect(b.actions).toEqual([]);
    reply(observed()); await request;
  });
  it("event bursts coalesce while a reply is delayed and give explicit requests priority", async () => {
    vi.useFakeTimers(); const b=boundary(); let inspections=0;
    b.inspect(async () => {if (++inspections===1) await new Promise(resolve => setTimeout(resolve,100));return observed();});
    b.changed(); await vi.advanceTimersByTimeAsync(0);
    for (let i=0;i<1000;i++) b.changed();
    b.apply(async () => ({acknowledged:false}));
    const request=b.controller.request(false);
    await vi.advanceTimersByTimeAsync(200); await request;
    expect(inspections).toBeLessThanOrEqual(4); expect(b.actions).toHaveLength(1);
  });
  it("late confirmation cannot become success and unresolved Hide retains its origin", async () => {
    vi.useFakeTimers(); const b=boundary(); let inspections=0; let reply!: (value:CompositorObservation) => void;
    b.inspect(async () => ++inspections===1 ? observed() : new Promise(resolve => {reply=resolve;}));
    b.apply(async () => ({acknowledged:true}));
    let outcome: Awaited<ReturnType<typeof b.controller.request>> | undefined;
    const request=b.controller.request(false).then(value => {outcome=value;});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(outcome?.status).toBe("pending"); expect(b.notifications).toHaveLength(1);
    const held=observed({workspace:-99,workspaceName:b.actions[0]!.holdingWorkspace!,visibleOnMonitors:[]});
    reply(held); await request; await vi.advanceTimersByTimeAsync(0);
    expect(outcome?.status).toBe("pending");
    b.inspect(async () => held); b.apply(async () => {b.inspect(async () => observed());return {acknowledged:true};});
    expect((await b.controller.request(true)).status).toBe("visible");
    expect(b.actions.at(-1)?.originWorkspace).toBe(7);
  });
  it("visible holding destination is refused", async () => {
    const b = boundary(); b.apply(async intent => {
      b.state(observed({workspace:-99,workspaceName:intent.holdingWorkspace!,visibleOnMonitors:[1]}));
      return {acknowledged:false};
    });
    expect((await b.controller.request(false)).status).toBe("refused");
    expect(b.notifications.at(-1)).toMatch(/remains open/i);
  });
  it("unknown Hide completion stays pending rather than claiming open", async () => {
    const b = boundary(); b.apply(async () => {b.state({status:"unavailable",reason:"timeout"}); throw new Error("timeout");});
    expect((await b.controller.request(false)).status).toBe("pending");
    expect(b.notifications.at(-1)).toMatch(/could not confirm.*retry/i);
  });
  it("lost receipt cannot claim a visible refusal while completion is unknown", async () => {
    const b = boundary(); b.apply(async () => {throw new Error("receipt lost before observation");});
    expect((await b.controller.request(false)).status).toBe("pending");
    expect(b.notifications.at(-1)).toMatch(/could not confirm.*retry/i);
  });
  it("passive observation never adopts a replaced owner", async () => {
    const b = boundary(); b.state(observed({owner:{...owner,pid:999,address:"0xdef"}}));
    expect((await b.controller.request(false)).status).not.toBe("hidden");
    expect(b.actions).toEqual([]);
  });
  it("external change rejects an already minted stale request", async () => {
    const b = boundary(); b.apply(async () => {b.state(observed({workspace:9,workspaceName:"9",externalRevision:1}));return {acknowledged:false};});
    expect((await b.controller.request(false)).status).toBe("refused");
    expect(b.actions).toHaveLength(1); expect(b.actions[0]?.expectedExternalRevision).toBe(0);
  });
  it("disposed controller never dispatches", async () => {
    const b = boundary(); b.controller.dispose();
    expect((await b.controller.request(false)).status).toBe("refused"); expect(b.actions).toEqual([]);
  });
});
