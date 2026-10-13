import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dnsRows,mayCancel} from './deploy/setup';
import {createPublishStore} from './deploy/publishStore';
import type {DeployTarget} from './deploy/contract';
const target:DeployTarget={id:'site',name:'Site',host:'203.0.113.1',user:'somnia',port:22,keySlot:'deploy-key:site',kind:'static'};
test('DNS guidance shows A and AAAA records without inventing addresses',()=>{
 assert.deepEqual(dnsRows(['203.0.113.1','2001:db8::1']),[{type:'A',name:'@',value:'203.0.113.1'},{type:'A',name:'www',value:'203.0.113.1'},{type:'AAAA',name:'@',value:'2001:db8::1'},{type:'AAAA',name:'www',value:'2001:db8::1'}]);
 assert.deepEqual(dnsRows([]),[]);
});
test('cancel cannot be re-enabled by out-of-order upload after switch',()=>{
 assert.equal(mayCancel([{step:'upload'}]),true);
 assert.equal(mayCancel([{step:'switch'},{step:'upload'}]),false);
 assert.equal(mayCancel([{step:'health'}]),false);
});
test('rollback live marker comes only from the remote symlink, never release order',async()=>{
 const store=createPublishStore({run:async()=>null,onProgress:()=>()=>{},backend:{targetsList:async()=>[{target,state:'ready'}],releasesList:async()=>['new','old'],liveRelease:async()=> 'old',openSite:async()=>{}}});
 await store.open();await store.showRollback('site');assert.equal(store.getState().liveByTarget.site,'old');
});
test('unknown remote live marker clears a stale session marker',async()=>{
 const store=createPublishStore({run:async()=>null,onProgress:()=>()=>{},backend:{targetsList:async()=>[{target,state:'ready'}],releasesList:async()=>['new','old'],liveRelease:async()=>null,openSite:async()=>{}}});
 await store.open();await store.showRollback('site');assert.equal(store.getState().liveByTarget.site,undefined);
});
test('sudo passwords never enter CommandSpecs, targets or React state',()=>{
 const ui=readFileSync('src/components/DeploySetupWizard.tsx','utf8');const specs=readFileSync('src/lib/deploy/commandSpecs.ts','utf8');
 assert.ok(ui.includes('clearPasswords();setConfirmRun(false)'));
 assert.ok(ui.includes("input.loginPassword='';input.sudoPassword='';"));
 assert.ok(!/useState[^\n]*(?:loginPassword|sudoPassword)/.test(ui));
 assert.ok(!specs.includes('sudoPassword'));
});
test('setup locale keys and dynamic outcome keys exist in all five catalogues',()=>{
 const ui=readFileSync('src/components/DeploySetupWizard.tsx','utf8');
 const keys=new Set([...ui.matchAll(/'(deploy\.[a-zA-Z.-]+)'/g)].map(m=>m[1]!).filter(k=>!k.endsWith('.')));
 for(const step of ['key','trust','prepare','domain']){keys.add(`deploy.setup.step.${step}`);keys.add(`deploy.setup.${step}.title`);keys.add(`deploy.setup.${step}.text`);}
 for(const outcome of ['done','sudo-denied','unsupported-server','port-in-use','failed'])keys.add(`deploy.setup.outcome.${outcome}`);
 for(const change of ['ports','caddy','user','key','dirs','config','start','linger'])keys.add(`deploy.setup.change.${change}`);
 const catalogues=['en','de','es','fr','pt-BR'].map(l=>JSON.parse(readFileSync(`src/locales/${l}.json`,'utf8')));
 const ph=(v:string)=>[...v.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
 for(const k of keys)for(const c of catalogues){assert.ok(c[k],k);assert.deepEqual(ph(c[k]),ph(catalogues[0][k]));}
});
