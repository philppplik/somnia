import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as S from './session';
import {hitDocument} from './geometry';
import {rectPath} from './shapes';
import {importSvg} from '../vectorio';
const root=new URL('../../../tests/assets/vector-studio/',import.meta.url);
const source=(name:string)=>readFileSync(new URL(name,root),'utf8');
const corpus=JSON.parse(source('manifest.json')) as Array<{file:string;outcome:string;paths?:number}>;
test.beforeEach(()=>S.resetVectorSession());
for(const c of corpus){test(`session corpus: ${c.file}`,()=>{
 S.createBlankVector(200,120,'existing.svg');S.addPath(rectPath({x:5,y:5,w:20,h:20}));
 const before=structuredClone(S.getVectorSession().doc),undo=S.getVectorSession().canUndo;
 if(c.outcome==='reject'){
  assert.equal(S.openSvgSource(source(c.file),'bad.svg'),false);
  assert.deepEqual(S.getVectorSession().doc,before);
  assert.equal(S.getVectorSession().name,'existing.svg');
  assert.equal(S.getVectorSession().canUndo,undo);
  assert.ok(S.getVectorSession().diagnostics.some(d=>d.severity==='error'));
  assert.equal(S.importSvgInto(source(c.file)),false);
  assert.deepEqual(S.getVectorSession().doc,before);
 }else{
  assert.equal(S.openSvgSource(source(c.file),c.file),true);
  assert.equal(S.getVectorSession().doc.paths.length,c.paths);
  const svg=S.toSvg();assert.equal(S.openSvgSource(svg),true);assert.equal(S.toSvg(),svg);
 }
});}
test('history restores the original document and invalidates redo after a new edit',()=>{
 S.createBlankVector();const empty=structuredClone(S.getVectorSession().doc);
 S.addPath(rectPath({x:0,y:0,w:10,h:10}));const shape=structuredClone(S.getVectorSession().doc);
 S.moveSelection(5,7);S.undo();assert.deepEqual(S.getVectorSession().doc,shape);
 S.undo();assert.deepEqual(S.getVectorSession().doc,empty);
 S.redo();assert.deepEqual(S.getVectorSession().doc,shape);
 S.select([shape.paths[0].id]);S.setStyle({fill:'#ff0000'});assert.equal(S.getVectorSession().canRedo,false);
});
test('compound object selection selects all visible contours',()=>{
 S.openSvgSource(source('compound-hole.svg'));const paths=S.getVectorSession().doc.paths;
 S.select([paths[0].id]);assert.deepEqual(S.getVectorSession().selection,paths.map(p=>p.id));
});
test('compound hit testing does not select the empty center of a hole',()=>{
 S.openSvgSource(source('compound-hole.svg'));
 assert.equal(hitDocument(S.getVectorSession().doc,{x:60,y:60},0),null);
 assert.ok(hitDocument(S.getVectorSession().doc,{x:20,y:20},0));
});
test('appending compound artwork remaps its identity space without merging objects',()=>{
 const src=source('compound-hole.svg');S.openSvgSource(src);S.importSvgInto(src);
 const doc=S.getVectorSession().doc;
 assert.equal(new Set(doc.paths.map(p=>p.id)).size,4);
 assert.equal(new Set(doc.paths.map(p=>p.compound)).size,2);
 assert.equal(new Set(doc.paths.flatMap(p=>p.nodes.map(n=>n.id))).size,doc.paths.flatMap(p=>p.nodes).length);
 assert.equal((S.toSvg().match(/<path /g)??[]).length,2);
 S.undo();assert.equal(S.getVectorSession().doc.paths.length,2);
});
test('duplicating a compound retains hole semantics with a fresh compound ID',()=>{
 S.openSvgSource(source('compound-hole.svg'));const paths=S.getVectorSession().doc.paths;
 S.select(paths.map(p=>p.id));S.duplicateSelection(120);
 const copies=S.getVectorSession().doc.paths.slice(2);
 assert.ok(copies[0].compound);assert.equal(copies[0].compound,copies[1].compound);
 assert.notEqual(copies[0].compound,paths[0].compound);
 assert.equal((S.toSvg().match(/<path /g)??[]).length,2);
});
test('hidden artwork cannot become selected through the public selection API',()=>{
 S.openSvgSource(source('styles-hidden.svg'));const hidden=S.getVectorSession().doc.paths.find(p=>p.hidden)!;
 S.select([hidden.id]);assert.deepEqual(S.getVectorSession().selection,[]);
});
test('node editing rejects nonfinite coordinates without corrupting the document',()=>{
 S.createBlankVector();const path=rectPath({x:0,y:0,w:10,h:10});S.addPath(path);
 const before=structuredClone(S.getVectorSession().doc);
 try{S.moveNode(path.id,path.nodes[0].id,{x:NaN,y:Infinity});}catch{}
 assert.deepEqual(S.getVectorSession().doc,before);
 assert.ok(importSvg(S.toSvg()).doc.paths.length);
});
