import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {vectorCommandSpecs} from './commands';
import {CommandDispatcher,CommandDispatchError} from '../commandDispatcher';
import * as S from './session';
import {rectPath} from './shapes';
import {flatten} from './geometry';
import {roundCorners,roundPathCorners} from './roundCorners';
const commands=[...vectorCommandSpecs(()=>true),...vectorShellCommandSpecs(()=>true)];
const area=(c:{x:number;y:number}[])=>{let s=0;for(let i=0;i<c.length;i++){const a=c[i],b=c[(i+1)%c.length];s+=a.x*b.y-b.x*a.y;}return Math.abs(s/2);};

test('round corners: rectangle loses (4-pi) r^2, one undo step, errors leave the document unchanged',async()=>{
 S.resetVectorSession();S.createBlankVector();S.addPath(rectPath({x:10,y:10,w:100,h:60}),true);
 const d=new CommandDispatcher();commands.forEach(s=>d.register(s));const before=structuredClone(S.getVectorSession().doc),id=before.paths[0].id;
 await assert.rejects(d.runCommand('vector.roundCorners',{radius:5},{origin:'agent'}),e=>e instanceof CommandDispatchError&&e.code==='forbidden-origin');
 for(const bad of [0,-1,1001])await assert.rejects(d.runCommand('vector.roundCorners',{radius:bad},{origin:'test'}));
 await assert.rejects(d.runCommand('vector.roundCorners',{},{origin:'test'}),e=>e instanceof CommandDispatchError&&e.code==='invalid-params');
 assert.deepEqual(S.getVectorSession().doc,before);
 await d.runCommand('vector.roundCorners',{radius:10},{origin:'test'});
 const p=S.getVectorSession().doc.paths[0];assert.equal(p.nodes.length,8);
 const expected=100*60-(4-Math.PI)*100;assert.ok(Math.abs(area(flatten(p,64))-expected)<0.1,String(area(flatten(p,64))-expected));
 // already rounded: nothing left to round
 await assert.rejects(d.runCommand('vector.roundCorners',{radius:10},{origin:'test'}),/No straight corners/);
 S.undo();assert.deepEqual(S.getVectorSession().doc,before);
 void id;
});
test('round corners: radius is cut to half of the shortest side, nodes subset, open ends and curves are left alone',()=>{
 const sq=rectPath({x:0,y:0,w:20,h:20});
 const big=roundPathCorners(sq,1000).path;assert.equal(big.nodes.length,8);
 const xs=big.nodes.map(n=>n.x);assert.ok(Math.min(...xs)>=-1e-9&&Math.max(...xs)<=20+1e-9);
 const first=sq.nodes[0].id,one=roundPathCorners(sq,3,new Set([first]));assert.equal(one.rounded,1);assert.equal(one.path.nodes.length,5);
 const open={...sq,closed:false};assert.equal(roundPathCorners(open,3).rounded,2); // interior nodes only
 const curved={...sq,nodes:sq.nodes.map((n,i)=>i===1?{...n,out:{x:n.x+3,y:n.y}}:n)};
 assert.equal(roundPathCorners(curved,3).rounded,2); // nodes 0 and 3; 1 and 2 touch the curved segment
 const collinear={...sq,nodes:[{id:'a',x:0,y:0,kind:'corner' as const},{id:'b',x:5,y:0,kind:'corner' as const},{id:'c',x:10,y:0,kind:'corner' as const},{id:'d',x:10,y:10,kind:'corner' as const}]};
 assert.equal(roundPathCorners(collinear,2).rounded,3); // a, c, d (b is straight through)
 assert.throws(()=>roundCorners({width:1,height:1,paths:[sq]},[],3),/Select at least one/);
 assert.equal(roundPathCorners({...sq,nodes:sq.nodes.slice(0,2)},3).rounded,0);
});
