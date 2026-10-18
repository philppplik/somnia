import test from 'node:test';import assert from 'node:assert/strict';
import {runSignedUpdate,type UpdaterBackend,type UpdateProgress} from './selfUpdate';
function fake(offered:string|null,installOk=true){const log:string[]=[];
 const be:UpdaterBackend={async check(c){log.push(`check:${c}`);return offered;},
  async install(c,v,onBytes,onInst){log.push(`install:${c}:${v}`);onBytes(50,100);onBytes(100,100);onInst();return installOk;},
  async relaunch(){log.push('relaunch');}};return {be,log};}
test('beta build installs a newer beta and restarts',async()=>{
 const {be,log}=fake('12.2.0-beta.3');const seen:UpdateProgress[]=[];
 assert.equal(await runSignedUpdate(be,'beta','12.2.0-beta.2',p=>seen.push(p)),true);
 assert.deepEqual(log,['check:beta','install:beta:12.2.0-beta.3','relaunch']);
 assert.deepEqual(seen.map(p=>p.phase),['checking','downloading','downloading','installing','restarting']);
 assert.equal((seen[1] as {percent:number}).percent,50);
});
test('same or older manifest version is not installed',async()=>{
 for(const offered of ['12.2.0-beta.2','12.2.0-beta.1','12.1.0']){const {be,log}=fake(offered);
  assert.equal(await runSignedUpdate(be,'beta','12.2.0-beta.2',()=>{}),false);assert.deepEqual(log,['check:beta']);}
});
test('stable channel never installs a prerelease even if the manifest says so',async()=>{
 const {be,log}=fake('13.0.0-beta.1');assert.equal(await runSignedUpdate(be,'stable','12.0.1',()=>{}),false);assert.deepEqual(log,['check:stable']);
});
test('no signed build for this platform means false, not an error',async()=>{
 const {be}=fake(null);assert.equal(await runSignedUpdate(be,'alpha','12.0.1',()=>{}),false);
});
test('install refusing (manifest moved) does not relaunch',async()=>{
 const {be,log}=fake('12.2.0',false);assert.equal(await runSignedUpdate(be,'stable','12.0.1',()=>{}),false);assert.ok(!log.includes('relaunch'));
});
