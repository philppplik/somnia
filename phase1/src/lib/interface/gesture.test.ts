import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {applyInterfaceGesture,type InterfaceGesture} from './gesture';
function scene(){const s=createInterfaceSession();s.start();s.transact(d=>{addNode(d,d.pages[0].id,'frame');});const doc=s.get().document!,node=doc.nodes[0];const drag:InterfaceGesture={...node,revision:doc.revision,startX:0,startY:0,dx:20,dy:10,resize:false};return {s,node,drag};}
test('preview/cancel cannot mutate source; drag commits one undo transaction',()=>{
 const {s,node,drag}=scene();const before=s.get();const preview={x:node.x+drag.dx,y:node.y+drag.dy};assert.equal(preview.x,44);assert.equal(s.get(),before); // cancelled preview: do not call commit
 s.transact(d=>{assert.equal(applyInterfaceGesture(d,drag),true);});assert.equal(s.get().past.length,before.past.length+1);assert.equal(s.get().document!.nodes[0].x,44);s.undo();assert.equal(s.get().document!.nodes[0].x,node.x);
});
test('resize is bounded below, locked or stale gesture does not change source',()=>{
 const {s,drag}=scene();s.transact(d=>{applyInterfaceGesture(d,{...drag,resize:true,dx:-1000,dy:-1000});});assert.equal(s.get().document!.nodes[0].width,1);assert.equal(s.get().document!.nodes[0].height,1);
 const before=s.get();s.transact(d=>{assert.equal(applyInterfaceGesture(d,drag),false);});assert.equal(s.get(),before);
 s.transact(d=>{d.nodes[0].locked=true;});const locked=s.get();s.transact(d=>{assert.equal(applyInterfaceGesture(d,{...drag,revision:d.revision}),false);});assert.equal(s.get(),locked);
});
test('non-finite or excessive gestures fail validation atomically',()=>{const {s,drag}=scene(),before=s.get();assert.throws(()=>s.transact(d=>{applyInterfaceGesture(d,{...drag,dx:Infinity});}));assert.equal(s.get(),before);assert.throws(()=>s.transact(d=>{applyInterfaceGesture(d,{...drag,dy:40000});}));assert.equal(s.get(),before);});
