import test from 'node:test';
import assert from 'node:assert/strict';
import {editedName,nativeImageHost,type HostInvoke} from './imageEditorHost';
test('native host picks through a one-time token and reads raw bytes',async()=>{
 const calls:string[]=[];
 const invoke:HostInvoke=async<T,>(c:string,a?:unknown)=>{calls.push(c);
  if(c==='image_pick')return {token:'t1',name:'a.png',size:3} as T;
  if(c==='image_read'){assert.deepEqual(a,{token:'t1'});return new Uint8Array([1,2,3]).buffer as T;}
  throw Error(c);};
 const r=await nativeImageHost(invoke).pick();
 assert.equal(r?.name,'a.png');assert.equal(r?.blob.size,3);assert.deepEqual(calls,['image_pick','image_read']);});
test('cancelled dialogs do not touch the file or send bytes',async()=>{
 const calls:string[]=[];
 const invoke:HostInvoke=async<T,>(c:string)=>{calls.push(c);return null as T;};
 const host=nativeImageHost(invoke);
 assert.equal(await host.pick(),null);assert.equal(await host.save(new Blob([new Uint8Array(2)]),'x.png'),false);
 assert.deepEqual(calls,['image_pick','image_save_pick']);});
test('save sends raw bytes with the save token header',async()=>{
 let seen:{body?:unknown;headers?:Record<string,string>}={};
 const invoke:HostInvoke=async<T,>(c:string,a?:unknown,o?:{headers?:Record<string,string>})=>{
  if(c==='image_save_pick')return {token:'s9',name:'x.png',size:0} as T;
  seen={body:a,headers:o?.headers};return undefined as T;};
 assert.equal(await nativeImageHost(invoke).save(new Blob([new Uint8Array([7,8])]),'x.png'),true);
 assert.ok(seen.body instanceof Uint8Array);assert.deepEqual([...(seen.body as Uint8Array)],[7,8]);assert.equal(seen.headers?.['x-somnia-token'],'s9');});
test('edited name keeps the stem and swaps the extension',()=>{assert.equal(editedName('photo.v2.jpg','png'),'photo.v2-edited.png');assert.equal(editedName('','webp'),'image-edited.webp');});
test('overwrite asks Rust for a grant for the same format and reports a format change',async()=>{
 const calls:string[]=[];let fail=false;
 const invoke:HostInvoke=async<T,>(c:string,a?:unknown)=>{calls.push(c);
  if(c==='image_overwrite_prepare'){assert.deepEqual(a,{originToken:'o1',extension:'png'});if(fail)throw Error('format-differs');return {token:'s1',name:'a.png',size:0} as T;}
  return undefined as T;};
 const host=nativeImageHost(invoke);
 assert.equal(await host.overwrite!(new Blob([new Uint8Array(1)]),'o1','png'),'saved');assert.deepEqual(calls,['image_overwrite_prepare','image_save_write']);
 fail=true;calls.length=0;assert.equal(await host.overwrite!(new Blob([new Uint8Array(1)]),'o1','png'),'format-differs');assert.deepEqual(calls,['image_overwrite_prepare']);
});
test('a failed overwrite grant never writes bytes',async()=>{
 const calls:string[]=[];const invoke:HostInvoke=async(c:string)=>{calls.push(c);throw Error('Original file is no longer available');};
 assert.equal(await nativeImageHost(invoke).overwrite!(new Blob([new Uint8Array(1)]),'o1','png'),'unavailable');assert.deepEqual(calls,['image_overwrite_prepare']);});
