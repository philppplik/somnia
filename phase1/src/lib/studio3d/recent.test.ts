import test from 'node:test';
import assert from 'node:assert/strict';
import {putRecent,readIndex,loadRecent,removeRecent,clearRecent,autosaveDue,recentId,AUTOSAVE_ID,MAX_RECENT,MAX_ENTRY_BYTES,type KeyValueStore} from './recent';
const memory=():KeyValueStore&{data:Map<string,unknown>}=>{const data=new Map<string,unknown>();return{data,get:async k=>data.get(k),set:async(k,v)=>{data.set(k,v);},del:async k=>{data.delete(k);}};};
test('a saved scene is listed newest first and loads back',async()=>{
 const s=memory();await putRecent(s,{name:'a.som3d',text:'AAA',now:1});await putRecent(s,{name:'b.som3d',text:'BB',now:2});
 const list=await readIndex(s);assert.deepEqual(list.map(e=>e.name),['b.som3d','a.som3d']);
 assert.equal((await loadRecent(s,recentId('A.SOM3D')))?.text,'AAA');
});
test('saving the same name replaces the entry',async()=>{
 const s=memory();await putRecent(s,{name:'a.som3d',text:'1',now:1});await putRecent(s,{name:'a.som3d',text:'22',now:5});
 const list=await readIndex(s);assert.equal(list.length,1);assert.equal(list[0].size,2);assert.equal((await loadRecent(s,list[0].id))?.text,'22');
});
test('autosave uses one slot beside the saved files',async()=>{
 const s=memory();await putRecent(s,{name:'a.som3d',text:'1',now:1});await putRecent(s,{name:'x',text:'one',auto:true,now:2});await putRecent(s,{name:'x',text:'two',auto:true,now:3});
 const list=await readIndex(s);assert.equal(list.length,2);assert.equal(list[0].id,AUTOSAVE_ID);assert.equal((await loadRecent(s,AUTOSAVE_ID))?.text,'two');
});
test('the oldest saved file is evicted past the count limit and its data is deleted',async()=>{
 const s=memory();for(let i=0;i<MAX_RECENT+2;i++)await putRecent(s,{name:`f${i}.som3d`,text:'x',now:i+1});
 const list=await readIndex(s);assert.equal(list.length,MAX_RECENT);assert.ok(!list.some(e=>e.name==='f0.som3d'));assert.equal(s.data.has('doc:'+recentId('f0.som3d')),false);
 await putRecent(s,{name:'auto',text:'x',auto:true,now:99});assert.equal((await readIndex(s)).length,MAX_RECENT+1);
});
test('an oversized scene is refused and nothing changes',async()=>{
 const s=memory();const r=await putRecent(s,{name:'big',text:'x'.repeat(MAX_ENTRY_BYTES+1)});assert.deepEqual(r,{ok:false,reason:'too-large'});assert.equal(s.data.size,0);
});
test('a failing store reports storage and does not throw',async()=>{
 const s:KeyValueStore={get:async()=>undefined,set:async()=>{throw new Error('quota');},del:async()=>undefined};
 assert.deepEqual(await putRecent(s,{name:'a',text:'x'}),{ok:false,reason:'storage'});
});
test('damaged index data reads as empty',async()=>{
 const s=memory();s.data.set('index',[{id:1},'x',{id:'a',name:'n',savedAt:1,size:1,auto:false}]);assert.equal((await readIndex(s)).length,1);s.data.set('index','nope');assert.deepEqual(await readIndex(s),[]);
});
test('remove and clear delete the data too',async()=>{
 const s=memory();await putRecent(s,{name:'a',text:'1',now:1});await putRecent(s,{name:'b',text:'2',now:2});
 await removeRecent(s,recentId('a'));assert.equal((await readIndex(s)).length,1);assert.equal(s.data.has('doc:'+recentId('a')),false);
 await clearRecent(s);assert.deepEqual(await readIndex(s),[]);assert.equal([...s.data.keys()].filter(k=>k.startsWith('doc:')).length,0);
});
test('autosave waits for a quiet period and only for unsaved changes',()=>{
 assert.equal(autosaveDue({dirty:true,lastChange:1000,lastSave:0,now:2000}),false);
 assert.equal(autosaveDue({dirty:true,lastChange:1000,lastSave:0,now:5000}),true);
 assert.equal(autosaveDue({dirty:true,lastChange:1000,lastSave:3000,now:9000}),false);
 assert.equal(autosaveDue({dirty:false,lastChange:1000,lastSave:0,now:9000}),false);
});
