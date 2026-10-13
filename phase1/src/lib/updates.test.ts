import test from 'node:test';
import assert from 'node:assert/strict';
import {newerRelease,releaseNumber,checkForUpdate} from './updates';
const rel=(tag:string,extra:object={})=>({tag_name:tag,html_url:'https://github.com/philppplik/somnia/releases/tag/'+tag,...extra});
test('release tags parse to comparable numbers',()=>{assert.equal(releaseNumber('v8.5-alpha'),8.05);assert.equal(releaseNumber('v9'),9);assert.equal(releaseNumber('nightly'),null);});
test('newest higher release wins, drafts and older ones are ignored',()=>{
 const r=newerRelease('9.0',[rel('v8.5-alpha'),rel('v9.5',{prerelease:true,assets:[{name:'Somnia-x64-setup.exe',browser_download_url:'https://x/y.exe'}]}),rel('v10',{draft:true}),rel('v9.0')]);
 assert.equal(r?.tag,'v9.5');assert.equal(r?.asset?.name,'Somnia-x64-setup.exe');
 assert.equal(newerRelease('9.5',[rel('v9.5'),rel('v9')]),null);});
test('checkForUpdate reports errors and results',async()=>{
 const ok=await checkForUpdate('8',(async()=>({ok:true,json:async()=>[rel('v9')]})) as never);assert.equal(ok.status,'available');
 await assert.rejects(checkForUpdate('8',(async()=>({ok:false,status:403})) as never),/403/);});
test('patch releases are detected and equal or older are not',()=>{assert.equal(newerRelease('9.5.4',[rel('v9.5.5-alpha')])?.tag,'v9.5.5-alpha');assert.equal(newerRelease('9.5.4',[rel('v9.5.4-alpha'),rel('v9.5.3')]),null);assert.equal(newerRelease('9.5.4',[rel('v9.6.0')])?.tag,'v9.6.0');});
test('same-core prereleases use full SemVer ordering, not just the numeric tuple',()=>{
 for(const [current,next] of [['12.2.0-alpha.7','v12.2.0-beta.1'],['12.2.0-beta.2','v12.2.0-beta.3'],['12.2.0-beta.3','v12.2.0-beta.10'],['12.2.0-beta.3','v12.2.0']])assert.equal(newerRelease(current,[rel(next)])?.tag,next);
 for(const next of ['v12.2.0-beta.3','v12.2.0-beta.2','v12.2.0-alpha.9','v12.1.99'])assert.equal(newerRelease('12.2.0-beta.3',[rel(next)]),null);
 assert.equal(newerRelease('12.2.0',[rel('v12.2.0-beta.99')]),null);
 assert.equal(newerRelease('12.2.0-beta.3+build.1',[rel('v12.2.0-beta.3+build.2')]),null);
 assert.equal(newerRelease('12.2.0-alpha.7',[rel('v12.2.0-beta.10'),rel('v12.2.0-beta.3')])?.tag,'v12.2.0-beta.10');
 assert.equal(newerRelease('12.2.0-beta.3',[rel('v12.2.0-bogus!'),rel('v99trailing')]),null);
});
test('check respects stable, beta and alpha preferences on the same core version',async()=>{
 const data=[rel('v12.2.0-beta.3',{prerelease:true}),rel('v12.3.0-alpha.1',{prerelease:true}),rel('v12.0.1')];
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let channel='stable';
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({channel})}});
 try{
  const fetcher=(async()=>({ok:true,json:async()=>data})) as never;
  assert.equal((await checkForUpdate('12.2.0-beta.2',fetcher)).status,'up-to-date');
  channel='beta';const beta=await checkForUpdate('12.2.0-beta.2',fetcher);assert.equal(beta.status==='available'&&beta.release.tag,'v12.2.0-beta.3');
  channel='alpha';const alpha=await checkForUpdate('12.2.0-beta.2',fetcher);assert.equal(alpha.status==='available'&&alpha.release.tag,'v12.3.0-alpha.1');
 }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}
});
