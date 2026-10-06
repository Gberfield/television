import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CompositorObservation, WindowOwner } from "../../src/hyprland-visibility.ts";
const execute = promisify(execFile);
// Independent output/identity observation. No production adapter/controller helper is imported.
export async function observeHyprlandWindow(owner: WindowOwner): Promise<CompositorObservation> {
  const read = async (kind: string) => JSON.parse((await execute("hyprctl", ["-i",owner.session,"-j",kind],
    {timeout:2000,maxBuffer:1024*1024})).stdout);
  try {
    const clients = await read("clients") as Array<{pid:number;class:string;address:string;mapped:boolean;
      workspace:{id:number;name:string};fullscreen:number;grouped:string[];pinned:boolean}>;
    const matches=clients.filter(c=>c.pid===owner.pid&&c.class===owner.applicationID&&c.mapped);
    if(matches.length===0)return {status:"missing"};
    if(matches.length!==1)return {status:"ambiguous"};
    const target=matches[0]!;
    if(owner.address&&owner.address!==target.address)return {status:"replaced"};
    const workspaces=await read("workspaces") as Array<{id:number;name:string}>;
    const monitors=await read("monitors") as Array<{id:number;focused:boolean;activeWorkspace:{id:number};specialWorkspace:{id:number}}>;
    return {status:"owned",owner:{...owner,address:target.address},workspace:target.workspace.id,workspaceName:target.workspace.name,
      visibleOnMonitors:monitors.filter(m=>m.activeWorkspace.id===target.workspace.id||m.specialWorkspace.id===target.workspace.id).map(m=>m.id),
      existingWorkspaces:workspaces.map(w=>w.id),normalWorkspaces:workspaces.filter(w=>!w.name.startsWith("special:")).map(w=>w.id),
      activeNormalWorkspace:monitors.find(m=>m.focused)?.activeWorkspace.id??null,
      supportedWindowState:target.fullscreen<2&&target.grouped.length===0&&!target.pinned,
      // This observer does not mint transport actions. The production external fence is inspected separately in seam tests.
      externalRevision:0};
  }catch(error){return {status:"unavailable",reason:String(error)};}
}
