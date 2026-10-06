// Contracts/seam: proofs/arch/desktop/linux-distribution.md#^linux-hyprland-api-gate and #^linux-hyprland-control-seam
// hyprctl replies are protocol boundary doubles. The installed Lua/window crossing is in e2e/hyprland-control.test.ts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHyprlandControl, encodeLuaString } from "../src/hyprland-control.ts";
import type { HyprlandTransport, WindowOwner } from "../src/hyprland-visibility.ts";
const owner: WindowOwner = {pid:410,applicationID:"computer.telepath.television",session:"fixture_123_456",marker:"owned-marker"};
let root: string;
let control: HyprlandTransport;
function reply(value: object) {writeFileSync(path.join(root,"reply.json"),JSON.stringify(value));}
function commands(): string[][] {return readFileSync(path.join(root,"calls.jsonl"),"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s));}
beforeEach(() => {
 root=mkdtempSync(path.join(tmpdir(),"tv-control-test-"));
 writeFileSync(path.join(root,"calls.jsonl"),"");
 writeFileSync(path.join(root,"hyprctl"),`#!${process.execPath}\nconst fs=require("node:fs"); const p=${JSON.stringify(root)};
 const args=process.argv.slice(2); fs.appendFileSync(p+"/calls.jsonl",JSON.stringify(args)+"\\n");
 const f=JSON.parse(fs.readFileSync(p+"/reply.json","utf8"));
 if(f.exit) process.exit(f.exit);
 if(f.hang) setInterval(()=>{},1000);
 else if(f.oversize) process.stdout.write("x".repeat(1100000));
 else if(args.includes("version")) process.stdout.write(f.versionRaw ?? JSON.stringify({version:f.version??"0.56.2"}));
 else process.stdout.write(f.luaRaw ?? JSON.stringify({capable:f.capable??true,status:"missing"}));
 `,{mode:0o700});
 reply({}); vi.stubEnv("PATH",root+path.delimiter+process.env.PATH);
 control=createHyprlandControl({session:owner.session});
});
afterEach(()=>{control.dispose();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
describe("verified Hyprland control boundary",()=>{
 it("selects captured session with shell-free argv",async()=>{
  expect((await control.inspect(owner)).status).toBe("missing");
  expect(commands().length).toBeGreaterThan(1);
  for(const args of commands()) expect(args.slice(0,2)).toEqual(["-i","fixture_123_456"]);
 });
 it.each(["0.55.0","0.56.3","0.57.0"])("refuses unsupported %s without Lua mutation",async version=>{
  reply({version}); expect((await control.inspect(owner)).status).toBe("unavailable");
  expect(await control.apply({...owner,owner,revision:1,expectedExternalRevision:0,visible:false,holdingWorkspace:"special:test"})).toEqual({acknowledged:false});
  expect(commands().length).toBeGreaterThan(0);
  expect(commands().every(args=>args.includes("version"))).toBe(true);
 });
 it.each([{versionRaw:"{"},{capable:false},{luaRaw:"not json"},{exit:3}])("refuses malformed or absent capability %#",async fixture=>{
  reply(fixture); expect((await control.inspect(owner)).status).toBe("unavailable"); expect(commands().length).toBeGreaterThan(0);
 });
 it("refuses wrong session before starting any process",async()=>{
  expect((await control.inspect({...owner,session:"unrelated-session"})).status).toBe("unavailable");
  expect(commands()).toEqual([]);
 });
 it("bounds combined output and reports unavailable",async()=>{
  reply({oversize:true});expect((await control.inspect(owner)).status).toBe("unavailable");expect(commands()).toHaveLength(1);
 });
 it("kills timed out owned control child",async()=>{
  reply({hang:true});const start=Date.now();expect((await control.inspect(owner)).status).toBe("unavailable");
  expect(Date.now()-start).toBeGreaterThanOrEqual(1900);expect(Date.now()-start).toBeLessThan(4000);
 });
 it("disposed transport issues no new command",async()=>{
  control.dispose();expect((await control.inspect(owner)).status).toBe("unavailable");expect(commands()).toEqual([]);
 });
 it("hostile strings round-trip through real Lua as data",()=>{
  const input='special:quote"\\\n; error("injected"); -- ☃';
  const out=execFileSync("/usr/bin/luajit",["-e",`io.write(${encodeLuaString(input)})`],{encoding:"utf8"});
  expect(out).toBe(input);
 });
});
