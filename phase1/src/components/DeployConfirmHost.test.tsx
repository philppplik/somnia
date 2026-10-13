import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizePlan,answerDeployDialog,dialogPresenter,getDeployDialogSnapshot} from '../lib/deploy/confirmStore';
import {captureGesture} from '../lib/deploy/confirmation';
import type {DeployPlan,DeployTarget} from '../lib/deploy/contract';

const target:DeployTarget={id:'s1',name:'Site',host:'203.0.113.10',port:22,user:'somnia',kind:'static',keySlot:'deploy-key:s1'};
const plan:DeployPlan={planHash:'h',action:'publish',targetId:'s1',fingerprint:'SHA256:abc',buildId:'b',files:[
 {path:'a.html',size:1,sha256:'x',change:'added'},{path:'b.css',size:2,sha256:'y',change:'changed'},{path:'old.js',size:3,sha256:'z',change:'removed'},{path:'c.png',size:4,sha256:'w',change:'unchanged'}]};

test('summarizePlan counts every change kind',()=>{assert.deepEqual(summarizePlan(plan),{added:1,changed:1,removed:1,unchanged:1});});

test('presenter: cancel resolves null, a newer request cancels the pending one',async()=>{
 const first=dialogPresenter.confirmPlan(plan,target);
 assert.equal(getDeployDialogSnapshot()?.kind,'plan');
 const second=dialogPresenter.confirmHostKey(target,{algorithm:'ssh-ed25519',fingerprint:'SHA256:abc'});
 assert.equal(await first,null);
 answerDeployDialog(null);
 assert.equal(await second,null);
 assert.equal(getDeployDialogSnapshot(),null);
});

test('presenter: approval carries the gesture, replace carries the acknowledgement',async()=>{
 const p=dialogPresenter.confirmHostKeyReplace(target,'SHA256:old',{algorithm:'ssh-ed25519',fingerprint:'SHA256:new'});
 const gesture=captureGesture({isTrusted:true});
 answerDeployDialog({gesture,acknowledged:true});
 const r=await p;assert.equal(r?.gesture,gesture);assert.equal(r?.acknowledged,true);
});

test('dialog source: cancel is the default focus, approval goes through a trusted click, the fingerprint is shown, no remember option',()=>{
 const src=readFileSync(new URL('./DeployConfirmHost.tsx',import.meta.url),'utf8');
 assert.ok(src.includes('autoFocus'));
 assert.equal((src.match(/captureGesture\(e\.nativeEvent\)/g)??[]).length,3);
 assert.ok(src.includes('deploy-fingerprint'));
 assert.ok(!/remember|dontAsk|don't ask/i.test(src));
});

test('i18n: every deploy.* and cmd.deploy.* key exists in all five locales with matching placeholders',()=>{
 const load=(l:string)=>JSON.parse(readFileSync(new URL(`../locales/${l}.json`,import.meta.url),'utf8')) as Record<string,string>;
 const en=load('en');const keys=Object.keys(en).filter(k=>k.startsWith('deploy.')||k.startsWith('cmd.deploy.'));
 assert.ok(keys.length>=40);
 const ph=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
 for(const l of ['de','es','fr','pt-BR']){const t=load(l);for(const k of keys){assert.ok(t[k],`${l} missing ${k}`);assert.equal(ph(t[k]!),ph(en[k]!),`${l} ${k} placeholders`);}}
 const src=readFileSync(new URL('./DeployConfirmHost.tsx',import.meta.url),'utf8');
 for(const m of src.matchAll(/t\('(deploy\.[a-zA-Z.]+)'/g))if(!m[1]!.endsWith('.'))assert.ok(en[m[1]!],`unknown key ${m[1]}`);
});
