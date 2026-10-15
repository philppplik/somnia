import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportSvg,importSvg,normalizeDoc,SvgImportError} from '../vectorio';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import {vectorCommandSpecs} from './commands';
import {vectorShellCommandSpecs} from './shellCommands';
import * as S from './session';
import {rectPath} from './shapes';
import {applyGradient,angleOf} from './gradients';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const svg=(defs:string,body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 100"><defs>${defs}</defs>${body}</svg>`;
const LIN='<linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="50%" style="stop-color:#00ff00;stop-opacity:.5"/><stop offset="1" stop-color="#00f"/></linearGradient>';
const RECT='<rect x="20" y="10" width="100" height="50" fill="url(#a)"/>';

test('gradient import: bbox gradients, stops, roundtrip is stable, files without gradients are unchanged',()=>{
 const d=importSvg(svg(LIN,RECT)).doc;
 assert.equal(d.gradients?.length,1);const g=d.gradients![0];assert.equal(g.kind,'linear');assert.deepEqual(g.stops.map(s=>[s.offset,s.color,s.opacity]),[[0,'#ff0000',1],[0.5,'#00ff00',0.5],[1,'#0000ff',1]]);
 assert.equal(d.paths[0].style?.fill,'url(#a)');
 const out=exportSvg(normalizeDoc(d));assert.match(out,/<linearGradient id="a"/);assert.match(out,/fill="url\(#a\)"/);
 assert.equal(exportSvg(normalizeDoc(importSvg(out).doc)),out);
 const plain=exportSvg(importSvg(svg('','<rect width="10" height="10" fill="#f00"/>')).doc);assert.ok(!plain.includes('<defs>')&&!plain.includes('Gradient'));
});
test('gradient import: userSpaceOnUse converts to the object box; href stops; radial',()=>{
 const u=importSvg(svg('<linearGradient id="u" gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="120" y2="10"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>',RECT.replace('#a','#u'))).doc.gradients![0];
 assert.ok(u.kind==='linear'&&Math.abs(u.x1)<1e-6&&Math.abs(u.x2-1)<1e-6);
 const h=importSvg(svg('<linearGradient id="base"><stop offset="0" stop-color="#111111"/><stop offset="1" stop-color="#eeeeee"/></linearGradient><linearGradient id="a" xlink:href="#base" x2="0" y2="1"/>',RECT)).doc.gradients![0];
 assert.ok(h.kind==='linear'&&h.stops.length===2&&h.x2===0&&h.y2===1);
 const r=importSvg(svg('<radialGradient id="a" cx=".25" cy=".5" r=".4"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>',RECT)).doc.gradients![0];
 assert.ok(r.kind==='radial'&&r.cx===0.25&&r.r===0.4);
});
test('gradient import: unsupported features are refused, not guessed',()=>{
 const bad=(defs:string,body=RECT)=>assert.throws(()=>importSvg(svg(defs,body)),SvgImportError);
 bad(LIN.replace('x1="0"','gradientTransform="rotate(45)" x1="0"'));
 bad(LIN.replace('x1="0"','spreadMethod="repeat" x1="0"'));
 bad(LIN,RECT.replace('fill="url(#a)"','fill="url(#nope)"'));
 bad(LIN,RECT.replace('fill="url(#a)"','fill="none" stroke="url(#a)"'));
 bad('<linearGradient id="a"/>');
 bad(LIN+'<pattern id="p"/>');
});
test('setGradient: one undo step, angle/colour edits keep stops, none restores a solid, bad input is refused',async()=>{
 S.resetVectorSession();S.createBlankVector();S.addPath(rectPath({x:0,y:0,w:100,h:50}),true);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));
 const before=structuredClone(S.getVectorSession().doc);
 await assert.rejects(d.runCommand('vector.setGradient',{kind:'linear'},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 await assert.rejects(d.runCommand('vector.setGradient',{angle:400},{origin:'test'}),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 await assert.rejects(d.runCommand('vector.setGradient',{startColor:'red'},{origin:'test'}),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.setGradient',{kind:'linear',endColor:'#ff00ff'},{origin:'test'});
 let doc=S.getVectorSession().doc;assert.equal(doc.gradients?.length,1);assert.match(doc.paths[0].style!.fill!,/^url\(#vsg1\)$/);assert.equal(doc.gradients![0].stops[1].color,'#ff00ff');
 await d.runCommand('vector.setGradient',{angle:90},{origin:'test'});doc=S.getVectorSession().doc;
 assert.equal(doc.gradients!.length,1);assert.equal(angleOf(doc.gradients![0]),90);assert.equal(doc.gradients![0].stops[1].color,'#ff00ff');
 await d.runCommand('vector.setGradient',{kind:'radial'},{origin:'test'});assert.equal(S.getVectorSession().doc.gradients![0].kind,'radial');
 S.undo();assert.equal(S.getVectorSession().doc.gradients![0].kind,'linear');
 await d.runCommand('vector.setGradient',{kind:'none'},{origin:'test'});doc=S.getVectorSession().doc;assert.equal(doc.gradients,undefined);assert.match(doc.paths[0].style!.fill!,/^#[0-9a-f]{6}$/);
 // setStyle can not point at a gradient that does not exist
 await d.runCommand('vector.setStyle',{patch:{fill:'url(#ghost)'}},{origin:'test'});assert.ok(!(S.getVectorSession().doc.paths[0].style?.fill??'').startsWith('url('));
 assert.equal(applyGradient(before,[],{kind:'linear'}),before);
});
test('gradients survive duplicate and merge-import with fresh ids; unused gradients are dropped on export',async()=>{
 S.resetVectorSession();S.createBlankVector();S.addPath(rectPath({x:0,y:0,w:100,h:50}),true);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));
 await d.runCommand('vector.setGradient',{kind:'linear'},{origin:'test'});
 await d.runCommand('vector.duplicateSelection',{},{origin:'test'});
 const fills=S.getVectorSession().doc.paths.map(p=>p.style?.fill);assert.equal(fills[0],fills[1]);assert.equal(S.getVectorSession().doc.gradients!.length,1);
 assert.ok(S.importSvgInto(svg(LIN,RECT)));
 const doc=S.getVectorSession().doc;assert.equal(doc.gradients!.length,2);assert.equal(new Set(doc.gradients!.map(g=>g.id)).size,2);
 const imported=doc.paths[doc.paths.length-1].style!.fill!;assert.ok(doc.gradients!.some(g=>`url(#${g.id})`===imported&&g.stops.length===3));
 const orphan={...doc,gradients:[...doc.gradients!,{...doc.gradients![0],id:'zz'}]};assert.ok(!exportSvg(normalizeDoc(orphan)).includes('id="zz"'));
});
