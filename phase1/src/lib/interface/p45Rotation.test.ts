import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS,buildInterfaceHandoff} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);d.nodes.find(n=>n.id===rect)!.width=100;d.nodes.find(n=>n.id===rect)!.height=60;});return {s,frame,rect};}
test('layer rotation reaches svg transform and every css/snippet/dev channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.rotation=45;});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(svg.includes('rotate(45 50 30)'),'svg rotates about the layer center');
 assert.ok(interfaceLayerCSS(doc,rect).css.includes('transform: rotate(45deg)'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values.transform==='rotate(45deg)');
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes('transform: rotate(45deg)'));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('rotate-[45deg]'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.rotationEffect(.degrees(45))'));
 const row=(buildInterfaceHandoff(doc,frame).nodes as {id:string;rotation?:number}[]).find(r=>r.id===rect)!;assert.equal(row.rotation,45);});
test('negative rotation keeps the sign and rotation composes with opacity in svg',()=>{const {s,frame}=scene();s.transact(d=>{const n=d.nodes.find(n=>n.id===frame)!;n.rotation=-15;n.opacity=0.5;});
 const svg=exportInterfaceLayerSVG(s.get().document!,frame).svg;
 assert.ok(svg.includes('rotate(-15 '),'negative angle preserved');
 assert.ok(svg.includes('opacity="0.5"'),'opacity still present');});
test('layer rotation validates range, clears on zero and undoes once',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.rotation=90;});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.rotation,90);
 for(const bad of [0,361,-361,Number.NaN]){const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.rotation=bad;}));assert.equal(s.get(),before);}
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.rotation;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.rotation,undefined);});
