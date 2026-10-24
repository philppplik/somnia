import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {computeInterfaceLayout} from './layout';
import {addInterfaceBreakpoint,previewInterfaceBreakpoint} from './breakpoints';
import {DEFAULT_SIZING} from './schema';
function scene(){const s=createInterfaceSession();s.start();let frame='',child='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');child=addNode(d,d.pages[0].id,'rectangle',frame);const n=d.nodes.find(n=>n.id===frame)!;n.width=1280;n.height=800;n.layout={direction:'row',gap:8,padding:[0,0,0,0],align:'start',wrap:false};d.nodes.find(n=>n.id===child)!.sizing={...DEFAULT_SIZING,width:'fill',height:'fixed'};});return {s,frame,child};}
test('breakpoint preview renders a resized clone while the source stays untouched',()=>{const {s,frame,child}=scene();let bp='';s.transact(d=>{bp=addInterfaceBreakpoint(d,frame,{name:'Mobile',width:390,height:700});});
 const before=s.get();const doc=before.document!;const clone=previewInterfaceBreakpoint(doc,frame,bp);
 assert.equal(s.get(),before);assert.equal(doc.nodes.find(n=>n.id===frame)!.width,1280);
 assert.equal(clone.nodes.find(n=>n.id===frame)!.width,390);assert.equal(clone.nodes.find(n=>n.id===frame)!.height,700);
 const layout=computeInterfaceLayout(clone);assert.equal(layout.bounds.get(frame)!.width,390);assert.equal(layout.bounds.get(child)!.width,390-0);
 assert.ok(computeInterfaceLayout(doc).bounds.get(child)!.width>390);});
test('breakpoint preview validates ids and keeps links and content intact',()=>{const {s,frame}=scene();let bp='';s.transact(d=>{bp=addInterfaceBreakpoint(d,frame,{name:'Tablet',width:834,height:1000});d.nodes.find(n=>n.id===frame)!.prototypeLinks=[{trigger:'click',targetFrameId:frame}];});
 const clone=previewInterfaceBreakpoint(s.get().document!,frame,bp);assert.equal(clone.nodes.find(n=>n.id===frame)!.prototypeLinks!.length,1);assert.equal(clone.revision,s.get().document!.revision);
 assert.throws(()=>previewInterfaceBreakpoint(s.get().document!,frame,'missing'),/Breakpoint unavailable/);assert.throws(()=>previewInterfaceBreakpoint(s.get().document!,bp,bp),/Breakpoint unavailable/);});
