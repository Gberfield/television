import { spawn, type ChildProcess } from "node:child_process";
import { randomInt } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import path from "node:path";
import type { CompositorObservation, HyprlandTransport, VisibilityIntent, WindowOwner } from "./hyprland-visibility.ts";

const COMMAND_MS = 2_000;
const OUTPUT_BYTES = 1_048_576;
const LUA_BYTE_ESCAPE_WIDTH = 3;
const INITIAL_EXTERNAL_LIMIT = 1_099_511_627_776;
const MAX_OWNER_FIELD_LENGTH = 256;
const REGISTRY = "__television_visibility_v1";

/** Lua's fixed-width decimal escapes preserve UTF-8 bytes without interpreting data as source. */
export function encodeLuaString(value: string): string {
  return '"' + [...Buffer.from(value)].map(byte => `\\${String(byte).padStart(LUA_BYTE_ESCAPE_WIDTH,"0")}`).join("") + '"';
}
const COMMON = String.raw`
local null={}
local function array(t) return setmetatable(t,{tv_array=true}) end
local function json(v)
 if v==null then return "null" end
 local kind=type(v)
 if kind=="string" then
  return '"'..v:gsub('[%z\1-\31\\"]',function(c)
   if c=='"' then return '\\"' elseif c=='\\' then return '\\\\' else return string.format('\\u%04x',string.byte(c)) end
  end)..'"'
 elseif kind=="boolean" or kind=="number" then return tostring(v)
 elseif kind=="table" then
  local parts={}
  if getmetatable(v) and getmetatable(v).tv_array then
   for _,x in ipairs(v) do parts[#parts+1]=json(x) end
   return '['..table.concat(parts,',')..']'
  end
  for k,x in pairs(v) do parts[#parts+1]=json(k)..':'..json(x) end
  return '{'..table.concat(parts,',')..'}'
 end
 error("Unsupported control value")
end
local function supported(w)
 return w and w.mapped and w.group==nil and not w.pinned and (w.fullscreen==0 or w.fullscreen==1) and (w.fullscreen_client==0 or w.fullscreen_client==1)
end
local function monitorsShowing(id)
 local out={}
 for _,m in ipairs(hl.get_monitors()) do
  if (m.active_workspace and m.active_workspace.id==id) or (m.active_special_workspace and m.active_special_workspace.id==id) then out[#out+1]=m.id end
 end
 return out
end
`;
const CAPABILITY = COMMON + String.raw`
if type(hl)~="table" or type(hl.get_windows)~="function" or type(hl.get_monitors)~="function" or type(hl.get_workspaces)~="function" or type(hl.get_active_workspace)~="function" or type(hl.dispatch)~="function" or type(hl.on)~="function" or not hl.dsp or not hl.dsp.window or type(hl.dsp.window.move)~="function" or type(hl.dsp.focus)~="function" then return json({capable=false}) end
local sub=hl.on("window.move_to_workspace",function() end)
local active=sub:is_active(); sub:remove()
return json({capable=active and not sub:is_active()})
`;
function prefix(owner: WindowOwner): string {
  return COMMON + `\nlocal marker=${encodeLuaString(owner.marker)}\nlocal session=${encodeLuaString(owner.session)}\nlocal pid=${owner.pid}\nlocal appid=${encodeLuaString(owner.applicationID)}\nlocal address=${owner.address ? encodeLuaString(owner.address) : "nil"}\nlocal registryKey=${encodeLuaString(REGISTRY)}\n` + String.raw`
if os.getenv("HYPRLAND_INSTANCE_SIGNATURE")~=session then return json({status="unavailable",reason="Compositor session changed"}) end
local registry=rawget(_G,registryKey)
if not registry then registry={}; rawset(_G,registryKey,registry) end
local r=registry[marker]
local function matches(w) return w and w.mapped and w.pid==pid and w.class==appid and (not address or w.address==address) end
local function owned()
 return r and not r.dead and r.pid==pid and r.appid==appid and r.session==session and matches(r.w) and r.w.address==r.address and r.w.stable_id==r.stable
end
`;
}
function inspection(owner: WindowOwner): string {
  return prefix(owner) + `\nlocal initialExternal=${randomInt(1, INITIAL_EXTERNAL_LIMIT)}\n` + String.raw`
if not r then
 local candidates={}
 for _,w in ipairs(hl.get_windows()) do if w.mapped and w.pid==pid and w.class==appid then candidates[#candidates+1]=w end end
 if #candidates==0 then return json({status="missing"}) end
 if #candidates~=1 then return json({status="ambiguous"}) end
 local w=candidates[1]
 if not matches(w) then return json({status="replaced"}) end
 for key,other in pairs(registry) do if key~=marker and not other.dead and other.w==w then return json({status="ambiguous"}) end end
 r={w=w,pid=pid,appid=appid,session=session,address=w.address,stable=w.stable_id,external=initialExternal,revision=0,dead=false,internal=false,subs={}}
 registry[marker]=r
 local function manual() if not r.dead and not r.internal then r.external=r.external+1; r.holding=nil end end
 r.subs[#r.subs+1]=hl.on("window.move_to_workspace",function(changed) if changed==r.w then manual() end end)
 r.subs[#r.subs+1]=hl.on("workspace.special_active",function(ws) if ws and r.holding and ws.name==r.holding then manual() end end)
 local function closed(changed) if changed==r.w then r.dead=true; r.external=r.external+1 end end
 r.subs[#r.subs+1]=hl.on("window.close",closed)
 r.subs[#r.subs+1]=hl.on("window.destroy",closed)
end
if not owned() then return json({status="replaced"}) end
local w=r.w; local ws=w.workspace
if not ws then return json({status="unavailable",reason="Window workspace unavailable"}) end
local existing={}; local normal={}
for _,space in ipairs(hl.get_workspaces()) do existing[#existing+1]=space.id; if not space.special then normal[#normal+1]=space.id end end
local active=hl.get_active_workspace()
return json({status="owned",owner={pid=pid,applicationID=appid,session=session,marker=marker,address=r.address},workspace=ws.id,workspaceName=ws.name,
visibleOnMonitors=array(monitorsShowing(ws.id)),existingWorkspaces=array(existing),normalWorkspaces=array(normal),activeNormalWorkspace=active and not active.special and active.id or null,
supportedWindowState=supported(w),externalRevision=r.external})
`;
}
function action(intent: VisibilityIntent): string {
  return prefix(intent.owner) + `\nlocal revision=${intent.revision}\nlocal external=${intent.expectedExternalRevision}\nlocal visible=${intent.visible}\nlocal origin=${intent.originWorkspace ?? "nil"}\nlocal holding=${intent.holdingWorkspace ? encodeLuaString(intent.holdingWorkspace) : "nil"}\n` + String.raw`
if not owned() or revision<r.revision or external~=r.external then return json({acknowledged=false}) end
-- A current owned refusal still supersedes older application delivery.
r.revision=revision
if not supported(r.w) then return json({acknowledged=false}) end
local destination=nil
if visible then
 for _,ws in ipairs(hl.get_workspaces()) do if ws.id==origin then destination=ws; break end end
 if not destination then return json({acknowledged=false}) end
else
 if not holding or holding:sub(1,8)~="special:" then return json({acknowledged=false}) end
 for _,ws in ipairs(hl.get_workspaces()) do
  if ws.name==holding and (#monitorsShowing(ws.id)>0 or ws.windows>0 and (not r.holding or r.holding~=holding)) then return json({acknowledged=false}) end
 end
end
r.internal=true
local ok,result=pcall(function()
 local selector=visible and (destination.special and destination.name or "name:"..destination.name) or holding
 if not visible then r.holding=holding end
 local moved=hl.dispatch(hl.dsp.window.move({workspace=selector,window=r.w,follow=false}))
 if not moved.ok then return false end
 if visible then
  local focused=hl.dispatch(hl.dsp.focus({window=r.w}))
  if not focused.ok then return false end
  r.holding=nil
 end
 return true
end)
r.internal=false
return json({acknowledged=ok and result==true})
`;
}
function cleanup(owner: WindowOwner): string {
  return prefix(owner) + String.raw`
if not r or r.pid==pid and r.appid==appid and r.session==session then
 if r then
  r.dead=true; r.external=r.external+1
  for _,sub in ipairs(r.subs or {}) do sub:remove() end
 end
 -- Keep only a revocation tombstone, so an old delayed inspection cannot rebind.
 registry[marker]={dead=true}
end
return json({acknowledged=true})
`;
}
function validOwner(owner: WindowOwner, session: string): boolean {
  return owner.session === session && Number.isSafeInteger(owner.pid) && owner.pid > 0 &&
    owner.marker.length > 0 && owner.marker.length <= MAX_OWNER_FIELD_LENGTH && owner.applicationID.length > 0 && owner.applicationID.length <= MAX_OWNER_FIELD_LENGTH &&
    (!owner.address || /^0x[0-9a-f]+$/i.test(owner.address));
}
function observation(value: unknown, owner: WindowOwner): CompositorObservation {
  if (!value || typeof value !== "object") throw new Error("Invalid compositor reply");
  const v = value as Record<string, unknown>;
  if (v.status === "missing" || v.status === "ambiguous" || v.status === "replaced") return {status:v.status};
  if (v.status === "unavailable" && typeof v.reason === "string") return {status:"unavailable",reason:v.reason};
  if (v.status !== "owned" || !v.owner || typeof v.owner !== "object") throw new Error("Invalid compositor observation");
  const o = v.owner as WindowOwner;
  if (!validOwner(o,owner.session) || o.pid!==owner.pid || o.applicationID!==owner.applicationID || o.marker!==owner.marker ||
      !o.address || owner.address && owner.address!==o.address) throw new Error("Compositor ownership mismatch");
  for (const key of ["workspace","externalRevision"]) if (!Number.isSafeInteger(v[key])) throw new Error("Invalid compositor integer");
  for (const key of ["visibleOnMonitors","existingWorkspaces","normalWorkspaces"]) {
    if (!Array.isArray(v[key]) || !(v[key] as unknown[]).every(Number.isSafeInteger)) throw new Error("Invalid compositor inventory");
  }
  if (typeof v.workspaceName!=="string" || typeof v.supportedWindowState!=="boolean" ||
      v.activeNormalWorkspace!==null && !Number.isSafeInteger(v.activeNormalWorkspace)) throw new Error("Invalid compositor workspace");
  return v as unknown as CompositorObservation;
}
export function createHyprlandControl(options: {session:string}): HyprlandTransport {
  const session=options.session;
  const env: NodeJS.ProcessEnv={...process.env,HYPRLAND_INSTANCE_SIGNATURE:session};
  let disposed=false;
  let disposal:Promise<void>|undefined;
  const pendingCommands=new Set<Promise<string>>();
  let verified:Promise<boolean>|undefined;
  const children=new Set<ChildProcess>();
  const sockets=new Set<Socket>();
  const owners=new Map<string,WindowOwner>();
  const validSession=/^[a-zA-Z0-9-]+_[0-9]+_[0-9]+$/.test(session);
  function command(args:string[], cleaning=false):Promise<string> {
    if ((!cleaning&&disposed)||!validSession) return Promise.reject(new Error("Compositor control unavailable"));
    const completion=new Promise<string>((resolve,reject)=>{
      const child=spawn("hyprctl",["-i",session,...args],{env,stdio:["ignore","pipe","pipe"],shell:false});
      children.add(child);
      let bytes=0;let stdout="";let failure:Error|undefined;
      const timer=setTimeout(()=>{failure=new Error("Compositor command deadline");child.kill("SIGKILL");},COMMAND_MS);
      const collect=(data:Buffer,out:boolean)=>{
        bytes+=data.length;
        if(bytes>OUTPUT_BYTES){failure=new Error("Compositor output limit");child.kill("SIGKILL");return;}
        if(out)stdout+=data.toString("utf8");
      };
      child.stdout!.on("data",data=>collect(data,true));child.stderr!.on("data",data=>collect(data,false));
      child.once("error",error=>{failure=error;});
      child.once("close",code=>{clearTimeout(timer);children.delete(child);if(failure||code!==0)reject(failure??new Error("Compositor command failed"));else resolve(stdout.trim());});
    });
    pendingCommands.add(completion);
    void completion.then(()=>pendingCommands.delete(completion),()=>pendingCommands.delete(completion));
    return completion;
  }
  async function verify():Promise<boolean> {
    if(disposed||!validSession)return false;
    if(!verified)verified=(async()=>{
      try{
        const version=JSON.parse(await command(["-j","version"]));
        if(version?.version!=="0.56.2")return false;
        const capability=JSON.parse(await command(["repl",CAPABILITY]));
        return capability?.capable===true;
      }catch{return false;}
    })();
    const result=await verified;
    if(!result)verified=undefined; // A later explicit launcher request may retry recovered control.
    return result;
  }
  return {
    async inspect(owner){
      if(!validOwner(owner,session)||!await verify())return {status:"unavailable",reason:"Verified Hyprland 0.56.2 control unavailable"};
      owners.set(owner.marker,{...owner});
      try{return observation(JSON.parse(await command(["repl",inspection(owner)])),owner);}
      catch{return {status:"unavailable",reason:"Compositor observation failed"};}
    },
    async apply(intent){
      if(!validOwner(intent.owner,session)||!Number.isSafeInteger(intent.revision)||intent.revision<0||
         !Number.isSafeInteger(intent.expectedExternalRevision)||intent.expectedExternalRevision<0||
         intent.originWorkspace!==undefined&&!Number.isSafeInteger(intent.originWorkspace)||!await verify())return {acknowledged:false};
      const result=JSON.parse(await command(["repl",action(intent)]));
      if(typeof result?.acknowledged!=="boolean")throw new Error("Unknown compositor action completion");
      return {acknowledged:result.acknowledged};
    },
    watch(owner,changed){
      if(disposed||!validSession||!validOwner(owner,session)||!env.XDG_RUNTIME_DIR)return ()=>{};
      const socket=createConnection(path.join(env.XDG_RUNTIME_DIR,"hypr",session,".socket2.sock"));
      sockets.add(socket);
      socket.on("data",()=>{if(!disposed)changed();});
      socket.on("error",()=>{if(!disposed)changed();});
      socket.on("close",()=>sockets.delete(socket));
      return ()=>{socket.destroy();sockets.delete(socket);};
    },
    dispose(){
      if(disposed)return disposal;disposed=true;
      for(const socket of sockets)socket.destroy();sockets.clear();
      const interrupted=[...pendingCommands];
      for(const child of children)child.kill("SIGKILL");
      const cleanups=[...owners.values()].map(owner=>command(["repl",cleanup(owner)],true));
      owners.clear();
      disposal=Promise.allSettled([...interrupted,...cleanups]).then(results=>{
        if(results.slice(interrupted.length).some(result=>result.status==="rejected"))
          console.warn("Television could not confirm compositor observer cleanup.");
      });
      return disposal;
    },
  };
}
