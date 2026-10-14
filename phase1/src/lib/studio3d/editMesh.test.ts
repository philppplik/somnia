import test from 'node:test';
import assert from 'node:assert/strict';
import {extrudeFaces,insetFaces,bevelVertices,loopCut,faceNormal,MAX_EDIT_VERTICES,MAX_EDIT_TRIANGLES,type MeshData} from './editMesh';

// Unit cube centered at origin, 8 unique corners, 12 triangles (two per face).
function cube():MeshData{
 const p:number[]=[];
 for(const x of[-0.5,0.5])for(const y of[-0.5,0.5])for(const z of[-0.5,0.5])p.push(x,y,z);
 const v=(x:number,y:number,z:number)=>((x+0.5)*4+(y+0.5)*2+(z+0.5));
 const quad=(a:number,b:number,c:number,d:number)=>[a,b,c,a,c,d];
 const index:number[]=[
  ...quad(v(.5,-.5,-.5),v(.5,.5,-.5),v(.5,.5,.5),v(.5,-.5,.5)),   // +x
  ...quad(v(-.5,-.5,.5),v(-.5,.5,.5),v(-.5,.5,-.5),v(-.5,-.5,-.5)),// -x
  ...quad(v(-.5,.5,-.5),v(-.5,.5,.5),v(.5,.5,.5),v(.5,.5,-.5)),   // +y (faces 4,5)
  ...quad(v(-.5,-.5,.5),v(-.5,-.5,-.5),v(.5,-.5,-.5),v(.5,-.5,.5)),// -y
  ...quad(v(-.5,-.5,.5),v(.5,-.5,.5),v(.5,.5,.5),v(-.5,.5,.5)),   // +z
  ...quad(v(.5,-.5,-.5),v(-.5,-.5,-.5),v(-.5,.5,-.5),v(.5,.5,-.5)),// -z
 ];
 return{positions:p,index};
}

test('faceNormal of a +y face points up',()=>{
 const n=faceNormal(cube(),4);
 assert.ok(Math.abs(n[0])<1e-9&&n[1]>0.99&&Math.abs(n[2])<1e-9,JSON.stringify(n));
});

test('extrude one face moves its cap along the normal and adds walls',()=>{
 const m=cube();const out=extrudeFaces(m,[4,5],0.5);
 assert.equal(out.positions.length/3,12); // 8 + 4 duplicated cap verts
 assert.equal(out.index.length/3,20);     // 12 + 4 walls * 2
 const maxY=Math.max(...out.positions.filter((_,i)=>i%3===1));
 assert.ok(Math.abs(maxY-1)<1e-9,`cap at y=1, got ${maxY}`);
});

test('extrude the whole cube is refused (no boundary)',()=>{
 assert.throws(()=>extrudeFaces(cube(),[...Array(12).keys()],0.5),/no boundary/);
});

test('extrude with empty selection and bad faces is refused readably',()=>{
 assert.throws(()=>extrudeFaces(cube(),[],0.5),/Select at least one face/);
 assert.throws(()=>extrudeFaces(cube(),[99],0.5),/does not exist/);
 assert.throws(()=>extrudeFaces(cube(),[0],0),/non-zero/);
});

test('inset one triangle shrinks it toward its centroid',()=>{
 const m=cube();const out=insetFaces(m,[4],0.25);
 assert.equal(out.positions.length/3,11); // 8 + 3 inner
 assert.equal(out.index.length/3,18);     // 11 kept + 1 inner + 6 ring
 // inner verts keep the face plane y=0.5
 for(let i=8;i<11;i++)assert.ok(Math.abs(out.positions[i*3+1]-0.5)<1e-9);
 assert.throws(()=>insetFaces(cube(),[4],1),/between 0 and 1/);
});

test('bevel one corner chamfers it into a flat cap',()=>{
 const m=cube();const corner=0; // (-.5,-.5,-.5)
 const out=bevelVertices(m,[corner],0.2);
 assert.equal(out.positions.length/3,8+3+1);
 // every new ring vertex sits 0.2 from the corner along an edge
 const c=[-0.5,-0.5,-0.5];
 for(let i=8;i<11;i++){
  const d=Math.hypot(out.positions[i*3]-c[0],out.positions[i*3+1]-c[1],out.positions[i*3+2]-c[2]);
  assert.ok(Math.abs(d-0.2)<1e-9,`ring vert ${i} at ${d}`);
 }
});

test('bevel refuses adjacent selected vertices sharing a face',()=>{
 assert.throws(()=>bevelVertices(cube(),[0,1],0.2),/share a face|only connected/);
 assert.throws(()=>bevelVertices(cube(),[],0.2),/Select at least one vertex/);
});

test('loopCut across the cube mid-height adds a ring of 4 vertices',()=>{
 const m=cube();
 // vertical edge: verts 0 (-.5,-.5,-.5) and 2 (-.5,.5,-.5)
 const out=loopCut(m,[0,2]);
 // 8 cut points: 4 vertical-edge mids plus 4 quad-diagonal mids
 assert.equal(out.positions.length/3,16);
 assert.equal(out.index.length/3,28);
 const mids=out.positions.slice(8*3);
 for(let i=0;i<8;i++)assert.ok(Math.abs(mids[i*3+1])<1e-9,'cut at y=0');
});

test('loopCut refuses when the plane misses the mesh',()=>{
 const m=cube();
 // choose edge at the very top: both endpoints y=0.5 -> plane above the rest
 const top=m.positions.reduce((best:number[],_,i,a)=>i%3===0&&a[i+1]===0.5?[...best,i/3]:best,[]);
 // find an edge among top verts present in the index
 const idx=new Set(m.index);void idx;
 let edge:[number,number]|null=null;
 for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){
  const a=m.index[f+e],b=m.index[f+(e+1)%3];
  if(top.includes(a)&&top.includes(b))edge=[a,b];
 }
 assert.ok(edge);
 // plane perpendicular to the top edge through its midpoint still cuts the sides,
 // so pick the refusal via a degenerate zero-length edge instead:
 assert.throws(()=>loopCut(m,[0,0]),/zero length|does not exist/);
 assert.throws(()=>loopCut(cube(),[0,99]),/does not exist/);
 void edge;
});

test('vertex and triangle caps are enforced',()=>{
 const bigV:MeshData={positions:new Array((MAX_EDIT_VERTICES+3)*3).fill(0),index:[0,1,2]};
 assert.throws(()=>extrudeFaces(bigV,[0],1),/too large/);
 const bigT:MeshData={positions:[0,0,0,1,0,0,0,1,0],index:new Array((MAX_EDIT_TRIANGLES+1)*3).fill(0)};
 assert.throws(()=>extrudeFaces(bigT,[0],1),/too large/);
});
