import test from 'node:test';import assert from 'node:assert/strict';
import {createInterfaceSession} from './session';
import {addNode} from './model';
import {DEFAULT_TEXT_STYLE} from './tokens';
import {exportInterfaceLayerSVG,interfaceLayerCSS,inspectInterfaceCSS} from './export';
import {interfaceLayerTailwind,interfaceLayerSwiftUI} from './devMode';
function scene(){const s=createInterfaceSession();s.start();let frame='',text='';s.transact(d=>{frame=addNode(d,d.pages[0].id,'frame');text=addNode(d,d.pages[0].id,'text',frame);(d.textStyles??=[]).push({...DEFAULT_TEXT_STYLE,id:'ts1',name:'Body'});const n=d.nodes.find(n=>n.id===text)!;n.textStyleId='ts1';n.text='Read me';});return {s,frame,text};}
test('letter spacing reaches svg, css, tailwind and swiftui output',()=>{const {s,frame,text}=scene();s.transact(d=>{d.textStyles!.find(x=>x.id==='ts1')!.letterSpacing=2;});const doc=s.get().document!;
 assert.ok(exportInterfaceLayerSVG(doc,text).svg.includes('letter-spacing="2px"'));
 assert.ok(interfaceLayerCSS(doc,text).css.includes('letter-spacing: 2px'));
 const rows=inspectInterfaceCSS(doc,frame);assert.ok(rows.find(r=>r.id===text)!.values['letter-spacing']==='2px');
 assert.ok(interfaceLayerTailwind(doc,text).snippet.includes('tracking-[2px]'));
 assert.ok(interfaceLayerSwiftUI(doc,text).snippet.includes('.tracking(2)'));
 s.transact(d=>{d.textStyles!.find(x=>x.id==='ts1')!.letterSpacing=-1;});assert.ok(exportInterfaceLayerSVG(s.get().document!,text).svg.includes('letter-spacing="-1px"'));
 s.transact(d=>{delete d.textStyles!.find(x=>x.id==='ts1')!.letterSpacing;});assert.ok(!exportInterfaceLayerSVG(s.get().document!,text).svg.includes('letter-spacing'));});
test('letter spacing validates bounds and reverts with one undo',()=>{const {s}=scene();s.transact(d=>{d.textStyles!.find(x=>x.id==='ts1')!.letterSpacing=2;});
 assert.equal(s.get().document!.textStyles![0].letterSpacing,2);
 for(const bad of [65,-33,Number.NaN]){const before=s.get();assert.throws(()=>s.transact(d=>{d.textStyles!.find(x=>x.id==='ts1')!.letterSpacing=bad;}));assert.equal(s.get(),before);}
 assert.equal(s.get().document!.textStyles![0].letterSpacing,2);
 s.undo();assert.equal(s.get().document!.textStyles![0].letterSpacing,undefined);});
