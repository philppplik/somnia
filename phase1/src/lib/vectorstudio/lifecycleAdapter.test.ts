import test from 'node:test';
import assert from 'node:assert/strict';
import {addPath,createBlankVector,createVectorLifecycleAdapter,getVectorSession,redo,resetVectorSession,setTool,undo} from './session';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import type {VectorPath} from '../vectorio';

const path=(id:string):VectorPath=>({id,closed:true,nodes:[{id:`${id}-a`,x:0,y:0},{id:`${id}-b`,x:10,y:0},{id:`${id}-c`,x:10,y:10}]} as unknown as VectorPath);
test.beforeEach(()=>{resetVectorSession();});
test.after(()=>{resetVectorSession();});

test('the Vector adapter is registered for the vector studio',()=>{assert.ok(getRegisteredLifecycleAdapter('vector'));});

test('suspend releases the document and resume restores document, selection, tool and undo history',async()=>{
 const adapter=createVectorLifecycleAdapter();
 createBlankVector(400,300,'logo.svg');
 addPath(path('p1'));addPath(path('p2'));undo();setTool('pen');
 const before=getVectorSession();
 assert.equal(adapter.hasUnsavedChanges!(),true);
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 assert.equal(getVectorSession().open,false,'the in-memory session is released');
 assert.equal(getVectorSession().doc.paths.length,0);
 await adapter.resume!(snap);
 const s=getVectorSession();
 assert.equal(s.name,'logo.svg');assert.equal(s.doc.width,400);
 assert.deepEqual(s.doc.paths.map(p=>p.id),['p1']);
 assert.equal(s.tool,'pen');assert.equal(s.dirty,true);
 assert.deepEqual(s.selection,before.selection);
 assert.equal(s.canRedo,true,'redo survived');
 redo();assert.equal(getVectorSession().doc.paths.length,2);
 undo();undo();assert.equal(getVectorSession().doc.paths.length,0,'full undo chain survived');
});

test('a dirty document stays flagged as unsaved while it only lives in the checkpoint',async()=>{
 const adapter=createVectorLifecycleAdapter();
 createBlankVector();addPath(path('p1'));
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 assert.equal(adapter.hasUnsavedChanges!(),true);
 await assert.rejects(()=>adapter.dispose!(),/Refusing/);
 await adapter.resume!(snap);
 assert.equal(adapter.hasUnsavedChanges!(),true,'dirty again once restored');
});

test('a clean studio is disposable and the revision follows edits',async()=>{
 const adapter=createVectorLifecycleAdapter();
 assert.equal(adapter.hasUnsavedChanges!(),false);
 await adapter.dispose!();
 createBlankVector();
 const a=(await adapter.snapshot!())!;
 addPath(path('p1'));
 const b=(await adapter.snapshot!())!;
 assert.ok(b.revision>a.revision);
 assert.ok(adapter.estimateBytes!()>0);
});

test('history in the checkpoint is bounded and tampering is refused',async()=>{
 const adapter=createVectorLifecycleAdapter();
 createBlankVector();
 for(let i=0;i<70;i++)addPath(path(`p${i}`));
 const snap=(await adapter.snapshot!())!;
 assert.ok((snap.payload as {past:unknown[]}).past.length<=50);
 await assert.rejects(()=>adapter.resume!({...snap,checksum:'0000000000000000'}),/verification/);
 await assert.rejects(()=>adapter.resume!({...snap,studioId:'design'}),/belongs to/);
});
