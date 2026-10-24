import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {exportSvg,importSvg,normalizeDoc} from '../vectorio';
import {layerRows} from './layerRows';
import {toggleLock} from './lock';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const mk=()=>{S.resetVectorSession();S.createBlankVector();const a=rectPath({x:0,y:0,w:10,h:10}),b=rectPath({x:20,y:0,w:10,h:10});S.addPath(a,true);S.addPath(b,false);return [a.id,b.id] as const;};

test('lock: locked path cannot be selected or moved, one undo step, agent refused, bad ids rejected',async()=>{
 const [a,b]=mk();const d=new CommandDispatcher();commands.forEach(s=>d.register(s));
 await assert.rejects(d.runCommand('vector.toggleLocked',{id:a},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 for(const bad of [{},{id:''},{id:'x'.repeat(81)},{id:5},{id:'nope'}])await assert.rejects(d.runCommand('vector.toggleLocked',bad,{origin:'test'}));
 await d.runCommand('vector.toggleLocked',{id:a},{origin:'test'});
 const doc=S.getVectorSession().doc;assert.equal(doc.paths.find(p=>p.id===a)?.locked,true);assert.equal(doc.paths.find(p=>p.id===b)?.locked,undefined);
 assert.deepEqual(S.getVectorSession().selection,[]);
 S.select([a,b]);assert.deepEqual(S.getVectorSession().selection,[b]);
 const before=structuredClone(S.getVectorSession().doc.paths.find(p=>p.id===a));S.moveSelection(5,5);
 assert.deepEqual(S.getVectorSession().doc.paths.find(p=>p.id===a),before);
 await d.runCommand('vector.toggleLocked',{id:a},{origin:'test'});assert.equal(S.getVectorSession().doc.paths.find(p=>p.id===a)?.locked,undefined);
 S.undo();assert.equal(S.getVectorSession().doc.paths.find(p=>p.id===a)?.locked,true);
});
test('lock: SVG roundtrip keeps the flag, files without it are unchanged',()=>{
 const [a]=mk();const doc0=S.getVectorSession().doc;const plain=exportSvg(doc0);assert.ok(!plain.includes('data-vs-locked'));
 const doc=toggleLock(doc0,a),svg=exportSvg(doc);assert.ok(svg.includes('data-vs-locked="1"'));
 const back=importSvg(svg);assert.deepEqual(back.doc.paths.map(p=>!!p.locked),[true,false]);
 assert.equal(exportSvg(normalizeDoc(back.doc)),svg);
 assert.equal(importSvg(svg.replace('data-vs-locked="1"','data-vs-locked="yes"')).doc.paths[0].locked,undefined);
});
test('lock: toggling a group locks every member, layerRows flags it',()=>{
 const doc={width:50,height:50,paths:[{...rectPath({x:0,y:0,w:5,h:5}),group:'g1'},{...rectPath({x:9,y:0,w:5,h:5}),group:'g1'},rectPath({x:30,y:0,w:5,h:5})]} as any;
 const l=toggleLock(doc,doc.paths[0].id);assert.deepEqual(l.paths.map((p:any)=>!!p.locked),[true,true,false]);
 const g=layerRows(l.paths,()=>true).find(r=>r.kind==='group') as any;assert.equal(g.locked,true);
 assert.deepEqual(toggleLock(l,doc.paths[1].id).paths.map((p:any)=>!!p.locked),[false,false,false]);
 assert.throws(()=>toggleLock(doc,'zz'),/Unknown path/);
});
