import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackgroundController} from './windowBackground';
import {sanitizeLook,DEFAULT_LOOK} from './look';
const root=()=>({dataset:{}} as unknown as HTMLElement);
test('solid default and migration for older saved look preferences',()=>{
 assert.equal(DEFAULT_LOOK.background,'solid');assert.equal(sanitizeLook({}).background,'solid');
 assert.equal(sanitizeLook({background:'glass'}).background,'glass');
 assert.equal(sanitizeLook({background:'unknown'}).background,'solid');
});
test('glass only after native success; failure and unsupported remain solid',async()=>{
 for(const port of [async()=>false,async()=>{throw Error('not supported');}]){
  const r=root();await createBackgroundController(port,r)({mode:'glass',dark:false,highContrast:false});assert.equal(r.dataset.background,'solid');
 }
 const r=root();const apply=createBackgroundController(async g=>g,r);
 await apply({mode:'glass',dark:true,highContrast:false});assert.equal(r.dataset.background,'glass');
 await apply({mode:'solid',dark:true,highContrast:false});assert.equal(r.dataset.background,'solid');
 await apply({mode:'glass',dark:false,highContrast:true});assert.equal(r.dataset.background,'solid');
});
test('serialize compositor updates and ignore stale glass completion',async()=>{
 const calls:boolean[]=[];let finish:()=>void=()=>{};const r=root();
 const apply=createBackgroundController(async glass=>{calls.push(glass);if(glass)await new Promise<void>(r=>{finish=r;});return glass;},r);
 const glass=apply({mode:'glass',dark:false,highContrast:false});await Promise.resolve();await Promise.resolve();
 const solid=apply({mode:'solid',dark:false,highContrast:false});finish();await glass;assert.equal(r.dataset.background,'solid');await solid;
 assert.deepEqual(calls,[true,false]);assert.equal(r.dataset.background,'solid');
});
