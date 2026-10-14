import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS,buildInterfaceHandoff} from './export';
import {interfaceHandoffSnippets} from './handoffSnippets';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',rect='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');rect=addNode(d,d.pages[0].id,'rectangle',frame);});return {s,frame,rect};}
test('blend mode reaches svg group style and every css/snippet/dev channel',()=>{const {s,frame,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.blendMode='multiply';});const doc=s.get().document!;
 const svg=exportInterfaceLayerSVG(doc,frame).svg;assert.ok(svg.includes('style="mix-blend-mode:multiply"'),'svg group carries the blend mode');
 assert.ok(interfaceLayerCSS(doc,rect).css.includes('mix-blend-mode: multiply'));
 assert.ok(inspectInterfaceCSS(doc,frame).find(r=>r.id===rect)!.values['mix-blend-mode']==='multiply');
 assert.ok(interfaceHandoffSnippets(doc,frame).css.includes('mix-blend-mode: multiply'));
 assert.ok(interfaceLayerTailwind(doc,rect).snippet.includes('mix-blend-multiply'));
 assert.ok(interfaceLayerSwiftUI(doc,rect).snippet.includes('.blendMode(.multiply)'));
 const row=(buildInterfaceHandoff(doc,frame).nodes as {id:string;blendMode?:string}[]).find(r=>r.id===rect)!;assert.equal(row.blendMode,'multiply');});
test('blend mode validates the enum, clears on normal and undoes once',()=>{const {s,rect}=scene();s.transact(d=>{d.nodes.find(n=>n.id===rect)!.blendMode='screen';});
 assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.blendMode,'screen');
 const before=s.get();assert.throws(()=>s.transact(d=>{d.nodes.find(n=>n.id===rect)!.blendMode='difference' as never;}));assert.equal(s.get(),before);
 s.transact(d=>{delete d.nodes.find(n=>n.id===rect)!.blendMode;});assert.equal(s.get().document!.nodes.find(n=>n.id===rect)!.blendMode,undefined);});
