import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS,buildInterfaceHandoff} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='',text='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);text=addNode(d,d.pages[0].id,'text',frame);d.nodes.find(n=>n.id===text)!.text='Shadow copy';});return {s,frame,rect,text};}
test('drop shadow reaches svg filter and every css/snippet/dev channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.shadow={x:2,y:4,blur:8,color:'#112233'};});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(svg.includes('<feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#112233"/>'),'svg filter primitives');assert.ok(svg.includes(`filter="url(#shadow-`),'group references the filter');
 assert.ok(interfaceLayerCSS(doc,rect).css.includes('box-shadow: 2px 4px 8px #112233'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values['box-shadow']==='2px 4px 8px #112233');
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes('box-shadow: 2px 4px 8px #112233'));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('shadow-[2px_4px_8px_#112233]'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.shadow(color: Color("112233"), radius: 4, x: 2, y: 4)'));
 const row=(buildInterfaceHandoff(doc,frame).nodes as {id:string;shadow?:{x:number}}[]).find(r=>r.id===rect)!;assert.equal(row.shadow!.x,2);});
test('text layers map the shadow to text-shadow instead of box-shadow',()=>{const {s,text}=scene();s.transact(d=>{d.nodes.find(n=>n.id===text)!.shadow={x:0,y:2,blur:4,color:'#000000'};});
 const css=interfaceLayerCSS(s.get().document!,text).css;assert.ok(css.includes('text-shadow: 0px 2px 4px #000000'));assert.ok(!css.includes('box-shadow'));});
test('drop shadow validates structure and range, clears on untoggle and undoes once',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.shadow={x:0,y:2,blur:4,color:'#000000'};});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.shadow!.blur,4);
 for(const bad of [{x:0,y:2,blur:-1,color:'#000000'},{x:0,y:2,blur:4,color:'black'},{x:Number.NaN,y:2,blur:4,color:'#000000'}]){const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.shadow=bad as never;}));assert.equal(s.get(),before);}
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.shadow;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.shadow,undefined);});
