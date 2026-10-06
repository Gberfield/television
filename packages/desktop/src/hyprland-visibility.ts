export type VisibilityOutcome = { status: "visible" | "hidden" | "pending" | "refused"; reason?: string };
export type WindowOwner = { pid: number; applicationID: string; session: string; marker: string; address?: string };
export type VisibilityIntent = { owner: WindowOwner; revision: number; expectedExternalRevision: number;
  visible: boolean; originWorkspace?: number; holdingWorkspace?: string };
export type CompositorObservation =
  | { status: "unavailable"; reason: string }
  | { status: "missing" | "ambiguous" | "replaced" }
  | { status: "owned"; owner: WindowOwner; workspace: number; workspaceName: string;
      visibleOnMonitors: number[]; existingWorkspaces: number[]; normalWorkspaces: number[];
      activeNormalWorkspace: number | null; supportedWindowState: boolean; externalRevision: number };
export interface HyprlandTransport {
  inspect(owner: WindowOwner): Promise<CompositorObservation>;
  apply(intent: VisibilityIntent): Promise<{ acknowledged: boolean }>;
  watch(owner: WindowOwner, changed: () => void): () => void;
  dispose(): void;
}
export interface HyprlandVisibilityController {
  request(visible: boolean): Promise<VisibilityOutcome>;
  dispose(): void;
}
const OBSERVATION_DEADLINE_MS = 10_000;
const POLL_MS = 100;

export function createHyprlandVisibility(options: { owner: WindowOwner; transport: HyprlandTransport;
  notify: (message: string) => void }): HyprlandVisibilityController {
  let owner = { ...options.owner };
  let disposed = false;
  let revision = 0;
  let serial: Promise<unknown> = Promise.resolve();
  let origin: number | undefined;
  let holding: string | undefined;
  let holdingSequence = 0;
  let externalRevision: number | undefined;
  let passiveQueued = false;
  let explicitRequests = 0;
  const lifetime = new AbortController();

  function within<T>(work: () => Promise<T>, deadline: number): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || disposed) return Promise.reject(new Error("Visibility deadline or disposal"));
    return new Promise((resolve, reject) => {
      const stop = () => {clearTimeout(timer); lifetime.signal.removeEventListener("abort", abort);};
      const abort = () => {stop(); reject(new Error("Visibility controller disposed"));};
      const timer = setTimeout(() => {stop(); reject(new Error("Visibility deadline"));}, remaining);
      lifetime.signal.addEventListener("abort", abort, {once:true});
      work().then(value => {
        stop();
        if (Date.now() >= deadline || disposed) reject(new Error("Visibility deadline or disposal"));
        else resolve(value);
      }, error => {stop(); reject(error);});
    });
  }

  function reconcile(observation: CompositorObservation): void {
    if (disposed || observation.status !== "owned" || !identityMatches(observation)) return;
    if (externalRevision !== undefined && externalRevision !== observation.externalRevision) {
      origin = undefined;
      holding = undefined;
    }
    externalRevision = observation.externalRevision;
    owner = { ...observation.owner };
  }
  async function inspect(deadline: number): Promise<CompositorObservation> {
    return within(async () => {
      try { return await options.transport.inspect(owner); }
      catch { return { status: "unavailable", reason: "Compositor observation failed" }; }
    }, deadline);
  }
  function failure(visible: boolean, observation: CompositorObservation, reason: string, uncertain = false): VisibilityOutcome {
    if (disposed) return {status:"refused", reason:"Window controller disposed"};
    const knownVisible = !uncertain && observation.status === "owned" && observation.visibleOnMonitors.length > 0;
    options.notify(visible
      ? "Television is still running, but could not restore its window. Open Television again to retry."
      : knownVisible ? "Television could not hide this window. It remains open."
      : "Television could not confirm whether its window is hidden. Open Television again to retry.");
    return {status: visible || !knownVisible ? "pending" : "refused", reason};
  }
  function identityMatches(observation: Extract<CompositorObservation,{status:"owned"}>): boolean {
    const candidate = observation.owner;
    return candidate.pid === owner.pid && candidate.applicationID === owner.applicationID &&
      candidate.session === owner.session && candidate.marker === owner.marker &&
      (!owner.address || owner.address === candidate.address);
  }
  async function execute(visible: boolean, token: number, deadline: number): Promise<VisibilityOutcome> {
    if (disposed) return {status:"refused",reason:"Window controller disposed"};
    if (token !== revision) return {status:"pending",reason:"Superseded visibility request"};
    let observation = await inspect(deadline);
    if (disposed || token !== revision) return {status:"pending",reason:"Superseded visibility request"};
    if (observation.status !== "owned") return failure(visible, observation, "Owned compositor window unavailable");
    if (!identityMatches(observation)) return failure(visible, {status:"replaced"}, "Owned window changed");
    reconcile(observation);
    async function refuseMovement(reason: string): Promise<VisibilityOutcome> {
      // Publish only the ordering barrier. Omitted destinations cannot cause movement.
      // Even a refused newest request must invalidate an older delayed Hide.
      const fence = Object.freeze({owner:Object.freeze({...owner}),revision:token,
        expectedExternalRevision:observation.status === "owned" ? observation.externalRevision : 0,visible});
      let uncertain = false;
      try {await within(() => options.transport.apply(fence),deadline);} catch {uncertain = true;}
      if (Date.now() >= deadline) throw new Error("Visibility deadline");
      if (disposed || token !== revision) return {status:"pending",reason:"Superseded visibility request"};
      return failure(visible,observation,reason,uncertain);
    }
    if (!observation.supportedWindowState) return refuseMovement("Unsupported window state");
    let destination: number | undefined;
    if (visible) {
      const preferred = origin ?? observation.workspace;
      destination = observation.existingWorkspaces.includes(preferred) ? preferred :
        observation.activeNormalWorkspace !== null && observation.normalWorkspaces.includes(observation.activeNormalWorkspace)
          ? observation.activeNormalWorkspace : undefined;
      if (destination === undefined) return refuseMovement("No validated restore workspace");
    } else {
      origin ??= observation.workspace;
      // Repeated Hide retains its destination but still publishes a newer fence.
      if (!holding || observation.workspaceName !== holding || observation.visibleOnMonitors.length > 0) {
        holding = `special:tv-hidden-${owner.marker}-${++holdingSequence}`;
      }
    }
    // Record the ledger before dispatch; even a lost receipt may have moved the window.
    const intent: VisibilityIntent = Object.freeze({ owner: Object.freeze({...owner}), revision: token,
      expectedExternalRevision: observation.externalRevision, visible, originWorkspace: destination ?? origin,
      holdingWorkspace: holding });
    let acknowledged = false;
    let uncertain = false;
    try { acknowledged = (await within(() => options.transport.apply(intent),deadline)).acknowledged; } catch { uncertain = true; /* Reconcile unknown completion. */ }
    for (;;) {
      observation = await inspect(deadline);
      if (disposed || token !== revision) return {status:"pending",reason:"Superseded visibility request"};
      if (observation.status !== "owned") return failure(visible, observation, "Compositor control unavailable after dispatch");
      if (!identityMatches(observation)) return failure(visible, {status:"replaced"}, "Owned window changed");
      if (observation.externalRevision !== intent.expectedExternalRevision) {
        reconcile(observation);
        return failure(visible, observation, "Manual placement superseded this request");
      }
      if (visible && observation.workspace === destination && observation.visibleOnMonitors.length > 0) {
        origin = undefined; holding = undefined; return {status:"visible"};
      }
      if (!visible && observation.workspaceName === intent.holdingWorkspace) {
        if (observation.visibleOnMonitors.length === 0) return {status:"hidden"};
        origin = undefined; holding = undefined;
        return failure(false, observation, "Holding workspace is visible");
      }
      if (!acknowledged || Date.now() >= deadline) return failure(visible, observation, "Visibility was not confirmed", uncertain);
      await within(() => new Promise<void>(resolve => setTimeout(resolve, POLL_MS)),deadline);
    }
  }
  const unwatch = options.transport.watch(owner, () => {
    // Passive reconciliation only: an event must never retry an old desire automatically.
    // One queued observation absorbs a burst; explicit requests inspect for themselves.
    if (disposed || passiveQueued || explicitRequests > 0) return;
    passiveQueued = true;
    const deadline = Date.now() + OBSERVATION_DEADLINE_MS;
    serial = serial.then(async () => {
      if (!disposed && explicitRequests === 0) reconcile(await inspect(deadline));
    }).catch(() => {}).finally(() => {passiveQueued = false;});
  });
  return {
    request(visible) {
      if (disposed) return Promise.resolve({status:"refused",reason:"Window controller disposed"});
      const token = ++revision;
      const deadline = Date.now() + OBSERVATION_DEADLINE_MS;
      ++explicitRequests;
      const queued = serial.then(() => execute(visible, token, deadline));
      serial = queued.catch(() => {});
      return within(() => queued,deadline).catch(() => {
        if (disposed || token !== revision) return {status:"pending" as const,reason:"Superseded visibility request"};
        return failure(visible,{status:"unavailable",reason:"Visibility deadline"},"Visibility deadline",true);
      }).finally(() => {--explicitRequests;});
    },
    dispose() {
      if (disposed) return;
      disposed = true; ++revision;
      lifetime.abort();
      unwatch(); options.transport.dispose();
      origin = undefined; holding = undefined;
    },
  };
}
