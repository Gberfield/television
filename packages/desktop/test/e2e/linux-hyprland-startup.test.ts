// Acceptance: proofs/product/linux-desktop.md#^linux-hyprland-hide-acceptance.
// Loopback inspector substitutes scheduling only; real profile lock/window/startup remain unchanged.
import {test,expect,chromium} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import WebSocket from 'ws';
import {extractFile} from '@electron/asar';
import {TelevisionClient} from '@telepath-computer/television-shared';
import {startConnectTestServer} from './connect-server.ts';
const packageDir=process.env.TV_LINUX_PACKAGE_DIR,evidence=process.env.TV_LINUX_EVIDENCE_DIR;
test.skip(!packageDir||process.env.TV_LINUX_HYPRLAND_FIXTURE!=='1'||!process.env.HYPRLAND_INSTANCE_SIGNATURE,'BLOCKED: needs owned actual Hyprland package');
type Reply={scriptSource?:string;result?:{value?:string};callFrames?:Array<{callFrameId:string;location:{scriptId:string;lineNumber:number;columnNumber:number}}>};
async function inspector(url:string){
 const socket=new WebSocket(url);let next=0;const events:Array<{method:string;params:Reply}>=[];
 const pending=new Map<number,{resolve:(value:Reply)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 socket.on('message',data=>{const m=JSON.parse(data.toString()) as {id?:number;method?:string;params?:Reply;result?:Reply;error?:{message:string}};
  if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result??{});}}
  else if(m.method)events.push({method:m.method,params:m.params??{}});
 });
 socket.on('error',()=>{});
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Inspector open deadline')),5000);socket.once('open',()=>{clearTimeout(timer);resolve();});socket.once('error',error=>{clearTimeout(timer);reject(error);});});
 return {send:(method:string,params:Record<string,unknown>={})=>new Promise<Reply>((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Inspector deadline: '+method));},5000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));}),
  event:async(method:string)=>{await expect.poll(()=>events.some(e=>e.method===method),{timeout:5000}).toBe(true);const i=events.findIndex(e=>e.method===method);return events.splice(i,1)[0]!.params;},
  close:()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Inspector closed'));}pending.clear();socket.close();}};
}
test('packaged same-profile launcher during verified windowless startup creates one visible original process',async()=>{
 expect(evidence,'Original compositor captures required').toBeTruthy();
 const root=mkdtempSync(path.join(tmpdir(),'tv-startup-'));
 const dest=path.join(evidence!,'windowless-startup');mkdirSync(dest,{recursive:true});
 let server:Awaited<ReturnType<typeof startConnectTestServer>>|undefined;
 let primary:ReturnType<typeof spawn>|undefined,secondary:ReturnType<typeof spawn>|undefined;
 let debug:Awaited<ReturnType<typeof inspector>>|undefined,browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined;
 let alias:string|undefined,paused=false,stderr='';
 const alive=(child:ReturnType<typeof spawn>|undefined)=>child?.exitCode===null&&child.signalCode===null;
 const stop=async(child:ReturnType<typeof spawn>|undefined)=>{if(!alive(child))return;child!.kill('SIGTERM');await expect.poll(()=>alive(child),{timeout:3000}).toBe(false).catch(async()=>{child!.kill('SIGKILL');await expect.poll(()=>alive(child),{timeout:2000}).toBe(false);});};
 try{
  server=await startConnectTestServer({bundledViews:true});const client=new TelevisionClient(server.serverURL,{token:server.token});
  const {channel}=await client.channels.create({name:'Declared startup fixture'});const artifact=path.join(root,'startup.md');writeFileSync(artifact,'# Real startup document\n\nAuthenticated content after a windowless launcher request.\n');
  await client.artifacts.create({channelID:channel.id,kind:'path',title:'Real startup document',path:artifact});await client.display.patch({focusedChannelId:channel.id});
  const env={...process.env,XDG_CONFIG_HOME:path.join(root,'config'),XDG_CURRENT_DESKTOP:'Hyprland',DO_NOT_TRACK:'1'} as Record<string,string>;delete env.ELECTRON_DISABLE_SANDBOX;delete env.TV_TEST_MODE;
  const executable=path.join(packageDir!,'television-launcher');
  primary=spawn(executable,['--inspect-brk=127.0.0.1:0','--remote-debugging-port=0'],{env,stdio:['ignore','ignore','pipe']});primary.stderr!.on('data',data=>{stderr+=String(data);});
  await expect.poll(()=>/Debugger listening on (ws:\/\/[^\s]+)/.test(stderr),{timeout:10000}).toBe(true);
  debug=await inspector(stderr.match(/Debugger listening on (ws:\/\/[^\s]+)/)![1]!);
  await debug.send('Debugger.enable');await debug.send('Runtime.runIfWaitingForDebugger');const first=await debug.event('Debugger.paused');paused=true;
  expect(first.callFrames!.length).toBeGreaterThan(0);
  const archive=path.join(packageDir!,'resources/app.asar');
  const manifest=JSON.parse(extractFile(archive,'package.json').toString('utf8')) as {main:string};
  expect(manifest.main).toMatch(/electron\.cjs$/);
  const source=extractFile(archive,manifest.main).toString('utf8');
  const firstSource=(await debug.send('Debugger.getScriptSource',{scriptId:first.callFrames![0]!.location.scriptId})).scriptSource!;
  writeFileSync(path.join(dest,'inspector-preparation.json'),JSON.stringify({firstSourceMatchesPackage:firstSource===source,firstPausedLine:first.callFrames![0]!.location.lineNumber+1,main:manifest.main},null,2)+'\n');
  const lines=source.split('\n');const lockLine=lines.findIndex(s=>s.includes('.app.requestSingleInstanceLock()'));expect(lockLine).toBeGreaterThan(0);
  const readyLine=lines.findIndex((s,i)=>i>lockLine&&s.includes('await ')&&s.includes('.app.whenReady()'));expect(readyLine).toBeGreaterThan(lockLine);
  alias=lines[readyLine]!.match(/(\w+)\.app\.whenReady\(\)/)![1]!;
  expect(source).toContain('.app.requestSingleInstanceLock()');
  await debug.send('Debugger.setBreakpoint',{location:{scriptId:first.callFrames![0]!.location.scriptId,lineNumber:readyLine,columnNumber:0}});
  await debug.send('Debugger.resume');paused=false;const beforeReady=await debug.event('Debugger.paused');paused=true;
  expect(beforeReady.callFrames![0]!.location.lineNumber).toBe(readyLine);
  const actualSource=(await debug.send('Debugger.getScriptSource',{scriptId:beforeReady.callFrames![0]!.location.scriptId})).scriptSource;expect(actualSource).toBe(source);
  const evaluated=await debug.send('Debugger.evaluateOnCallFrame',{callFrameId:beforeReady.callFrames![0]!.callFrameId,expression:`JSON.stringify({pid:process.pid,windowless:this.window===null,windows:${alias}.BrowserWindow.getAllWindows().length,lock:${alias}.app.hasSingleInstanceLock(),noSandbox:${alias}.app.commandLine.hasSwitch('no-sandbox')})`,returnByValue:true});
  const state=JSON.parse(evaluated.result!.value!) as {pid:number;windowless:boolean;windows:number;lock:boolean;noSandbox:boolean};expect(state).toEqual({pid:primary.pid,windowless:true,windows:0,lock:true,noSandbox:false});
  const clients=()=>JSON.parse(execFileSync('/usr/bin/hyprctl',['-i',env.HYPRLAND_INSTANCE_SIGNATURE!,'-j','clients'],{encoding:'utf8',timeout:2000})) as Array<{pid:number;address:string;class:string;workspace:{id:number}}>;
  expect(clients().filter(w=>w.pid===state.pid)).toEqual([]);execFileSync('grim',[path.join(dest,'before-windowless-compositor.png')],{timeout:5000});
  secondary=spawn(executable,[],{env,stdio:'ignore'});
  expect(secondary.pid).toBeTruthy();expect(alive(primary)).toBe(true);expect(clients().filter(w=>w.pid===state.pid)).toEqual([]);
  writeFileSync(path.join(dest,'windowless-native.json'),JSON.stringify({state,secondaryPID:secondary.pid,clients:clients(),pauseLine:readyLine+1,sourceSHA256:createHash('sha256').update(source).digest('hex')},null,2)+'\n');
  await debug.send('Debugger.resume');paused=false;
  await expect.poll(()=>secondary!.exitCode,{timeout:15000}).toBe(0);expect(secondary.signalCode).toBe(null);
  await expect.poll(()=>/DevTools listening on (ws:\/\/[^\s]+)/.test(stderr),{timeout:15000}).toBe(true);
  browser=await chromium.connectOverCDP(stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)![1]!);
  await expect.poll(()=>browser!.contexts()[0]?.pages().length,{timeout:10000}).toBe(1);const page=browser.contexts()[0]!.pages()[0]!;
  await page.getByRole('textbox',{name:'Link from your agent'}).fill(`${server.serverURL}/?token=${server.token}`);await page.getByRole('textbox',{name:'Link from your agent'}).press('Enter');
  await expect(page.locator('#app[data-app-state="connected"]')).toBeVisible();
  const evalMain=async(expression:string)=>JSON.parse((await debug!.send('Runtime.evaluate',{expression:`JSON.stringify(${expression})`,returnByValue:true,includeCommandLineAPI:true})).result!.value!);
  const guestText=async()=>{const r=await debug!.send('Runtime.evaluate',{expression:`Promise.all(require('electron').webContents.getAllWebContents().filter(c=>c.getType()==='webview').map(c=>c.executeJavaScript('document.body.innerText').catch(()=>''))).then(JSON.stringify)`,awaitPromise:true,returnByValue:true,includeCommandLineAPI:true});return JSON.parse(r.result!.value!);};
  await expect.poll(guestText).toEqual(expect.arrayContaining([expect.stringContaining('Authenticated content after a windowless launcher request.')]));
  const after=await evalMain(`({pid:process.pid,windows:require('electron').BrowserWindow.getAllWindows().length,renderer:require('electron').BrowserWindow.getAllWindows()[0].webContents.getOSProcessId(),noSandbox:require('electron').app.commandLine.hasSwitch('no-sandbox')})`);
  expect(after.pid).toBe(state.pid);expect(after.windows).toBe(1);expect(after.noSandbox).toBe(false);
  const target=clients().filter(w=>w.pid===state.pid&&w.class==='computer.telepath.television');expect(target.length).toBe(1);
  const monitors=JSON.parse(execFileSync('/usr/bin/hyprctl',['-i',env.HYPRLAND_INSTANCE_SIGNATURE!,'-j','monitors'],{encoding:'utf8',timeout:2000})) as Array<{activeWorkspace:{id:number};specialWorkspace:{id:number}}>;
  expect(monitors.some(m=>m.activeWorkspace.id===target[0]!.workspace.id||m.specialWorkspace.id===target[0]!.workspace.id)).toBe(true);
  const status=readFileSync(`/proc/${after.renderer}/status`,'utf8');expect(status).toMatch(/^Seccomp:\s+2$/m);expect(status).toMatch(/^NoNewPrivs:\s+1$/m);
  execFileSync('grim',[path.join(dest,'after-connected-original-compositor.png')],{timeout:5000});
  writeFileSync(path.join(dest,'startup-acceptance.json'),JSON.stringify({status:'PASS',before:state,after,target,monitors,secondaryExit:secondary.exitCode,inspectorSchedulingSubstitute:true,callbackBeforeWindowProven:false,physicalAccepted:false},null,2)+'\n');
 }finally{
  if(paused)await debug?.send('Debugger.resume').catch(()=>{});
  if(alias)await debug?.send('Runtime.evaluate',{expression:`require('electron').app.quit()`,includeCommandLineAPI:true}).catch(()=>{});
  debug?.close();await browser?.close().catch(()=>{});await stop(secondary);await stop(primary);await server?.dispose();rmSync(root,{recursive:true,force:true});
 }
});
