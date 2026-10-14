import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS,buildInterfaceHandoff} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);});return {s,frame,rect};}
test('layer opacity reaches svg group and every css/snippet/dev channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.opacity=0.5;});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(svg.includes('opacity="0.5"'),'svg group carries opacity');
 assert.ok(interfaceLayerCSS(doc,rect).css.includes('opacity: 0.5'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values.opacity==='0.5');
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes('opacity: 0.5'));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('opacity-[0.5]'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.opacity(0.5)'));
 const row=(buildInterfaceHandoff(doc,frame).nodes as {id:string;opacity?:number}[]).find(r=>r.id===rect)!;assert.equal(row.opacity,0.5);});
test('frame opacity fades the whole subtree in svg export',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===frame)!.opacity=0.25;});
 const svg=exportInterfaceLayerSVG(s.get().document!,frame).svg;
 assert.ok(svg.includes('<g transform="translate(0 0)" opacity="0.25"'),'root frame group is translucent and children inherit');});
test('layer opacity validates range, clears on 100 percent and undoes once',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.opacity=0.4;});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.opacity,0.4);
 for(const bad of [-0.1,1,2,Number.NaN]){const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.opacity=bad;}));assert.equal(s.get(),before);}
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.opacity;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.opacity,undefined);});
