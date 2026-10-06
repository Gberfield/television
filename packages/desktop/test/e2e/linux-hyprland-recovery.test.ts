// Acceptance: proofs/product/linux-desktop.md#^linux-hyprland-hide-acceptance.
// Real package/link/server/compositor/Notification. Delivery faults replace only the owned hyprctl protocol edge.
import {_electron as electron,expect,test} from "@playwright/test";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {execFileSync,spawn} from "node:child_process";
import type {Duplex} from "node:stream";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {TelevisionClient} from "@telepath-computer/television-shared";
import {startConnectTestServer} from "./connect-server.ts";
import {observeHyprlandWindow} from "./linux-hyprland-observer.ts";
import type {WindowOwner} from "../../src/hyprland-visibility.ts";
import {encodeLuaString} from "../../src/hyprland-control.ts";
const packageDir=process.env.TV_LINUX_PACKAGE_DIR;
const launcher=process.env.TV_LINUX_PACKAGE_LAUNCHER??"television-launcher";
const evidence=process.env.TV_LINUX_EVIDENCE_DIR;
const notificationRecord=process.env.TV_LINUX_NOTIFICATION_RECORD;
test.skip(!packageDir||process.env.TV_LINUX_HYPRLAND_FIXTURE!=="1"||!process.env.HYPRLAND_INSTANCE_SIGNATURE||!notificationRecord,
 "BLOCKED: needs actual owned Hyprland package and native notification fixture");

async function connectedFixture(run:(f:{app:Awaited<ReturnType<typeof electron.launch>>;
 page:Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>;
 owner:WindowOwner;origin:number;mode:(value:string)=>void;hide:()=>Promise<void>;reopen:()=>Promise<void>;
 visible:(value:boolean,workspace?:number)=>Promise<void>;capture:(stage:string)=>Promise<void>;
 continuity:()=>Promise<void>;manual:(code:string)=>string;notifications:()=>Array<{title:string;body:string}>;
 root:string;groupMember:()=>Promise<{pid:number;address:string}>;processes:()=>Array<{kind:string;pid:number}>})=>Promise<void>) {
 expect(evidence,"Native screenshots required").toBeTruthy();
 const root=mkdtempSync(path.join(tmpdir(),"tv-recovery-"));
 const proxy=path.join(root,"bin");mkdirSync(proxy);
 const modePath=path.join(root,"mode");writeFileSync(modePath,"normal");
 const processLog=path.join(root,"commands.jsonl");writeFileSync(processLog,"");
 // The real CLI is forwarded unchanged. Only delivery/receipt is withheld or delayed.
 writeFileSync(path.join(proxy,"hyprctl"),`#!${process.execPath}\nconst fs=require("node:fs"),cp=require("node:child_process");const args=process.argv.slice(2),flag=${JSON.stringify(modePath)},log=${JSON.stringify(processLog)};const mode=fs.readFileSync(flag,"utf8");let kind="forward";const action=args[2]==="repl"&&args[3].includes("local visible=false");const cleanup=args[2]==="repl"&&args[3].includes("registry[marker]={dead=true}");if(mode==="absent")kind="absent";else if(mode==="cleanup-stall"&&cleanup)kind="cleanup-stall";else if(mode==="lost-hide"&&action)kind="lost-hide";else if(mode==="delay-hide"&&action)kind="delay-hide";fs.appendFileSync(log,JSON.stringify({kind,pid:process.pid})+"\\n");if(kind==="absent")process.exit(7);if(kind==="cleanup-stall")setInterval(()=>{},1000);else{const forward=()=>{try{const result=cp.execFileSync("/usr/bin/hyprctl",args,{encoding:"utf8",timeout:1500,maxBuffer:1048576});fs.appendFileSync(log,JSON.stringify({kind:kind+"-completed",pid:process.pid})+"\\n");if(kind==="lost-hide")fs.writeFileSync(flag,"normal");else process.stdout.write(result);}catch{process.exit(8);}};if(kind==="delay-hide"){fs.writeFileSync(flag,"normal");setTimeout(forward,400);}else forward();}`,{mode:0o700});
 let server:Awaited<ReturnType<typeof startConnectTestServer>>|undefined;
 let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
 let secondary:ReturnType<typeof spawn>|undefined;
 let groupApp:Awaited<ReturnType<typeof electron.launch>>|undefined;
 try {
  server=await startConnectTestServer({bundledViews:true});const sockets:Duplex[]=[];
  server.server.httpServer.on("upgrade",(request,socket)=>{if(new URL(request.url!,server!.serverURL).pathname==="/events")sockets.push(socket);});
  const client=new TelevisionClient(server.serverURL,{token:server.token});
  const {channel}=await client.channels.create({name:"Declared recovery fixture"});
  const artifact=path.join(root,"retained.md");writeFileSync(artifact,"# Real recovery document\n\nDeclared synthetic content retained through failure.\n");
  await client.artifacts.create({channelID:channel.id,kind:"path",title:"Real recovery document",path:artifact});
  await client.display.patch({focusedChannelId:channel.id});
  const env={...process.env,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CURRENT_DESKTOP:"Hyprland",DO_NOT_TRACK:"1",PATH:proxy+path.delimiter+process.env.PATH} as Record<string,string>;
  delete env.ELECTRON_DISABLE_SANDBOX;delete env.TV_TEST_MODE;
  const executablePath=path.join(packageDir!,launcher);
  app=await electron.launch({executablePath,env,args:[],timeout:20000});const primary=app;
  const page=await primary.firstWindow();
  // Electron silently cancels beforeunload; do not let Playwright auto-dismiss its stale CDP dialog event.
  page.on("dialog",()=>{});
  await page.getByRole("textbox",{name:"Link from your agent"}).fill(`${server.serverURL}/?token=${server.token}`);
  await page.getByRole("textbox",{name:"Link from your agent"}).press("Enter");
  await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
  const guestText=()=>primary.evaluate(async({webContents})=>Promise.all(webContents.getAllWebContents().filter(c=>c.getType()==="webview").map(c=>c.executeJavaScript("document.body.innerText").catch(()=>""))));
  await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Declared synthetic content retained through failure.")]));
  const guestID=await primary.evaluate(async({webContents})=>{for(const c of webContents.getAllWebContents().filter(c=>c.getType()==="webview")){if(await c.executeJavaScript('document.body.innerText.includes("Declared synthetic content retained through failure.")')){await c.executeJavaScript('Object.assign(window,{recoveryGuestSentinel:"original-recovery-guest"}); true');return c.id;}}throw new Error("Rendered recovery document absent");});
  let navigations=0;page.on("framenavigated",frame=>{if(frame===page.mainFrame())++navigations;});
  await expect.poll(()=>sockets.length).toBeGreaterThan(0);const originalSockets=[...sockets];
  const savedPath=path.join(env.XDG_CONFIG_HOME,"Television/connection.json"),saved=readFileSync(savedPath);
  const state=()=>primary.evaluate(({app,BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0]!;return {pid:process.pid,id:w.id,contents:w.webContents.id,handle:w.getNativeWindowHandle().toString("hex"),renderer:w.webContents.getOSProcessId(),noSandbox:app.commandLine.hasSwitch("no-sandbox")};});
  const before=await state();expect(before.noSandbox).toBe(false);
  await page.evaluate(()=>Object.assign(window,{recoverySentinel:"original-recovery-document"}));
  let owner:WindowOwner={pid:before.pid,applicationID:"computer.telepath.television",session:env.HYPRLAND_INSTANCE_SIGNATURE,marker:randomUUID()};
  await expect.poll(async()=> (await observeHyprlandWindow(owner)).status).toBe("owned");
  const origin=await observeHyprlandWindow(owner);if(origin.status!=="owned")throw new Error("No exact native recovery target");owner=origin.owner;
  const hide=()=>primary.evaluate(({Menu,BrowserWindow})=>{const item=Menu.getApplicationMenu()!.items.find(i=>i.label==="Window")!.submenu!.items.find(i=>i.label==="Hide")!;item.click(undefined,BrowserWindow.getAllWindows()[0],undefined);});
  const reopen=async()=>{
   const child=secondary=spawn(executablePath,[],{env,stdio:"ignore"});
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{expect(await Promise.race([new Promise(resolve=>{child.once("error",error=>resolve({error:String(error)}));child.once("exit",(code,signal)=>resolve({code,signal}));}),new Promise(resolve=>{timer=setTimeout(()=>resolve({timeout:true}),15000);})])).toEqual({code:0,signal:null});}
   finally{clearTimeout(timer);}
  };
  const visible=async(value:boolean,workspace?:number)=>{await expect.poll(async()=>{const o=await observeHyprlandWindow(owner);return o.status==="owned"?{visible:o.visibleOnMonitors.length>0,workspace:workspace===undefined?null:o.workspace}:o;},{timeout:10000}).toEqual({visible:value,workspace:workspace??null});};
  const capture=async(stage:string)=>{const dest=path.join(evidence!,test.info().title.replace(/[^a-zA-Z0-9]+/g,"-").slice(0,140));mkdirSync(dest,{recursive:true});writeFileSync(path.join(dest,stage+"-native-notifications.jsonl"),readFileSync(notificationRecord!));const o=await observeHyprlandWindow(owner);writeFileSync(path.join(dest,stage+"-native.json"),JSON.stringify(o,null,2)+"\n");execFileSync("grim",[path.join(dest,stage+"-compositor.png")],{timeout:5000});};
  const continuity=async()=>{
   expect(await state()).toEqual(before);expect(readFileSync(savedPath)).toEqual(saved);expect(sockets).toEqual(originalSockets);expect(originalSockets.every(s=>!s.destroyed)).toBe(true);
   expect(await page.evaluate(()=> (window as typeof window & {recoverySentinel:string}).recoverySentinel)).toBe("original-recovery-document");
   expect(navigations).toBe(0);await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining("Declared synthetic content retained through failure.")]));
   expect(await primary.evaluate(({webContents},id)=>webContents.fromId(id)!.executeJavaScript('window.recoveryGuestSentinel'),guestID)).toBe("original-recovery-guest");
   expect(readFileSync(`/proc/${before.renderer}/status`,"utf8")).toMatch(/^Seccomp:\s+2$/m);expect(readFileSync(`/proc/${before.renderer}/status`,"utf8")).toMatch(/^NoNewPrivs:\s+1$/m);
  };
  const notifications=()=>readFileSync(notificationRecord!,"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s));
  await visible(true);await capture("before");
  await run({app:primary,page,owner,origin:origin.workspace,root,hide,reopen,visible,capture,continuity,
   groupMember:async()=>{
    groupApp=await electron.launch({executablePath,env:{...env,XDG_CONFIG_HOME:path.join(root,"group-profile")},args:[],timeout:20000});
    await groupApp.firstWindow();const pid=await groupApp.evaluate(()=>process.pid);
    const groupOwner={...owner,pid,address:undefined,marker:randomUUID()};
    await expect.poll(async()=> (await observeHyprlandWindow(groupOwner)).status).toBe("owned");
    const o=await observeHyprlandWindow(groupOwner);if(o.status!=="owned")throw new Error("Independent group member absent");
    return {pid,address:o.owner.address!};
   },
   mode:value=>writeFileSync(modePath,value),manual:code=>execFileSync("/usr/bin/hyprctl",["-i",owner.session,"repl",code],{encoding:"utf8",timeout:2000}).trim(),notifications,
   processes:()=>readFileSync(processLog,"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s))});
 }finally{
  writeFileSync(modePath,"normal");
  if(secondary?.exitCode===null&&secondary.signalCode===null){secondary.kill("SIGKILL");await new Promise<void>(resolve=>secondary!.once("close",()=>resolve()));}
  await app?.evaluate(async({webContents})=>{for(const contents of webContents.getAllWebContents())await contents.executeJavaScript("window.onbeforeunload=null").catch(()=>{});}).catch(()=>{});
  await groupApp?.close().catch(()=>{});await app?.close().catch(()=>{});await server?.dispose();rmSync(root,{recursive:true,force:true});
 }
}

test("packaged recovery retains its hidden document through unavailable control and retries on a later launcher",async()=>{
 await connectedFixture(async f=>{
  const count=f.notifications().length;f.mode("absent");await f.hide();
  await expect.poll(()=>f.notifications().slice(count).map(n=>n.body)).toContain("Television could not confirm whether its window is hidden. Open Television again to retry.");
  await f.visible(true,f.origin);await f.continuity();await f.capture("control-absent-before-hide");
  f.mode("normal");await f.hide();await f.visible(false);await f.capture("hidden");
  const failedRestoreCount=f.notifications().length;f.mode("absent");await f.reopen();
  await expect.poll(()=>f.notifications().slice(failedRestoreCount).map(n=>n.body)).toContain("Television is still running, but could not restore its window. Open Television again to retry.");
  await f.visible(false);await f.continuity();await f.capture("failed-restore-still-hidden");
  f.mode("normal");await f.reopen();await f.visible(true,f.origin);await f.continuity();await f.capture("recovered");
 });
});
test("packaged lost Hide receipt reconciles actual placement and retains the original window",async()=>{
 await connectedFixture(async f=>{f.mode("lost-hide");await f.hide();await f.visible(false);await f.capture("receipt-lost-hidden");await f.reopen();await f.visible(true,f.origin);await f.continuity();await f.capture("restored");expect(f.processes().some(p=>p.kind==="lost-hide")).toBe(true);});
});
test("packaged delayed Hide is superseded by a real launcher request",async()=>{
 await connectedFixture(async f=>{f.mode("delay-hide");await f.hide();await expect.poll(()=>f.processes().some(p=>p.kind==="delay-hide")).toBe(true);await f.reopen();await expect.poll(()=>f.processes().some(p=>p.kind==="delay-hide-completed")).toBe(true);await f.visible(true,f.origin);await f.continuity();await f.capture("newer-launcher-visible");});
});
test("packaged cancelled Quit preserves Hide and launcher restore on its surviving document",async()=>{
 await connectedFixture(async f=>{
  await f.page.evaluate(()=>{window.onbeforeunload=event=>{Object.assign(window,{quitWasCancelled:true});event.returnValue=false;return false;};});
  await f.app.evaluate(({app})=>app.quit());
  await expect.poll(()=>f.page.evaluate(()=> (window as typeof window & {quitWasCancelled?:boolean}).quitWasCancelled)).toBe(true);
  await f.hide();await f.visible(false);await f.capture("after-cancelled-quit-hidden");await f.reopen();await f.visible(true,f.origin);await f.continuity();await f.capture("after-cancelled-quit-restored");
  await f.page.evaluate(()=>{window.onbeforeunload=null;});
 });
});

test("packaged manual placement overrides old Hide history and vanished origin uses validated fallback",async()=>{
 await connectedFixture(async f=>{
  const target=encodeLuaString("address:"+f.owner.address);
  await f.hide();await f.visible(false);
  expect(f.manual(`return hl.dispatch(hl.dsp.window.move({window=${target},workspace=9,follow=false})).ok`)).toBe("true");
  expect(f.manual('return hl.dispatch(hl.dsp.focus({workspace=9})).ok')).toBe("true");
  await f.reopen();await f.visible(true,9);await f.continuity();await f.capture("manual-origin-preserved");
  await f.hide();await f.visible(false);
  expect(f.manual(`return hl.dispatch(hl.dsp.focus({workspace=${f.origin}})).ok`)).toBe("true");
  await expect.poll(()=>JSON.parse(f.manual('local ids={}; for _,ws in ipairs(hl.get_workspaces()) do ids[#ids+1]=ws.id end; return "["..table.concat(ids,",").."]"')) as number[]).not.toContain(9);
  const spaces=JSON.parse(f.manual('local ids={}; for _,ws in ipairs(hl.get_workspaces()) do ids[#ids+1]=ws.id end; return "["..table.concat(ids,",").."]"')) as number[];
  expect(spaces).not.toContain(9);
  const active=Number(f.manual('return hl.get_active_workspace().id'));
  await f.reopen();await f.visible(true,active);await f.continuity();await f.capture("deleted-origin-fallback");
 });
});

for(const shape of ['normal','floating','maximized'] as const){
 test(`packaged ${shape} state survives compositor Hide and launcher restore`,async()=>{
  await connectedFixture(async f=>{
   const target=encodeLuaString("address:"+f.owner.address);
   if(shape==='floating')expect(f.manual(`return hl.dispatch(hl.dsp.window.float({window=${target},action="set"})).ok`)).toBe("true");
   if(shape==='maximized')await f.app.evaluate(({Menu,BrowserWindow})=>{const item=Menu.getApplicationMenu()!.items.find(i=>i.label==="Window")!.submenu!.items.find(i=>i.label==="Maximize / Restore")!;item.click(undefined,BrowserWindow.getAllWindows()[0],undefined);});
   const nativeState=()=>{const entries=JSON.parse(execFileSync("/usr/bin/hyprctl",["-i",f.owner.session,"-j","clients"],{encoding:"utf8",timeout:2000}));const w=entries.find((w:{address:string})=>w.address===f.owner.address);return {floating:w.floating,fullscreen:w.fullscreen,fullscreenClient:w.fullscreenClient,size:w.size};};
   await expect.poll(()=>({floating:nativeState().floating,fullscreen:nativeState().fullscreen})).toEqual({floating:shape==='floating',fullscreen:shape==='maximized'?1:0});
   const before=nativeState();await f.capture("native-state-before");await f.hide();await f.visible(false);await f.capture("native-state-hidden");await f.reopen();await f.visible(true,f.origin);await expect.poll(nativeState).toEqual(before);await f.continuity();await f.capture("native-state-restored");
  });
 });
}
for(const shape of ['fullscreen','group'] as const){
 test(`packaged unsupported ${shape} refuses Hide without moving its native members`,async()=>{
  await connectedFixture(async f=>{
   const target=encodeLuaString("address:"+f.owner.address);
   const memberPIDs=[f.owner.pid];
   if(shape==='fullscreen')expect(f.manual(`return hl.dispatch(hl.dsp.window.fullscreen({window=${target},mode="fullscreen",action="set"})).ok`)).toBe("true");
   else{
    expect(f.manual(`return hl.dispatch(hl.dsp.group.toggle({window=${target}})).ok`)).toBe("true");
    const other=await f.groupMember();memberPIDs.push(other.pid);
    expect(f.manual(`local target,other; for _,w in ipairs(hl.get_windows()) do if w.address==${encodeLuaString(f.owner.address!)} then target=w elseif w.address==${encodeLuaString(other.address)} then other=w end end; target.group:add(other); local index; for i,w in ipairs(target.group.members) do if w.address==target.address then index=i end end; local result=hl.dispatch(hl.dsp.group.active({window=${target},index=index})); if not result.ok then error("cannot select actual main group member") end; return target.group.size`)).toBe("2");
    expect(f.manual(`return hl.dispatch(hl.dsp.focus({window=${target}})).ok`)).toBe("true");
   }
   const members=()=>JSON.parse(execFileSync("/usr/bin/hyprctl",["-i",f.owner.session,"-j","clients"],{encoding:"utf8"})).filter((w:{pid:number})=>memberPIDs.includes(w.pid)).map((w:{address:string;workspace:{id:number}})=>({address:w.address,workspace:w.workspace.id})).sort((a:{address:string},b:{address:string})=>a.address.localeCompare(b.address));
   // Native target focus is independently observed; menu callback delivery remains declared harness input.
   await expect.poll(()=>JSON.parse(execFileSync("/usr/bin/hyprctl",["-i",f.owner.session,"-j","activewindow"],{encoding:"utf8"})).address).toBe(f.owner.address);
   const before=members(),count=f.notifications().length;await f.capture("unsupported-before");await f.hide();
   await expect.poll(()=>f.notifications().slice(count).map(n=>n.body)).toContain("Television could not hide this window. It remains open.");
   expect(members()).toEqual(before);await f.visible(true,f.origin);await f.continuity();await f.capture("unsupported-refusal-visible");
  });
 });
}

test("packaged manual holding reveal on a second output cancels old restoration history",async()=>{
 await connectedFixture(async f=>{
  await f.hide();await f.visible(false);const held=await observeHyprlandWindow(f.owner);if(held.status!=="owned")throw new Error("Held native target missing");
  expect(f.manual('return hl.dispatch(hl.dsp.focus({monitor=1})).ok')).toBe("true");
  expect(f.manual(`return hl.dispatch(hl.dsp.focus({workspace=${encodeLuaString(held.workspaceName)}})).ok`)).toBe("true");
  await expect.poll(async()=>{const o=await observeHyprlandWindow(f.owner);return o.status==="owned"?o.visibleOnMonitors:[];}).toContain(1);
  await f.reopen();await f.visible(true,held.workspace);await f.continuity();await f.capture("manual-reveal-preserved");
  await f.hide();await f.visible(false);const hidden=await observeHyprlandWindow(f.owner);expect(hidden).not.toMatchObject({workspaceName:held.workspaceName});
  await f.capture("fresh-inactive-holding");await f.reopen();await f.visible(true);await f.continuity();await f.capture("fresh-hold-restored");
 });
});

test("packaged final Quit waits for termination of a stalled cleanup child",async()=>{
 await connectedFixture(async f=>{
  await f.hide();await f.visible(false);await f.reopen();await f.visible(true,f.origin);await f.continuity();
  f.mode("cleanup-stall");await f.capture("before-final-quit");
  const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
  await f.app.evaluate(({app})=>app.quit()).catch(()=>{});
  await expect.poll(()=>f.processes().filter(p=>p.kind==="cleanup-stall").length).toBe(1);
  const child=f.processes().find(p=>p.kind==="cleanup-stall")!;expect(alive(child.pid)).toBe(true);expect(alive(f.owner.pid)).toBe(true);
  await expect.poll(()=>alive(f.owner.pid),{timeout:6000}).toBe(false);
  expect(alive(child.pid)).toBe(false);
  expect((await observeHyprlandWindow(f.owner)).status).toBe("missing");await f.capture("after-final-quit");
  // Native cleanup was deliberately withheld: child lifetime passes, observer removal is unconfirmed, not credited.
 });
});

test("packaged restart after closing a held target starts visibly and never adopts old ownership",async()=>{
 await connectedFixture(async f=>{
  await f.hide();await f.visible(false);await f.capture("old-owned-target-hidden");
  const originalProcess=f.app.process();
  await f.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.destroy()).catch(()=>{});
  await expect.poll(async()=> (await observeHyprlandWindow(f.owner)).status).toBe("missing");
  await expect.poll(()=>originalProcess.exitCode,{timeout:6000}).not.toBe(null);
  const env={...process.env,XDG_CONFIG_HOME:path.join(f.root,"config"),XDG_CURRENT_DESKTOP:"Hyprland",DO_NOT_TRACK:"1"} as Record<string,string>;
  delete env.ELECTRON_DISABLE_SANDBOX;delete env.TV_TEST_MODE;
  const fresh=await electron.launch({executablePath:path.join(packageDir!,launcher),env,args:[],timeout:20000});
  try{
   const page=await fresh.firstWindow();await expect(page.locator("#app[data-app-state='connected']")).toBeVisible();
   const state=await fresh.evaluate(({BrowserWindow,app})=>({pid:process.pid,renderer:BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId(),noSandbox:app.commandLine.hasSwitch("no-sandbox")}));
   expect(state.pid).not.toBe(f.owner.pid);expect(state.noSandbox).toBe(false);
   const owner={...f.owner,pid:state.pid,address:undefined,marker:randomUUID()};
   await expect.poll(async()=>{const o=await observeHyprlandWindow(owner);return o.status==="owned"?o.visibleOnMonitors.length:0;}).toBeGreaterThan(0);
   expect(await page.evaluate(()=> (window as typeof window & {recoverySentinel?:string}).recoverySentinel)).toBe(undefined);
   expect(readFileSync(`/proc/${state.renderer}/status`,"utf8")).toMatch(/^Seccomp:\s+2$/m);
   const dest=path.join(evidence!,"fresh-after-held-target-close");mkdirSync(dest,{recursive:true});writeFileSync(path.join(dest,"fresh-native.json"),JSON.stringify(await observeHyprlandWindow(owner),null,2)+"\n");execFileSync("grim",[path.join(dest,"fresh-visible-compositor.png")],{timeout:5000});
  }finally{await fresh.close();}
 });
});
