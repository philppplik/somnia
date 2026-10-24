import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,normalizeDoc,SvgImportError} from '../vectorio';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import * as S from './session';
import {rectPath} from './shapes';
import {applyGradient} from './gradients';
const wrap=(defs:string,body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><defs>${defs}</defs>${body}</svg>`;
const LIN='<linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>';
test('stroke gradients import, export and roundtrip; fill and stroke can share one gradient',()=>{
 const d=importSvg(wrap(LIN,'<rect x="20" y="10" width="100" height="50" fill="url(#a)" stroke="url(#a)" stroke-width="4"/><rect x="5" y="5" width="9" height="9" fill="none" stroke="url(#a)"/>')).doc;
 assert.equal(d.gradients!.length,1);assert.equal(d.paths[0].style!.stroke,'url(#a)');assert.equal(d.paths[1].style!.stroke,'url(#a)');
 const out=exportSvg(normalizeDoc(d));assert.match(out,/stroke="url\(#a\)"/);assert.equal(exportSvg(normalizeDoc(importSvg(out).doc)),out);
 assert.throws(()=>importSvg(wrap(LIN,'<rect width="9" height="9" stroke="url(#nope)"/>')),SvgImportError);
 assert.throws(()=>importSvg(wrap('<pattern id="p" width="4" height="4"/>','<rect width="9" height="9" stroke="url(#p)"/>')),SvgImportError);
});
test('a dangling stroke reference is dropped on export, an unused gradient is not written',()=>{
 const doc=normalizeDoc({width:50,height:50,paths:[{...rectPath({x:0,y:0,w:10,h:10}),id:'a',style:{stroke:'url(#ghost)'}}] as any});
 assert.doesNotMatch(exportSvg(doc),/ghost|stroke/);
});
const doc=()=>({width:200,height:100,paths:[{...rectPath({x:10,y:10,w:50,h:30}),id:'a',style:{fill:'#ff0000',stroke:'#0000ff',strokeWidth:3}},{id:'l',closed:false,nodes:[{id:'n1',x:0,y:80,kind:'corner'},{id:'n2',x:50,y:80,kind:'corner'}]}] as any});
test('applyGradient on the stroke leaves the fill alone, and none restores a plain colour',()=>{
 const a=applyGradient(doc() as any,['a'],{kind:'linear',angle:90,startColor:'#00ff00'},'stroke');
 const st=a.paths[0].style!;assert.match(st.stroke!,/^url\(#vsg1\)$/);assert.equal(st.fill,'#ff0000');assert.equal(a.gradients!.length,1);
 const b=applyGradient(a,['a'],{kind:'none'},'stroke');assert.match(b.paths[0].style!.stroke!,/^#[0-9a-f]{6}$/);assert.equal(b.gradients,undefined);
 assert.throws(()=>applyGradient(doc() as any,['l'],{kind:'linear'},'stroke'),RangeError);
 assert.throws(()=>applyGradient(doc() as any,['a'],{kind:'linear'},'x' as any),RangeError);
});
test('vector.setGradient target: undo step, ui only, schema checked',async()=>{
 S.resetVectorSession();S.createBlankVector(200,100);S.addPath({...rectPath({x:10,y:10,w:50,h:30}),id:'a'} as any);S.select(['a']);const before=S.getVectorSession().doc.paths[0].style?.stroke;
 const d=new CommandDispatcher();[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)].forEach(s=>d.register(s));
 const o={origin:'test'} as const;await d.runCommand('vector.setGradient',{target:'stroke',kind:'radial'},o);
 assert.match(S.getVectorSession().doc.paths[0].style!.stroke!,/^url\(#/);S.undo();assert.equal(S.getVectorSession().doc.paths[0].style?.stroke,before);
 await assert.rejects(d.runCommand('vector.setGradient',{target:'glow',kind:'linear'},o),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.setGradient',{target:'stroke',kind:'linear'},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 S.setStyle({stroke:'url(#missing)'});assert.equal(S.getVectorSession().doc.paths[0].style?.stroke,before);
});
