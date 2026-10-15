import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {gridFillSelected,EditError,type MeshData} from './editMesh';

// 5x5 planar lattice, the central 2x2 quads removed: an 8-edge hole around the middle.
const lattice=():MeshData=>{
 const positions:number[]=[];
 for(let z=0;z<5;z++)for(let x=0;x<5;x++)positions.push(x-2,0,z-2);
 const id=(x:number,z:number)=>z*5+x;
 const index:number[]=[];
 for(let z=0;z<4;z++)for(let x=0;x<4;x++){
  if(x>=1&&x<=2&&z>=1&&z<=2)continue;
  index.push(id(x,z),id(x+1,z),id(x+1,z+1),id(x,z),id(x+1,z+1),id(x,z+1));
 }
 return {positions,index};
};
const holeEdges=():[number,number][]=>{
 const id=(x:number,z:number)=>z*5+x;
 return [[id(1,1),id(2,1)],[id(2,1),id(3,1)],[id(3,1),id(3,2)],[id(3,2),id(3,3)],[id(3,3),id(2,3)],[id(2,3),id(1,3)],[id(1,3),id(1,2)],[id(1,2),id(1,1)]];
};

test('editMesh gridFillSelected: an even hole gets an interpolated grid with one interior point',()=>{
 const m=lattice();
 const out=gridFillSelected(m,holeEdges());
 assert.equal(out.positions.length/3,26,'one interior vertex');
 assert.equal(out.index.length/3,32,'eight grid triangles close the hole');
 assert.deepEqual(out.positions.slice(-3).map(v=>Math.round(v*1e6)/1e6),[0,0,0],'interior point interpolates to the centre');
});

test('editMesh gridFillSelected: winding opposes the surrounding faces',()=>{
 const m=lattice();
 const out=gridFillSelected(m,holeEdges());
 const n=out.index.length;
 const nyOf=(idx:number[],p:number[],t:number)=>{const a=idx[t*3],b=idx[t*3+1],c=idx[t*3+2];const ux=p[b*3]-p[a*3],uz=p[b*3+2]-p[a*3+2];const vx=p[c*3]-p[a*3],vz=p[c*3+2]-p[a*3+2];return uz*vx-ux*vz;};
 const capNy=nyOf(out.index,out.positions,out.index.length/3-1);
 const latticeNy=nyOf(m.index,m.positions,0);
 assert.ok(Math.sign(capNy)===Math.sign(latticeNy)&&capNy!==0,'caps wind like the lattice');
});

test('editMesh gridFillSelected: odd and open loops are refused',()=>{
 const m=lattice();
 assert.throws(()=>gridFillSelected(m,[]),/Select an edge loop to grid-fill/);
 assert.throws(()=>gridFillSelected(m,holeEdges().slice(0,5)),/Select one closed edge loop/);
 const tri:MeshData={positions:[0,0,0, 1,0,0, 0,0,1, 2,0,2],index:[0,1,2]};
 assert.throws(()=>gridFillSelected(tri,[[0,1],[1,2],[2,0]]),/even number of edges/);
});

test('stage editGridFill: a deleted cube side closes as two triangles, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDelete('face');
 assert.equal(o.geometry.getIndex()!.array.length/3,10,'the quad side is gone');
 st.editSelect('edge',[[8,10],[8,9],[10,11],[9,11]]);
 st.editGridFill();
 assert.equal(o.geometry.getIndex()!.array.length/3,12,'the quad closes as two triangles, no centroid');
 assert.equal(o.geometry.getAttribute('position').array.length/3,24,'no extra vertices for a quad');
 const idx=[...o.geometry.getIndex()!.array] as number[];
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 const a=idx[idx.length-6],b=idx[idx.length-5],c=idx[idx.length-4];
 const ux=pos[b*3]-pos[a*3],uy=pos[b*3+1]-pos[a*3+1],uz=pos[b*3+2]-pos[a*3+2];
 const vx=pos[c*3]-pos[a*3],vy=pos[c*3+1]-pos[a*3+1],vz=pos[c*3+2]-pos[a*3+2];
 assert.ok(uz*vx-ux*vz>0,'the cap winds outwards');
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,10,'undo reopens the hole');
});

test('stage editGridFill: a triangular hole stays for the fan fill',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4]);
 st.editDelete('face');
 st.editSelect('edge',[[8,10],[8,9],[9,10]]);
 assert.throws(()=>st.editGridFill(),/even number of edges/);
 st.editFill();
 assert.equal(o.geometry.getIndex()!.array.length/3,14,'fan fill still handles the odd loop');
});
