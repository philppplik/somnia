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
