import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {simplifyPath,simplifySelection} from './simplify';
import type {VectorPath} from '../vectorio';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const poly=(pts:[number,number][],closed:boolean):VectorPath=>({id:'p',closed,nodes:pts.map(([x,y],i)=>({id:'n'+i,x,y,kind:'corner' as const}))});

test('simplify: collinear and near-collinear nodes go, real corners stay',()=>{
 const r=simplifyPath(poly([[0,0],[5,0],[10,0.2],[10,10],[0,10]],true),0.5);
 assert.equal(r.removed,1);assert.equal(r.path.nodes.length,4);
 assert.ok(!r.path.nodes.some(n=>n.x===5));
 assert.equal(simplifyPath(poly([[0,0],[5,0],[10,0.2],[10,10],[0,10]],true),0.05).removed,0);
});
test('simplify: open path keeps its ends; a zig-zag below tolerance collapses to one segment',()=>{
 const r=simplifyPath(poly([[0,0],[1,0.1],[2,-0.1],[3,0.1],[4,0]],false),0.5);
 assert.deepEqual(r.path.nodes.map(n=>[n.x,n.y]),[[0,0],[4,0]]);
});
test('simplify: curves and their end nodes are untouched; closed paths never drop below 3 nodes',()=>{
 const p=poly([[0,0],[5,0],[10,0],[10,10],[0,10]],true);
 p.nodes[3]={...p.nodes[3],out:{x:8,y:12}};
 const r=simplifyPath(p,1);assert.ok(r.path.nodes.some(n=>n.id==='n3'&&n.out));assert.ok(r.path.nodes.some(n=>n.id==='n4'));
 assert.equal(simplifyPath(poly([[0,0],[1,0],[2,0]],true),5).removed,0);
 const tiny=simplifyPath(poly([[0,0],[1,0.01],[2,0],[3,0.01],[2,0.02],[1,0.01]],true),50);assert.ok(tiny.path.nodes.length>=3||tiny.removed===0);
});
test('simplify: 3000-node polyline is fast and keeps the shape within tolerance',()=>{
 const pts:[number,number][]=[];for(let i=0;i<3000;i++)pts.push([i,Math.sin(i/50)*40]);
 const r=simplifyPath(poly(pts,false),0.5);assert.ok(r.path.nodes.length<600&&r.path.nodes.length>10);
 assert.deepEqual([r.path.nodes[0].x,r.path.nodes.at(-1)!.x],[0,2999]);
});
test('simplify command: tolerance bounds, agent refused, nothing-to-do refused, one undo step',async()=>{
 S.resetVectorSession();S.createBlankVector();
 const extra=poly([[0,0],[50,0],[100,0.1],[100,100],[0,100]],true);S.addPath({...extra,id:'q1',nodes:extra.nodes.map((n,i)=>({...n,id:'qn'+i}))},true);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));const before=structuredClone(S.getVectorSession().doc);
 await assert.rejects(d.runCommand('vector.simplifyPath',{tolerance:1},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 for(const bad of [{},{tolerance:0},{tolerance:101},{tolerance:'1'}])await assert.rejects(d.runCommand('vector.simplifyPath',bad,{origin:'test'}));
 await assert.rejects(d.runCommand('vector.simplifyPath',{tolerance:0.01},{origin:'test'}),/Nothing to simplify/);
 assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.simplifyPath',{tolerance:1},{origin:'test'});assert.equal(S.getVectorSession().doc.paths[0].nodes.length,4);
 S.undo();assert.deepEqual(S.getVectorSession().doc,before);
 assert.throws(()=>simplifySelection({width:1,height:1,paths:[rectPath({x:0,y:0,w:5,h:5})]} as any,[],1),/Select at least one/);
});
