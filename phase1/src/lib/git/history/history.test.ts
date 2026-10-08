import test from 'node:test';
import assert from 'node:assert/strict';
import type {GitBackend, GitRepoInfo, GitVersion} from '../types';
import {HistoryController, mergeTimeline} from './history';
import {createRecoveryBackend, type RecoveryBackend, type RecoveryEntry} from './recovery';
const version: GitVersion = {sha:'abc', subject:'Old version', body:'', authorName:'Test', time:100, parents:[], changedFiles:1};
const repo: GitRepoInfo = {root:'/local', projectPrefix:'', branch:'main', detached:false, unborn:false, head:'abc', upstream:null, ahead:0, behind:0, hasLfs:false, hasSubmodules:false, gitVersion:'2'};
const snapshot: RecoveryEntry = {id:'safety-1', kind:'safety', record:{path:'Grüße with space.html', content:'\r\n', clientRevision:1, updatedAtMs:101000}};
function fixture() {
 const requests: unknown[] = [];
 const git: GitBackend = {
  detect:async()=>({kind:'ready', repo}), status:async()=>({repo, changes:[], stateToken:'reviewed-token', truncated:false}),
  log:async()=>[version], restoreAsNewVersion:async req => {requests.push(req); return {safetyCopy:version, newVersion:{...version, sha:'restored'}};},
  diff:async()=>{throw Error('Unexpected diff');}, init:async()=>{throw Error('Unexpected init');}, commit:async()=>{throw Error('Unexpected commit');},
 };
 const recovery: RecoveryBackend = {list:async()=>[snapshot], review:async()=>({exists:true,hash:'current'}), restore:async(e,rev)=>{requests.push({e,rev}); return {event:{projectId:'p',path:e.record.path,clientRevision:2,state:'dirty',diskRevision:rev,error:null,durability:null},content:e.record.content,safetyIds:['safety-new']};}};
 let dirty=false;
 return {git,recovery,requests, dirty:()=>{dirty=true;}, controller:new HistoryController(git,recovery,()=>dirty)};
}
test('merges Git seconds and recovery milliseconds, stable ordering, unknown time stays unknown',()=>{
 const list=mergeTimeline([version,version],[snapshot,{...snapshot,id:'undated',record:{...snapshot.record,updatedAtMs:undefined}}]);
 assert.deepEqual(list.map(x=>x.id),['local:safety-1','git:abc','local:undated']); assert.equal(list.at(-1)?.timeMs,null);
});
test('read and review do not commit or restore; confirmed restore uses exact token',async()=>{
 const f=fixture(); const page=await f.controller.load(); const entry=page.entries.find(e=>e.kind==='version')!;
 const review=await f.controller.review(entry); assert.deepEqual(f.requests,[]);
 const outcome=await f.controller.restore(review); assert.equal(outcome.kind,'version');
 assert.deepEqual(f.requests,[{sha:'abc',stateToken:'reviewed-token'}]);
});
test('buffer changes after review stop restore',async()=>{
 const f=fixture(); const review=await f.controller.review((await f.controller.load()).entries[1]); f.dirty();
 await assert.rejects(f.controller.restore(review),/Save and review/); assert.equal(f.requests.length,0);
});
test('blocked/no-Git still expose recovery, Git cannot restore',async()=>{
 const f=fixture(); f.git.detect=async()=>({kind:'blocked',reason:'index-lock'});
 const page=await f.controller.load(); assert.equal(page.entries.length,1);
 await assert.rejects(f.controller.review({id:'git:abc',kind:'version',timeMs:100000,version}),/blocked/);
 const outcome=await f.controller.restore(await f.controller.review(page.entries[0])); assert.equal(outcome.kind,'recovery');
});
test('state-changed must be surfaced with no retry',async()=>{
 const f=fixture(); let count=0; f.git.restoreAsNewVersion=async()=>{count++; throw Error('{"code":"state-changed","message":"Review again"}');};
 await assert.rejects(f.controller.restore(await f.controller.review((await f.controller.load()).entries[1])),/state-changed/); assert.equal(count,1);
});
test('truncated/conflicted status and unsupported project block review',async()=>{
 const f=fixture(); const entry=(await f.controller.load()).entries[1];
 f.git.status=async()=>({repo,changes:[],stateToken:'t',truncated:true}); await assert.rejects(f.controller.review(entry),/truncated/);
 f.git.detect=async()=>({kind:'ready',repo:{...repo,hasLfs:true}}); await assert.rejects(f.controller.review(entry),/LFS/);
});
test('parallel restores do not duplicate commands',async()=>{
 const f=fixture(); const review=await f.controller.review((await f.controller.load()).entries[1]);
 let release!:()=>void; f.git.restoreAsNewVersion=async()=>{await new Promise<void>(r=>{release=r;}); return {safetyCopy:null,newVersion:version};};
 const first=f.controller.restore(review); await assert.rejects(f.controller.restore(review),/already/);
 await new Promise(r=>setTimeout(r,0)); release(); await first;
});
test('backend read failures are visible and independent snapshots survive',async()=>{
 const f=fixture(); f.git.log=async()=>{throw Error('timeout');}; const page=await f.controller.load();
 assert.equal(page.entries.length,1); assert.deepEqual(page.warnings,['Error: timeout']);
});
test('50-item log uses SHA pagination',async()=>{
 const f=fixture(); f.git.log=async req=>{assert.equal(req.before,'older');return Array.from({length:50},(_,i)=>({...version,sha:String(i)}));};
 assert.equal((await f.controller.load('older')).moreBefore,'49');
});
test('recovery port uses project grant, current revision and safe command only',async()=>{
 const calls: {command:string;args:unknown}[]=[];
 const port={invoke:async<T>(command:string,args?:Record<string,unknown>):Promise<T>=>{calls.push({command,args});return (command==='read_file'?{revision:{exists:true,hash:'disk'}}:[]) as T;}};
 const backend=createRecoveryBackend(port,'granted-project',()=>9); await backend.list(); const disk=await backend.review(snapshot); await backend.restore(snapshot,disk);
 assert.equal(calls[0].command,'recovery_history_list'); assert.deepEqual(calls[2],{command:'recovery_restore_safe',args:{projectId:'granted-project',id:'safety-1',path:snapshot.record.path,expectedRevision:disk,clientRevision:9}});
});
test('returned Git safety copy remains visible for this controller session',async()=>{
 const f=fixture(); f.git.restoreAsNewVersion=async()=>({safetyCopy:{...version,sha:'hidden-safety',time:200},newVersion:version});
 await f.controller.restore(await f.controller.review((await f.controller.load()).entries[1]));
 const entry=(await f.controller.load()).entries.find(e=>e.id==='git:hidden-safety');
 assert.ok(entry && entry.kind==='version' && entry.safety);
});
