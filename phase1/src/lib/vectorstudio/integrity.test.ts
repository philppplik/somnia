import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as S from './session';
import {hitDocument} from './geometry';
import {rectPath} from './shapes';
import {togglePathSelection} from '../../components/vectorstudio/tools/operations';
const fixture=(name:string)=>readFileSync(new URL(`../../../tests/assets/vector-studio/${name}`,import.meta.url),'utf8');
test.beforeEach(()=>S.resetVectorSession());
test('compound click, shift-toggle, drag, style, bounds and delete operate on one object',()=>{
 S.openSvgSource(fixture('compound-hole.svg'));const before=structuredClone(S.getVectorSession().doc),ids=before.paths.map(p=>p.id);
 S.select([ids[1],ids[1],'missing']);assert.deepEqual(S.getVectorSession().selection,ids);
 assert.deepEqual(togglePathSelection(before,ids,ids[0],true),[]);
 S.moveSelection(5,7);
 S.getVectorSession().doc.paths.forEach((p,i)=>p.nodes.forEach((n,j)=>{assert.equal(n.x,before.paths[i].nodes[j].x+5);assert.equal(n.y,before.paths[i].nodes[j].y+7);}));
 S.setStyle({fill:'#abcdef'},[ids[1]]);assert.ok(S.getVectorSession().doc.paths.every(p=>p.style?.fill==='#abcdef'));
 S.setSelectionBounds({x:0,y:0,w:200,h:200});assert.deepEqual(S.getVectorSession().selection,ids);
 S.deleteSelection();assert.equal(S.getVectorSession().doc.paths.length,0);S.undo();assert.equal(S.getVectorSession().doc.paths.length,2);
});
test('hide/unhide applies to an entire compound and removes hidden selection',()=>{
 S.openSvgSource(fixture('compound-hole.svg'));const ids=S.getVectorSession().doc.paths.map(p=>p.id);S.select(ids);
 S.toggleHidden(ids[1]);assert.ok(S.getVectorSession().doc.paths.every(p=>p.hidden));assert.deepEqual(S.getVectorSession().selection,[]);
 S.select(ids);assert.deepEqual(S.getVectorSession().selection,[]);S.toggleHidden(ids[0]);S.select([ids[1]]);assert.deepEqual(S.getVectorSession().selection,ids);
});
test('node tool keeps the clicked compound contour as its node target',()=>{
 S.openSvgSource(fixture('compound-hole.svg'));const ids=S.getVectorSession().doc.paths.map(p=>p.id);S.setTool('node');S.select([ids[1]]);
 assert.equal(S.getVectorSession().nodePath,ids[1]);assert.deepEqual(S.getVectorSession().selection,ids);
});
test('repeated imports and duplicates never share path/node/compound identities',()=>{
 const src=fixture('compound-hole.svg');S.openSvgSource(src);S.importSvgInto(src);S.importSvgInto(src);S.duplicateSelection(120);
 const doc=S.getVectorSession().doc;
 assert.equal(new Set(doc.paths.map(p=>p.id)).size,8);assert.equal(new Set(doc.paths.map(p=>p.compound)).size,4);
 const nodes=doc.paths.flatMap(p=>p.nodes);assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 assert.equal((S.toSvg().match(/<path /g)??[]).length,4);S.undo();assert.equal(S.getVectorSession().doc.paths.length,6);S.redo();assert.deepEqual(S.getVectorSession().doc,doc);
});
for(const invalid of [NaN,Infinity,-Infinity])test(`nonfinite input ${invalid} leaves all session state and history intact`,()=>{
 S.createBlankVector();const p=rectPath({x:0,y:0,w:10,h:10});S.addPath(p);S.moveSelection(1,1);S.undo();const before=S.getVectorSession();
 const bad=structuredClone(before.doc);bad.paths[0].nodes[0].out={x:invalid,y:0};
 const badStyle=structuredClone(before.doc);badStyle.paths[0].style={dashArray:[invalid]};
 const calls=[()=>S.moveNode(p.id,p.nodes[0].id,{x:invalid,y:0}),()=>S.moveNode(p.id,p.nodes[0].id,{x:0,y:invalid},'in'),()=>S.moveSelection(invalid,0),()=>S.duplicateSelection(invalid),()=>S.setSelectionBounds({w:invalid}),()=>S.resizePage(invalid,100),()=>S.setView(invalid),()=>S.commit(bad),()=>S.replaceDocument(badStyle),()=>S.setStyle({opacity:invalid})];
 for(const call of calls){assert.throws(call,RangeError);assert.strictEqual(S.getVectorSession(),before);}
 S.redo();assert.equal(S.getVectorSession().doc.paths[0].nodes[0].x,1);
});
test('finite arithmetic overflow is rejected at commit boundary',()=>{
 S.createBlankVector();S.addPath(rectPath({x:1e308,y:0,w:1,h:10}));const before=S.getVectorSession();
 assert.throws(()=>S.moveSelection(1e308,0),RangeError);assert.strictEqual(S.getVectorSession(),before);
});
test('document hit testing applies nonzero and evenodd winding and underlying paint order',()=>{
 const same='<svg width="100" height="100"><path d="M0 0H100V100H0Z M25 25H75V75H25Z"/></svg>';
 S.openSvgSource(same);assert.ok(hitDocument(S.getVectorSession().doc,{x:50,y:50},0));
 S.setStyle({fillRule:'evenodd'},S.getVectorSession().doc.paths.map(p=>p.id));assert.equal(hitDocument(S.getVectorSession().doc,{x:50,y:50},0),null);
 S.openSvgSource(same.replace('M25 25H75V75H25Z','M25 25V75H75V25Z'));assert.equal(hitDocument(S.getVectorSession().doc,{x:50,y:50},0),null);
 const underlying=rectPath({x:0,y:0,w:100,h:100});S.commit({...S.getVectorSession().doc,paths:[underlying,...S.getVectorSession().doc.paths]});assert.equal(hitDocument(S.getVectorSession().doc,{x:50,y:50},0),underlying.id);
 assert.throws(()=>hitDocument(S.getVectorSession().doc,{x:NaN,y:0},0),RangeError);
});
test('dirty replacement cancellation preserves name, document, selection and both history stacks',()=>{
 S.createBlankVector(100,100,'work.svg');S.addPath(rectPath({x:0,y:0,w:10,h:10}));S.moveSelection(1,1);S.undo();
 const before=S.getVectorSession(),original=Object.getOwnPropertyDescriptor(globalThis,'window');let prompts=0;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>{prompts++;return false;}}});
 try{
  assert.equal(S.createBlankVector(),false);assert.strictEqual(S.getVectorSession(),before);
  assert.equal(S.openSvgSource(fixture('compound-hole.svg'),'replacement.svg'),false);assert.strictEqual(S.getVectorSession(),before);assert.equal(prompts,2);
  assert.equal(S.openSvgSource(fixture('reject-event.svg')),false);assert.equal(prompts,2);assert.deepEqual(S.getVectorSession().doc,before.doc);assert.equal(S.getVectorSession().canRedo,true);
  Object.defineProperty(globalThis,'window',{configurable:true,value:{confirm:()=>true}});
  assert.equal(S.openSvgSource(fixture('compound-hole.svg'),'replacement.svg'),true);assert.equal(S.getVectorSession().name,'replacement.svg');assert.equal(S.getVectorSession().canUndo,false);assert.equal(S.getVectorSession().canRedo,false);
 }finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});
