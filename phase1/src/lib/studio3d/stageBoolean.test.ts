import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

type Root={root:{children:{geometry?:{index?:{count:number}};name?:string}[]}};
const rootOf=(st:Stage)=>(st as unknown as Root).root;
const triCount=(st:Stage)=>{const c=rootOf(st).children[0];return (c?.geometry?.index?.count??0)/3;};
const twoCubes=(st:Stage,dx:number)=>{
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('cube');
 b.position.x=dx;b.updateMatrixWorld(true);
 return[a,b];
};

test('stage boolean: union, subtract and intersect of overlapping cubes produce single watertight meshes',()=>{
 const seen=new Set<number>();
 for(const op of ['union','subtract','intersect'] as const){
  const st=new Stage();
  const[a,b]=twoCubes(st,0.6);
  assert.equal(st.booleanOp(op,[a.id,b.id]),1);
  assert.equal(rootOf(st).children.length,1,'both originals replaced');
  const tris=triCount(st);
  assert.ok(tris>=12,`${op} produced a degenerate result (${tris} tris)`);
  if(op==='union')assert.ok(tris>24,`union re-triangulates the seam, so more than the pair (${tris} tris)`);
  seen.add(tris);
 }
 assert.equal(seen.size,3,'each op yields a different result');
});

test('stage boolean: disjoint union keeps both boxes, intersect of disjoint cubes is a clean error',()=>{
 const st=new Stage();
 const[a,b]=twoCubes(st,5);
 st.booleanOp('union',[a.id,b.id]);
 assert.equal(triCount(st),24,'disjoint union keeps all 24 triangles');
 const st2=new Stage();
 const[c,d]=twoCubes(st2,10);
 assert.throws(()=>st2.booleanOp('intersect',[c.id,d.id]),/empty/);
 assert.equal(rootOf(st2).children.length,2,'failed boolean keeps the originals');
});

test('stage boolean: undo restores both originals, validation guards hold',()=>{
 const st=new Stage();
 const[a,b]=twoCubes(st,0.6);
 st.booleanOp('subtract',[a.id,b.id]);
 assert.equal(rootOf(st).children.length,1);
 st.undo();
 assert.equal(rootOf(st).children.length,2,'one undo restores both');
 st.redo();
 assert.equal(rootOf(st).children.length,1,'redo reapplies');
 const st2=new Stage();
 const c=st2.addPrimitive('cube');
 assert.throws(()=>st2.booleanOp('union',[c.id]),/at least 2/);
 const l=st2.addLight('directional');
 assert.throws(()=>st2.booleanOp('union',[c.id,l.id]),/not a mesh/);
});
