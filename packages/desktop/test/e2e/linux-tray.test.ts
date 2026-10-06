// Acceptance: proofs/product/linux-desktop.md#^linux-tray-acceptance.
// Real package, server, Quickshell host, DBusMenu and compositor; no injected native callbacks.
import { _electron as electron, expect, test } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TelevisionClient } from '@telepath-computer/television-shared';
import { startConnectTestServer } from './connect-server.ts';
import { observeHyprlandWindow } from './linux-hyprland-observer.ts';

const packageDir = process.env.TV_LINUX_PACKAGE_DIR;
const evidence = process.env.TV_LINUX_EVIDENCE_DIR;
const session = process.env.HYPRLAND_INSTANCE_SIGNATURE;
test.skip(!packageDir || !evidence || !session || process.env.TV_LINUX_TRAY_FIXTURE !== '1',
  'Requires packaged client, private Hyprland/session bus and original evidence directory');

const busPython = `import json,sys\nfrom gi.repository import Gio,GLib\nc=Gio.bus_get_sync(Gio.BusType.SESSION,None)\nd,p,i,m,s,a=sys.argv[1:]\na=json.loads(a)\nif m=='Event': a=[a[0],a[1],GLib.Variant('s',''),a[3]]\nr=c.call_sync(d,p,i,m,GLib.Variant(s,tuple(a)),None,Gio.DBusCallFlags.NONE,3000,None)\nprint(json.dumps(r.unpack()))`;
function bus(dest: string, object: string, iface: string, method: string, signature: string, args: unknown[]): unknown[] {
  return JSON.parse(execFileSync('/usr/bin/python3', ['-c', busPython, dest, object, iface, method, signature, JSON.stringify(args)],
    {encoding:'utf8',timeout:5000,maxBuffer:1024*1024}));
}
type Entry = [number, {label?:string; enabled?:boolean}, Entry[]];
function entries(root: Entry): Entry[] { return [root,...root[2].flatMap(entries)]; }

// Declarative native host: same Quickshell SystemTray/QsMenuOpener mechanism used by Omarchy.
// QML only renders the actual exported menu; it does not invent labels or substitute menu actions.
const hostQML = `import Quickshell\nimport QtQuick\nimport Quickshell.Services.SystemTray\nShellRoot {\n  readonly property var television: SystemTray.items.values.length === 1 ? SystemTray.items.values[0] : null\n  QsMenuOpener { id: opener; menu: television ? television.menu : null }\n  Timer { interval: 250; running: true; repeat: true; onTriggered: console.log('TRAY_MENU ' + JSON.stringify(opener.children.values.map(x => ({text:x.text,enabled:x.enabled})))) }\n  PanelWindow {\n    anchors { top: true; right: true }\n    implicitWidth: 330; implicitHeight: 340; color: '#182030'\n    Column { anchors.fill: parent; anchors.margins: 14; spacing: 9\n      Row { spacing: 10\n        Image { width: 24; height: 24; source: television ? television.icon : '' }\n        Text { text: television ? (television.tooltipTitle || television.title) : 'Waiting for Television tray'; color: '#f1f5fa'; font.pixelSize: 18 }\n      }\n      Repeater { model: opener.children\n        Text { required property var modelData; text: modelData.isSeparator ? '────────' : modelData.text;\n          color: modelData.enabled ? '#f1f5fa' : '#a7b6cb'; font.pixelSize: 15 }\n      }\n    }\n  }\n}`;

test('packaged tray exports real native actions and preserves the owned Hyprland document and live session', async () => {
  test.setTimeout(120_000);
  const root = mkdtempSync(path.join(tmpdir(),'tv-tray-'));
  const backend = process.env.TV_OZONE_PLATFORM === 'x11' ? 'x11' : 'wayland';
  const dest = path.join(evidence!,backend); mkdirSync(dest,{recursive:true});
  const qml = path.join(root,'shell.qml'); writeFileSync(qml,hostQML);
  let host: ReturnType<typeof spawn> | undefined;
  let ownedServer: Awaited<ReturnType<typeof startConnectTestServer>> | undefined;
  let hostLog='';
  const env = {...process.env,XDG_CONFIG_HOME:path.join(root,'config'),DO_NOT_TRACK:'1'} as Record<string,string>;
  delete env.TV_TEST_MODE; delete env.ELECTRON_DISABLE_SANDBOX;
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const registered = () => bus('org.kde.StatusNotifierWatcher','/StatusNotifierWatcher','org.freedesktop.DBus.Properties','Get','(ss)',
    ['org.kde.StatusNotifierWatcher','RegisteredStatusNotifierItems'])[0] as string[];
  const screenshot = (name:string) => execFileSync('grim',[path.join(dest,name+'.png')],{timeout:5000});
  try {
    host = spawn('/usr/bin/qs',['-p',qml],{stdio:['ignore','pipe','pipe']});
    host.stdout!.on('data',d=>hostLog+=String(d)); host.stderr!.on('data',d=>hostLog+=String(d));
    const server = ownedServer = await startConnectTestServer({bundledViews:true});
    const client = new TelevisionClient(server.serverURL,{token:server.token});
    const {channel} = await client.channels.create({name:'Declared tray fixture'});
    const html = path.join(root,'input.html');
    writeFileSync(html,'<!doctype html><html><body style="background:#eef3f8;color:#162030;font:18px system-ui;padding:28px"><h1>Declared tray fixture</h1><p>This unsaved input must survive Hide and Show.</p><input id="draft" aria-label="Unsaved draft" style="font:18px system-ui;width:90%"></body></html>');
    const {artifact} = await client.artifacts.create({channelID:channel.id,kind:'path',title:'Unsaved draft',path:html});
    await client.display.patch({focusedChannelId:channel.id}); await client.display.focus({artifactID:artifact.id});
    await expect.poll(()=>{try{return registered().length;}catch{return -1;}},{timeout:10000}).toBe(0);
    app = await electron.launch({executablePath:path.join(packageDir!,'television-launcher'),env,timeout:20000});
    let page = await app.firstWindow();
    let opened=0,closed=0;
    page.on('websocket',socket=>{opened++;socket.on('close',()=>closed++);});
    await expect.poll(registered,{timeout:10000}).toHaveLength(1);
    const registration = registered()[0]!;
    const slash = registration.indexOf('/');
    const service = registration.slice(0,slash), sni = registration.slice(slash);
    const menu = bus(service,sni,'org.freedesktop.DBus.Properties','Get','(ss)',['org.kde.StatusNotifierItem','Menu'])[0] as string;
    const trayID = bus(service,sni,'org.freedesktop.DBus.Properties','Get','(ss)',['org.kde.StatusNotifierItem','Id'])[0] as string;
    const layout = () => entries(bus(service,menu,'com.canonical.dbusmenu','GetLayout','(iias)',[0,-1,[]])[1] as Entry);
    const select = (label:string) => {
      const entry=layout().find(e=>e[1].label?.replaceAll('_','')===label);
      expect(entry,`real exported menu: ${label}`).toBeDefined(); expect(entry![1].enabled??true).toBe(true);
      bus(service,menu,'com.canonical.dbusmenu','Event','(isvu)',[entry![0],'clicked','',0]);
    };
    expect(layout().find(e=>e[1].label==='Disconnect from Server')?.[1].enabled).toBe(false);
    await page.getByRole('textbox',{name:'Link from your agent'}).fill(`${server.serverURL}/?token=${server.token}`);
    await page.getByRole('textbox',{name:'Link from your agent'}).press('Enter');
    await expect(page.locator('#app[data-app-state="connected"]')).toBeVisible();
    await expect.poll(()=>layout().some(e=>e[1].label===`Server: ${server.serverURL}` && e[1].enabled===false)).toBe(true);
    expect(JSON.stringify(layout()).includes(server.token)).toBe(false);
    await expect.poll(()=>hostLog.includes('Show Television') && hostLog.includes('Hide Television')).toBe(true);
    const identity = await app.evaluate(({app,BrowserWindow})=>({pid:process.pid,profile:app.getPath('userData'),window:BrowserWindow.getAllWindows()[0].id,
      renderer:BrowserWindow.getAllWindows()[0].webContents.getOSProcessId(),noSandbox:app.commandLine.hasSwitch('no-sandbox')}));
    const owner={pid:identity.pid,applicationID:'computer.telepath.television',session:session!,marker:'tray-independent-observer'};
    const observe=()=>observeHyprlandWindow(owner);
    await expect.poll(observe).toMatchObject({status:'owned',visibleOnMonitors:expect.arrayContaining([expect.any(Number)])});
    const original = await observe();
    const connectionFile = path.join(identity.profile,'connection.json'), saved = readFileSync(connectionFile);
    const guestDraft = (write=false) => app!.evaluate(async ({webContents},write)=>{
      for(const c of webContents.getAllWebContents().filter(c=>c.getType()==='webview')) {
        const value=await c.executeJavaScript(`(()=>{const input=document.querySelector('#draft');if(!input)return null;${write?"input.value='Unsaved tray acceptance edit';":""}return {id:document.title,value:input.value,href:location.href};})()`).catch(()=>null);
        if(value)return {guest:c.id,...value};
      }
      return null;
    },write);
    await expect.poll(guestDraft).not.toBeNull();
    const draft = await guestDraft(true); expect(draft.value).toBe('Unsaved tray acceptance edit');
    await expect.poll(()=>opened).toBeGreaterThan(0); const socketBaseline={opened,closed};
    screenshot('before-tray-hide');
    const cycles=[];
    for(let cycle=1;cycle<=3;cycle++) {
      select('Hide Television');
      await expect.poll(observe,{timeout:15000}).toMatchObject({status:'owned',visibleOnMonitors:[]});
      const hidden=await observe(); screenshot(`cycle-${cycle}-hidden`);
      await client.channels.update({channelID:channel.id,name:`Tray hidden update ${cycle}`});
      await expect(page.getByText(`Tray hidden update ${cycle}`,{exact:true}).first()).toBeAttached();
      expect({opened,closed}).toEqual(socketBaseline);
      expect(await guestDraft()).toEqual(draft); expect(readFileSync(connectionFile)).toEqual(saved);
      select('Show Television');
      await expect.poll(observe,{timeout:15000}).toMatchObject({status:'owned',workspace:original.status==='owned'?original.workspace:0,
        visibleOnMonitors:expect.arrayContaining([expect.any(Number)])});
      expect(await guestDraft()).toEqual(draft); expect({opened,closed}).toEqual(socketBaseline);
      screenshot(`cycle-${cycle}-restored`); cycles.push({cycle,hidden,restored:await observe()});
    }
    const current=await app.evaluate(({BrowserWindow})=>({window:BrowserWindow.getAllWindows()[0].id,renderer:BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()}));
    expect(current).toEqual({window:identity.window,renderer:identity.renderer}); expect(identity.noSandbox).toBe(false);
    const processStatus=readFileSync(`/proc/${identity.renderer}/status`,'utf8');
    expect(processStatus).toMatch(/^Seccomp:\s+2$/m); expect(processStatus).toMatch(/^NoNewPrivs:\s+1$/m);
    select('Hide Television'); await expect.poll(observe).toMatchObject({status:'owned',visibleOnMonitors:[]});
    select('Disconnect from Server'); await expect(page.locator('.setup-screen')).toBeVisible();
    await expect.poll(observe).toMatchObject({status:'owned',visibleOnMonitors:expect.arrayContaining([expect.any(Number)])});
    expect(existsSync(connectionFile)).toBe(false);
    await expect.poll(()=>layout().find(e=>e[1].label==='Disconnect from Server')?.[1].enabled).toBe(false);
    expect(await fetch(server.serverURL+'/health').then(r=>r.ok)).toBe(true); screenshot('after-disconnect');
    await page.getByRole('textbox',{name:'Link from your agent'}).fill(`${server.serverURL}/?token=${server.token}`);
    await page.getByRole('textbox',{name:'Link from your agent'}).press('Enter');
    await expect(page.locator('#app[data-app-state="connected"]')).toBeVisible();
    await expect.poll(()=>layout().some(e=>e[1].label===`Server: ${server.serverURL}` && e[1].enabled===false)).toBe(true);
    await expect.poll(()=>layout().find(e=>e[1].label==='Disconnect from Server')?.[1].enabled).not.toBe(false);
    expect(JSON.stringify(layout()).includes(server.token)).toBe(false);
    screenshot('after-reconnect');
    select('About Television');
    const nativeDialogs = () => (JSON.parse(execFileSync('hyprctl',['-i',session!,'-j','clients'],{encoding:'utf8',timeout:2000})) as
      Array<{pid:number;title:string;address:string}>).filter(w=>w.pid===identity.pid && w.title==='About Television');
    await expect.poll(nativeDialogs).toHaveLength(1);
    screenshot('about-version');
    // About is a real GTK native dialog. Quit should exit with this dialog open too.
    const primaryProcess=app.process();
    select('Quit'); await expect.poll(registered,{timeout:10000}).toHaveLength(0);
    await expect.poll(()=>primaryProcess.exitCode,{timeout:10000}).toBe(0);
    expect(await fetch(server.serverURL+'/health').then(r=>r.ok)).toBe(true); screenshot('after-quit');
    app=undefined;
    // Native Close retains quit behavior, separate from tray Hide.
    app=await electron.launch({executablePath:path.join(packageDir!,'television-launcher'),env,timeout:20000});
    page=await app.firstWindow(); await expect(page.locator('#app[data-app-state="connected"]')).toBeVisible();
    const closingProcess=app.process();
    await expect.poll(registered).toHaveLength(1);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await expect.poll(registered,{timeout:10000}).toHaveLength(0);
    await expect.poll(()=>closingProcess.exitCode,{timeout:10000}).toBe(0); app=undefined;
    writeFileSync(path.join(dest,'acceptance.json'),JSON.stringify({status:'PASS',backend,trayID,identity:{...identity,profile:'private fixture'},
      socketBaseline,cycles,unsavedEditRetained:true,connectionBytesRetained:true,sandbox:{seccomp:2,noNewPrivileges:1},
      disconnectClearsProfile:true,reconnectRefreshesMenu:true,relaunchUsesSavedConnection:true,quitRemovesTray:true,nativeCloseQuits:true,agentServerSurvives:true,
      realQuickshellHost:true,realDBusMenuActions:true,physicalPointerAccepted:false},null,2)+'\n');
  } finally {
    await app?.close().catch(()=>{});
    if(host && host.exitCode===null && host.signalCode===null) {
      host.kill('SIGTERM');
      await expect.poll(()=>host!.exitCode!==null || host!.signalCode!==null,{timeout:3000}).toBe(true).catch(async()=>{
        host!.kill('SIGKILL');
        await expect.poll(()=>host!.exitCode!==null || host!.signalCode!==null,{timeout:2000}).toBe(true);
      });
    }
    writeFileSync(path.join(dest,'quickshell.log'),hostLog);
    await ownedServer?.dispose(); rmSync(root,{recursive:true,force:true});
  }
});
