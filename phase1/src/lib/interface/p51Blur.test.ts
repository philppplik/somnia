import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS,buildInterfaceHandoff} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='',text='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);text=addNode(d,d.pages[0].id,'text',frame);d.nodes.find(n=>n.id===text)!.text='Blur copy';});return {s,frame,rect,text};}
test('layer blur reaches svg filter and every css/snippet/dev channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.blur=6;});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(svg.includes('<feGaussianBlur stdDeviation="3"/>'),'svg blur primitive');assert.ok(svg.includes(`filter="url(#blur-`),'group references the blur filter');
 assert.ok(interfaceLayerCSS(doc,rect).css.includes('filter: blur(6px)'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values['filter']==='blur(6px)');
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes('filter: blur(6px)'));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('blur-[6px]'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.blur(radius: 6)'));
 const row=(buildInterfaceHandoff(doc,frame).nodes as {id:string;blur?:number}[]).find(r=>r.id===rect)!;assert.equal(row.blur,6);});
test('blur and drop shadow combine into one svg filter',()=>{const {s,frame,rect}=scene();s.transact(d=>{const n=d.nodes.find(n=>n.id===rect)!;n.blur=6;n.shadow={x:0,y:2,blur:4,color:'#000000'};});
 const svg=exportInterfaceLayerSVG(s.get().document!,frame).svg;const def=svg.match(/<filter id="shadow-[^"]*">[^<]*(<[^/][^>]*\/>){2}<\/filter>/);assert.ok(def,'one filter def with both primitives');assert.ok(def![0].includes('<feGaussianBlur stdDeviation="3"/>'));assert.ok(def![0].includes('<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000"/>'));});
test('layer blur validates range, clears on untoggle and undoes once',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.blur=4;});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.blur,4);
 for(const bad of [0,-1,Number.NaN,1025]){const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.blur=bad;}));assert.equal(s.get(),before);}
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.blur;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.blur,undefined);});
