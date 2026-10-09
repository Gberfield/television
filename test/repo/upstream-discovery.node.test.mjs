import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as tracker from '../../scripts/upstream-tracking.mjs';
const sha='a'.repeat(40), other='b'.repeat(40);
const manifest={television:{integrated_sha:other},omarchy:{baseline_sha:sha,stable_tag:'v4.0.4',stable_sha:sha,default_branch:'quattro'}};
test('read-only discovery accepts an injected GET source and retains pending/dedupe semantics',async()=>{
 const calls=[];
 const read=async(path)=>{
  calls.push(path);
  if(path.includes('telepath-computer/television/commits/'))return {sha};
  if(path==='repos/basecamp/omarchy')return {default_branch:'quattro'};
  if(path.endsWith('/releases/latest'))return {tag_name:'v4.0.4'};
  if(path.includes('/pulls?'))return [];
  if(path.includes('/commits/'))return {sha};
  throw Error('Unexpected GET path '+path);
 };
 assert.equal(typeof tracker.discovery,'function');
 const result=await tracker.discovery(manifest,read);
 assert.deepEqual(result.pending,['television']);
 assert.equal(result.observed.television,sha);
 assert.equal(manifest.television.integrated_sha,other);
 assert.ok(calls.every(path=>path.startsWith('repos/')));
 const adopted=await tracker.discovery(manifest,async(path)=>path.includes('/pulls?')?[{head:{ref:'sync/television-existing',repo:{full_name:'Gberfield/television'}}}]:read(path));
 assert.deepEqual(adopted.pending,[]);
});
test('read-only discovery refuses an unbounded PR inventory',async()=>{
 const read=async(path)=>{
  if(path.includes('telepath-computer/television/commits/'))return {sha};
  if(path==='repos/basecamp/omarchy')return {default_branch:'quattro'};
  if(path.endsWith('/releases/latest'))return {tag_name:'v4.0.4'};
  if(path.includes('/pulls?'))return Array.from({length:100},()=>({head:{ref:'unrelated',repo:{full_name:'Gberfield/television'}}}));
  return {sha};
 };
 await assert.rejects(tracker.discovery(manifest,read),/pagination.*limit/i);
});
