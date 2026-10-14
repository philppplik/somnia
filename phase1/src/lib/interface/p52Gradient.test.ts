import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {DEFAULT_INTERFACE_GRADIENT,interfaceGradientCSS} from './schema';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS,buildInterfaceHandoff} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='',ellipse='',text='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);ellipse=addNode(d,d.pages[0].id,'ellipse',frame);text=addNode(d,d.pages[0].id,'text',frame);d.nodes.find(n=>n.id===text)!.text='Gradient copy';});return {s,frame,rect,ellipse,text};}
test('gradient fill reaches svg def and every css/snippet/dev channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.gradient={angle:45,stops:[{offset:0,color:'#112233'},{offset:1,color:'#aabbcc'}]};});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(svg.includes('<linearGradient id="grad-'),'svg gradient def');assert.ok(svg.includes('<stop offset="0%" stop-color="#112233"/><stop offset="100%" stop-color="#aabbcc"/>'),'stops');assert.ok(svg.includes('fill="url(#grad-'),'rect references the gradient');
 const css='linear-gradient(45deg, #112233 0%, #aabbcc 100%)';assert.equal(interfaceGradientCSS(doc.nodes.find(n=>n.id===rect)!.gradient!),css);
 assert.ok(interfaceLayerCSS(doc,rect).css.includes(`background: ${css}`));assert.ok(!interfaceLayerCSS(doc,rect).css.includes('background-color'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values['background']===css);
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes(`background: ${css}`));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('bg-[linear-gradient(45deg,_#112233_0%,_#aabbcc_100%)]'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.background(LinearGradient(colors: [Color("112233"), Color("AABBCC")], startPoint: .bottomLeading, endPoint: .topTrailing))'));
 const row=(buildInterfaceHandoff(doc,frame).nodes as {id:string;gradient?:{angle:number}}[]).find(r=>r.id===rect)!;assert.equal(row.gradient!.angle,45);});
test('ellipse and closed path render the gradient in svg',()=>{const {s,frame,ellipse}=scene();s.transact(d=>{d.nodes.find(n=>n.id===ellipse)!.gradient=structuredClone(DEFAULT_INTERFACE_GRADIENT);});
 const svg=exportInterfaceLayerSVG(s.get().document!,frame).svg;const el=svg.match(/<ellipse[^>]*\/>/)![0];assert.ok(el.includes('fill="url(#grad-'),'ellipse fill references the gradient');assert.ok(svg.includes('stop-color="#7756e8"'),'default stops exported');});
test('gradient validates structure and range, clears on untoggle and undoes once',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.gradient=structuredClone(DEFAULT_INTERFACE_GRADIENT);});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.gradient!.stops.length,2);
 const good=structuredClone(DEFAULT_INTERFACE_GRADIENT);
 for(const bad of [{...good,angle:361},{...good,angle:Number.NaN},{...good,stops:[{offset:0,color:'#112233'}]},{...good,stops:[{offset:0.5,color:'#112233'},{offset:0.2,color:'#aabbcc'}]},{...good,stops:[{offset:0,color:'red'},{offset:1,color:'#aabbcc'}]},{...good,stops:[{offset:2,color:'#112233'},{offset:1,color:'#aabbcc'}]}]){const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.gradient=bad as never;}));assert.equal(s.get(),before);}
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.gradient;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.gradient,undefined);});
