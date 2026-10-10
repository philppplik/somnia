import {test} from 'node:test';
import assert from 'node:assert/strict';

let n=0;
(globalThis as {URL:unknown}).URL=Object.assign(function(){},URL,{createObjectURL:()=>`blob:fake-${++n}`,revokeObjectURL:()=>{}});
(globalThis as {Blob:unknown}).Blob=class{constructor(public parts?:unknown[]){}};
const {addBlankVideoProject,clearMedia,closeMedia,registerMediaCloseGuard,registerMediaCloseCleanup,getMedia}=await import('./media');

test('a cancelling guard stops every cleanup - sessions survive a rejected close',()=>{
 const events:string[]=[];
 const offG1=registerMediaCloseGuard(name=>{events.push(`guard:${name}`);return true;});
 const offC=registerMediaCloseCleanup(name=>{const it=getMedia().items.find(i=>i.name===name);events.push(`cleanup:${name}:${it?it.url:'gone'}`);});
 const offG2=registerMediaCloseGuard(name=>{if(name!=='b.mp4')return true;events.push('cancel:b.mp4');return false;});
 addBlankVideoProject('a.mp4');addBlankVideoProject('b.mp4');
 assert.equal(clearMedia(),false);
 assert.deepEqual(getMedia().items.map(i=>i.name),['a.mp4','b.mp4']);
 assert.deepEqual(events.filter(e=>e.startsWith('cleanup')),[]);
 offG2();
 assert.equal(clearMedia(),true);
 const cleanups=events.filter(e=>e.startsWith('cleanup'));
 assert.deepEqual(cleanups.map(e=>e.split(':')[1]),['a.mp4','b.mp4']);
 assert.ok(cleanups.every(e=>e.includes('blob:fake-')),'cleanups must still see the item url');
 offG1();offC();
});

test('closeMedia runs cleanup after approval while the item is still addressable',()=>{
 const seen:string[]=[];
 const offC=registerMediaCloseCleanup(name=>seen.push(`${name}:${getMedia().items.some(i=>i.name===name)}`));
 addBlankVideoProject('c.mp4');
 closeMedia('c.mp4');
 assert.deepEqual(seen,['c.mp4:true']);
 assert.equal(getMedia().items.length,0);
 offC();
});
