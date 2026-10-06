// Real generated-action seam: proofs/arch/desktop/linux-distribution.md#^linux-hyprland-control-seam
// Declared fixture: dedicated sandboxed package, private actual Hyprland 0.56.2; no menu/server acceptance is credited here.
import {_electron as electron,expect,test} from "@playwright/test";
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createHyprlandControl} from "../../src/hyprland-control.ts";
import type {WindowOwner} from "../../src/hyprland-visibility.ts";
import {observeHyprlandWindow} from "./linux-hyprland-observer.ts";
const packageDir=process.env.TV_LINUX_PACKAGE_DIR;
test.skip(process.env.TV_LINUX_HYPRLAND_FIXTURE!=="1"||!packageDir,"BLOCKED: requires owned actual Hyprland fixture and sandboxed package");
test("real Hyprland actions move only the owned window and reject delayed revision fences",async()=>{
 const temp=mkdtempSync(path.join(tmpdir(),"tv-hypr-seam-"));
 const control=createHyprlandControl({session:process.env.HYPRLAND_INSTANCE_SIGNATURE!});
 let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
 try{
  const env={...process.env,XDG_CONFIG_HOME:temp,DO_NOT_TRACK:"1",TV_OZONE_PLATFORM:"wayland"} as Record<string,string>;
  delete env.ELECTRON_DISABLE_SANDBOX;delete env.TV_TEST_MODE;
  app=await electron.launch({executablePath:path.join(packageDir!,process.env.TV_LINUX_PACKAGE_LAUNCHER??"television-launcher"),env,args:[],timeout:20000});
  await app.firstWindow();
  const native=await app.evaluate(({app,BrowserWindow})=>({pid:process.pid,noSandbox:app.commandLine.hasSwitch("no-sandbox"),
    renderer:BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId()}));
  expect(native.noSandbox).toBe(false);expect(readFileSync(`/proc/${native.renderer}/status`,"utf8")).toMatch(/^Seccomp:\s+2$/m);
  let owner:WindowOwner={pid:native.pid,applicationID:"computer.telepath.television",session:env.HYPRLAND_INSTANCE_SIGNATURE,marker:randomUUID()};
  await expect.poll(async()=> (await observeHyprlandWindow(owner)).status).toBe("owned");
  const before=await observeHyprlandWindow(owner);if(before.status!=="owned")throw new Error("Owned target unavailable");owner=before.owner;
  const bound=await control.inspect(owner);expect(bound.status).toBe("owned");if(bound.status!=="owned")throw new Error("Transport did not bind owned target");
  const oldHide={owner,revision:1,expectedExternalRevision:bound.externalRevision,visible:false,originWorkspace:before.workspace,holdingWorkspace:"special:tv-seam-owned"};
  expect(await control.apply({...oldHide,revision:2,visible:true})).toEqual({acknowledged:true});
  expect(await control.apply(oldHide)).toEqual({acknowledged:false});
  expect((await observeHyprlandWindow(owner))).toMatchObject({workspace:before.workspace,visibleOnMonitors:before.visibleOnMonitors});
  const unseen={...oldHide,revision:99};
  execFileSync("hyprctl",["-i",owner.session,"repl",`return hl.dispatch(hl.dsp.window.move({workspace=9,window="address:${owner.address}",follow=false})).ok`]);
  expect(await control.apply(unseen)).toEqual({acknowledged:false});
  expect((await observeHyprlandWindow(owner))).toMatchObject({workspace:9});
  const fresh=await control.inspect(owner);if(fresh.status!=="owned")throw new Error("Target lost after manual move");
  expect(fresh.externalRevision).toBeGreaterThan(bound.externalRevision);
  expect(await control.apply({...oldHide,revision:100,expectedExternalRevision:fresh.externalRevision,originWorkspace:9})).toEqual({acknowledged:true});
  await expect.poll(async()=>{const o=await observeHyprlandWindow(owner);return o.status==="owned"?{name:o.workspaceName,visible:o.visibleOnMonitors}:o;}).toEqual({name:"special:tv-seam-owned",visible:[]});
  const held=await control.inspect(owner);if(held.status!=="owned")throw new Error("Held target lost");
  expect(held.existingWorkspaces).not.toContain(9);
  expect(await control.apply({...oldHide,revision:101,expectedExternalRevision:fresh.externalRevision,visible:true,originWorkspace:9})).toEqual({acknowledged:false});
  expect(held.normalWorkspaces).toContain(held.activeNormalWorkspace);
  expect(await control.apply({...oldHide,revision:102,expectedExternalRevision:held.externalRevision,visible:true,originWorkspace:held.activeNormalWorkspace!})).toEqual({acknowledged:true});
  await expect.poll(async()=>{const o=await observeHyprlandWindow(owner);return o.status==="owned"?o.visibleOnMonitors.length:0;}).toBeGreaterThan(0);
 }finally{await control.dispose();await app?.close().catch(()=>{});rmSync(temp,{recursive:true,force:true});}
});


async function nativeFixture(run: (fixture: {app:Awaited<ReturnType<typeof electron.launch>>; owner:WindowOwner;
 control:ReturnType<typeof createHyprlandControl>; manual:(code:string)=>string; completed:()=>string[][];
 requested:()=>string[][]; withholdRegistration:()=>void})=>Promise<void>) {
 const temp=mkdtempSync(path.join(tmpdir(),"tv-hypr-owned-"));
 const session=process.env.HYPRLAND_INSTANCE_SIGNATURE!;
 const originalPATH=process.env.PATH;
 const record=path.join(temp,"completed.jsonl");writeFileSync(record,"");
 const requested=path.join(temp,"requested.jsonl");writeFileSync(requested,"");
 const withhold=path.join(temp,"withhold-first-registration");
 // Delivery-only fault: capture the real second repl (first registration after capability).
 // Its generated bytes are replayed on the real compositor after confirmed cleanup.
 writeFileSync(path.join(temp,"hyprctl"),`#!${process.execPath}\nconst fs=require("node:fs"),cp=require("node:child_process");const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(requested)},JSON.stringify(args)+"\\n");const calls=fs.readFileSync(${JSON.stringify(requested)},"utf8").trim().split("\\n").map(JSON.parse);if(fs.existsSync(${JSON.stringify(withhold)})&&args[2]==="repl"&&calls.filter(a=>a[2]==="repl").length===2){setInterval(()=>{},1000);}else{const out=cp.execFileSync("/usr/bin/hyprctl",args,{encoding:"utf8",timeout:1500,maxBuffer:1024*1024});fs.appendFileSync(${JSON.stringify(record)},JSON.stringify(args)+"\\n");process.stdout.write(out);}`,{mode:0o700});
 process.env.PATH=temp+path.delimiter+originalPATH;
 const control=createHyprlandControl({session});let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
 try {
  const env={...process.env,XDG_CONFIG_HOME:temp,DO_NOT_TRACK:"1",TV_OZONE_PLATFORM:"wayland"} as Record<string,string>;
  delete env.ELECTRON_DISABLE_SANDBOX;delete env.TV_TEST_MODE;
  app=await electron.launch({executablePath:path.join(packageDir!,process.env.TV_LINUX_PACKAGE_LAUNCHER??"television-launcher"),env,args:[],timeout:20000});
  await app.firstWindow();
  const pid=await app.evaluate(()=>process.pid);
  let owner:WindowOwner={pid,applicationID:"computer.telepath.television",session,marker:randomUUID()};
  await expect.poll(async()=> (await observeHyprlandWindow(owner)).status).toBe("owned");
  const native=await observeHyprlandWindow(owner);if(native.status!=="owned")throw new Error("Fixture target unavailable");owner=native.owner;
  const records=(file:string)=>readFileSync(file,"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s));
  await run({app,owner,control,manual:code=>execFileSync("/usr/bin/hyprctl",["-i",session,"repl",code],{encoding:"utf8",timeout:2000}).trim(),completed:()=>records(record),requested:()=>records(requested),withholdRegistration:()=>writeFileSync(withhold,"")});
 }finally{await control.dispose();await app?.close().catch(()=>{});process.env.PATH=originalPATH;rmSync(temp,{recursive:true,force:true});}
}
test("refused newer restore fences an older unseen Hide without movement",async()=>{
 await nativeFixture(async({owner,control})=>{
  const bound=await control.inspect(owner);if(bound.status!=="owned")throw new Error("No binding");
  const before=await observeHyprlandWindow(owner);
  const delayed={owner,revision:1,expectedExternalRevision:bound.externalRevision,visible:false,holdingWorkspace:"special:late-hide-after-refusal"};
  const absent=987654321;expect(bound.existingWorkspaces).not.toContain(absent);
  expect(await control.apply({...delayed,revision:2,visible:true,originWorkspace:absent})).toEqual({acknowledged:false});
  expect(await control.apply(delayed)).toEqual({acknowledged:false});
  expect(await observeHyprlandWindow(owner)).toEqual(before);
 });
});
test("disposal before withheld first registration revokes later native delivery",async()=>{
 await nativeFixture(async({owner,control,manual,completed,requested,withholdRegistration})=>{
  withholdRegistration();
  const before=await observeHyprlandWindow(owner);
  const started=Date.now();expect((await control.inspect(owner)).status).toBe("unavailable");
  expect(Date.now()-started).toBeLessThan(5000);
  const delayed=requested().filter(args=>args[2]==="repl").at(-1)!;
  expect(completed().filter(args=>args[2]==="repl")).toHaveLength(1);
  const count=completed().length;control.dispose();
  await expect.poll(()=>completed().length).toBe(count+1);
  expect(JSON.parse(manual(delayed[3]!))).toEqual({status:"replaced"});
  expect(manual(`local r=rawget(_G,"__television_visibility_v1")["${owner.marker}"]; return tostring(r.dead and r.subs==nil)`)).toBe("true");
  expect(await observeHyprlandWindow(owner)).toEqual(before);
 });
});
test("real unique-client binding refuses ambiguity, wrong identity and closed replacement",async()=>{
 await nativeFixture(async({app,owner,control})=>{
  const bound=await control.inspect(owner);expect(bound.status).toBe("owned");if(bound.status!=="owned")throw new Error("No binding");
  expect((await control.inspect({...owner,address:"0x1"})).status).toBe("replaced");
  const primaryID=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.id);
  const other=createHyprlandControl({session:owner.session});
  try {
   await app.evaluate(({BrowserWindow})=>{const w=new BrowserWindow({show:true,webPreferences:{sandbox:true}});void w.loadURL("data:text/html,<h1>Declared second native window fixture</h1>");});
   await expect.poll(async()=> (await other.inspect({...owner,marker:randomUUID(),address:undefined})).status).toBe("ambiguous");
   await app.evaluate(({BrowserWindow},id)=>{BrowserWindow.fromId(id)!.destroy();},primaryID);
   await expect.poll(async()=> (await control.inspect(owner)).status).toBe("replaced");
   expect(await control.apply({owner,revision:10,expectedExternalRevision:bound.externalRevision,visible:false,holdingWorkspace:"special:must-not-move-replacement"})).toEqual({acknowledged:false});
  } finally {await other.dispose();}
 });
});
test("real fullscreen and grouped windows refuse Hide without movement",async()=>{
 await nativeFixture(async({app,owner,control,manual})=>{
  const start=await control.inspect(owner);if(start.status!=="owned")throw new Error("No binding");
  const target=`"address:${owner.address}"`;
  expect(manual(`return hl.dispatch(hl.dsp.window.fullscreen({window=${target},mode="fullscreen",action="set"})).ok`)).toBe("true");
  const full=await control.inspect(owner);if(full.status!=="owned")throw new Error("Fullscreen target lost");expect(full.supportedWindowState).toBe(false);
  expect(await control.apply({owner,revision:1,expectedExternalRevision:full.externalRevision,visible:false,holdingWorkspace:"special:refused-fullscreen"})).toEqual({acknowledged:false});
  expect((await observeHyprlandWindow(owner))).toMatchObject({workspace:start.workspace,visibleOnMonitors:start.visibleOnMonitors});
  expect(manual(`return hl.dispatch(hl.dsp.window.fullscreen({window=${target},mode="fullscreen",action="unset"})).ok`)).toBe("true");
  expect(manual(`return hl.dispatch(hl.dsp.group.toggle({window=${target}})).ok`)).toBe("true");
  await app.evaluate(({BrowserWindow})=>{const second=new BrowserWindow({show:true,webPreferences:{sandbox:true}});void second.loadURL("data:text/html,<h1>Declared group member fixture</h1>");});
  const members=()=>JSON.parse(execFileSync("hyprctl",["-i",owner.session,"-j","clients"],{encoding:"utf8"})).filter((w:{pid:number})=>w.pid===owner.pid).map((w:{address:string;workspace:{id:number}})=>({address:w.address,workspace:w.workspace.id})).sort((a:{address:string},b:{address:string})=>a.address.localeCompare(b.address));
  await expect.poll(()=>members().length).toBe(2);
  const join=`local target,other; for _,w in ipairs(hl.get_windows()) do if w.pid==${owner.pid} then if w.address=="${owner.address}" then target=w else other=w end end end; target.group:add(other); return target.group.size`;
  expect(manual(join)).toBe("2");
  const groupBefore=members();
  const group=await control.inspect(owner);if(group.status!=="owned")throw new Error("Group target lost");expect(group.supportedWindowState).toBe(false);
  expect(await control.apply({owner,revision:2,expectedExternalRevision:group.externalRevision,visible:false,holdingWorkspace:"special:refused-group"})).toEqual({acknowledged:false});
  expect(members()).toEqual(groupBefore);
 });
});
test("real manual reveal invalidates unseen Hide and visible destination on a second output",async()=>{
 await nativeFixture(async({owner,control,manual})=>{
  const start=await control.inspect(owner);if(start.status!=="owned")throw new Error("No binding");
  const hidden={owner,revision:1,expectedExternalRevision:start.externalRevision,visible:false,originWorkspace:start.workspace,holdingWorkspace:"special:manual-reveal-fixture"};
  expect(await control.apply(hidden)).toEqual({acknowledged:true});
  const delayed={...hidden,revision:99};
  expect(manual('return hl.dispatch(hl.dsp.focus({monitor=1})).ok')).toBe("true");
  expect(manual('return hl.dispatch(hl.dsp.focus({workspace="special:manual-reveal-fixture"})).ok')).toBe("true");
  const revealed=await control.inspect(owner);if(revealed.status!=="owned")throw new Error("Revealed target unavailable");
  expect(revealed.externalRevision).toBeGreaterThan(start.externalRevision);
  expect(revealed.visibleOnMonitors).toContain(1);
  expect(await control.apply(delayed)).toEqual({acknowledged:false});
  // A destination visible anywhere is refused independently of its current monitor.
  expect(await control.apply({...hidden,revision:100,expectedExternalRevision:revealed.externalRevision})).toEqual({acknowledged:false});
  expect((await observeHyprlandWindow(owner))).toMatchObject({workspaceName:"special:manual-reveal-fixture",visibleOnMonitors:revealed.visibleOnMonitors});
 });
});

test("real disposal rejects delayed native payload and removes owned observers",async()=>{
 await nativeFixture(async({owner,control,manual,completed})=>{
  const start=await control.inspect(owner);if(start.status!=="owned")throw new Error("No binding");
  const registered=completed().at(-1)!;
  const snapshot=`fixture_subscriptions_${owner.marker.replaceAll("-","")}`;
  expect(manual(`local refs=rawget(_G,"__television_visibility_v1")["${owner.marker}"].subs; rawset(_G,"${snapshot}",refs); return #refs`)).toBe("4");
  expect(await control.apply({owner,revision:1,expectedExternalRevision:start.externalRevision,visible:false,originWorkspace:start.workspace,holdingWorkspace:"special:disposal-fixture"})).toEqual({acknowledged:true});
  const emitted=completed().at(-1)!;expect(emitted[2]).toBe("repl");
  const count=completed().length;control.dispose();
  await expect.poll(()=>completed().length).toBe(count+1);
  // Replay the actual generated payload after confirmed cleanup, bypassing the Node disposed guard.
  expect(JSON.parse(manual(emitted[3]!))).toEqual({acknowledged:false});
  expect(JSON.parse(manual(registered[3]!))).toEqual({status:"replaced"});
  expect(manual(`local inactive=true; for _,sub in ipairs(rawget(_G,"${snapshot}")) do inactive=inactive and not sub:is_active() end; rawset(_G,"${snapshot}",nil); return tostring(inactive)`)).toBe("true");
 });
});

test("real Lua treats hostile owner and workspace strings as data",async()=>{
 await nativeFixture(async({owner:original,control})=>{
  const owner={...original,marker:'quote"\\\n; error("injected"); -- ☃'};
  const bound=await control.inspect(owner);expect(bound.status).toBe("owned");if(bound.status!=="owned")throw new Error("Hostile data did not bind");
  const name='special:quoted-";error("injected");--☃';
  expect(await control.apply({owner,revision:1,expectedExternalRevision:bound.externalRevision,visible:false,originWorkspace:bound.workspace,holdingWorkspace:name})).toEqual({acknowledged:true});
  const held=await observeHyprlandWindow(owner);expect(held).toMatchObject({workspaceName:name,visibleOnMonitors:[]});
 });
});
