import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);d.nodes.find(n=>n.id===rect)!.width=100;d.nodes.find(n=>n.id===rect)!.height=60;});return {s,frame,rect};}
test('corner radius reaches svg rect, clip path and every css/snippet channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.radius=12;d.nodes.find(n=>n.id===frame)!.radius=20;});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,rect).svg;assert.ok(svg.includes('rx="12"'));
 const frameSvg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(frameSvg.includes('rx="20"'),'frame rect and clip path are rounded');
 assert.ok(interfaceLayerCSS(doc,rect).css.includes('border-radius: 12px'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values['border-radius']==='12px');
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes('border-radius: 12px'));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('rounded-[12px]'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.cornerRadius(12)'));});
test('corner radius clamps to half the smaller side in svg output',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.radius=4000;});
 assert.ok(exportInterfaceLayerSVG(s.get().document!,rect).svg.includes('rx="30"'),'clamped to height/2');});
test('corner radius validates kind and range, clears on zero and undoes once',()=>{const {s,rect,frame}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.radius=12;});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.radius,12);
 for(const bad of [0,-1,5000,Number.NaN]){const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.radius=bad;}));assert.equal(s.get(),before);}
 let text='';s.transact(d=>{text=addNode(d,d.pages[0].id,'text',frame);});
 const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===text)!.radius=4 as never;}));assert.equal(s.get(),before);
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.radius;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.radius,undefined);});
