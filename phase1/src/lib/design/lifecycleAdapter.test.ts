import test from 'node:test';
import assert from 'node:assert/strict';
import {clearDesign,createDesignLifecycleAdapter,editDesign,getDesignState,markDesignSaved,redoDesign,selectArtboard,setDesignTool,startDesign,undoDesign} from './session';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';

const rename=(name:string)=>editDesign(d=>({...d,name}));
test.beforeEach(()=>clearDesign());
test.after(()=>clearDesign());

test('the Design adapter is registered for the design studio',()=>{assert.ok(getRegisteredLifecycleAdapter('design'));});

test('suspend clears the session and resume restores document, tool and undo history',async()=>{
 const adapter=createDesignLifecycleAdapter();
 startDesign();rename('One');rename('Two');undoDesign();setDesignTool('rectangle' as never);
 const before=getDesignState();
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 assert.equal(getDesignState().document,null);
 await adapter.resume!(snap);
 const s=getDesignState();
 assert.equal(s.document?.name,'One');
 assert.equal(s.dirty,true);
 assert.equal(s.tool,before.tool);
 assert.equal(s.artboardId,before.artboardId);
 assert.equal(s.future.length,1);
 redoDesign();assert.equal(getDesignState().document?.name,'Two');
 undoDesign();undoDesign();assert.equal(getDesignState().document?.name,'Untitled design');
});

test('unsaved edits count as unsaved while suspended and block eviction; saved documents can be evicted',async()=>{
 const adapter=createDesignLifecycleAdapter();
 startDesign();rename('Draft');
 await adapter.suspend!();
 assert.equal(adapter.hasUnsavedChanges!(),true);
 await assert.rejects(()=>adapter.dispose!(),/Refusing/);
 clearDesign();
 startDesign();rename('Saved');markDesignSaved();
 assert.equal(adapter.hasUnsavedChanges!(),false);
 await adapter.dispose!();
 assert.equal(getDesignState().document,null);
});

test('resume rejects corrupted checkpoints and invalid documents',async()=>{
 const adapter=createDesignLifecycleAdapter();
 startDesign();rename('X');
 const snap=(await adapter.snapshot!())!;
 await assert.rejects(()=>adapter.resume!({...snap,checksum:'bad'}),/verification/);
 const payload=structuredClone(snap.payload) as {document:{format:string}};
 payload.document.format='nope';
 const forged={...snap,payload,checksum:(await import('../lifecycle/recipeKit')).payloadChecksum('design',1,snap.revision,payload)};
 await assert.rejects(()=>adapter.resume!(forged));
});

test('history is bounded, revision and size estimate follow edits',async()=>{
 const adapter=createDesignLifecycleAdapter();
 startDesign();
 const a=(await adapter.snapshot!())!;
 for(let i=0;i<70;i++)rename(`n${i}`);
 selectArtboard(getDesignState().artboardId!);
 const b=(await adapter.snapshot!())!;
 assert.ok((b.payload as {past:unknown[]}).past.length<=50);
 assert.ok(b.revision>a.revision);
 assert.ok(adapter.estimateBytes!()>0);
 assert.deepEqual(adapter.pinReasons!(),[]);
});
