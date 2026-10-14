import test from 'node:test';
import assert from 'node:assert/strict';
import {uvIslands,unwrapBox,planarProject,seamsAround,remapSeams} from './uvUnwrap';
import {UvError} from './uv';
import type {MeshData} from './editMesh';

// unit cube, 8 welded corners, 12 triangles (same rig as editMesh tests)
function cube():MeshData{
 const p:number[]=[];
 for(const x of[-0.5,0.5])for(const y of[-0.5,0.5])for(const z of[-0.5,0.5])p.push(x,y,z);
 const v=(x:number,y:number,z:number)=>((x+0.5)*4+(y+0.5)*2+(z+0.5));
 const quad=(a:number,b:number,c:number,d:number)=>[a,b,c,a,c,d];
 const index:number[]=[
  ...quad(v(.5,-.5,-.5),v(.5,.5,-.5),v(.5,.5,.5),v(.5,-.5,.5)),
  ...quad(v(-.5,-.5,.5),v(-.5,.5,.5),v(-.5,.5,-.5),v(-.5,-.5,-.5)),
  ...quad(v(-.5,.5,-.5),v(-.5,.5,.5),v(.5,.5,.5),v(.5,.5,-.5)),
  ...quad(v(-.5,-.5,.5),v(-.5,-.5,-.5),v(.5,-.5,-.5),v(.5,-.5,.5)),
  ...quad(v(-.5,-.5,.5),v(.5,-.5,.5),v(.5,.5,.5),v(-.5,.5,.5)),
  ...quad(v(.5,-.5,-.5),v(-.5,-.5,-.5),v(-.5,.5,-.5),v(.5,.5,-.5)),
 ];
 return{positions:p,index};
}
const edgeBetween=(m:MeshData,pa:[number,number,number],pb:[number,number,number]):[number,number]=>{
 const find=(q:[number,number,number])=>{for(let i=0;i<m.positions.length/3;i++)if(Math.abs(m.positions[i*3]-q[0])<1e-9&&Math.abs(m.positions[i*3+1]-q[1])<1e-9&&Math.abs(m.positions[i*3+2]-q[2])<1e-9)return i;throw new Error('no vert');};
 return[find(pa),find(pb)];
};
const topSeams=(m:MeshData):[number,number][]=>[edgeBetween(m,[-.5,.5,-.5],[-.5,.5,.5]),edgeBetween(m,[-.5,.5,.5],[.5,.5,.5]),edgeBetween(m,[.5,.5,.5],[.5,.5,-.5]),edgeBetween(m,[.5,.5,-.5],[-.5,.5,-.5])];

test('a welded cube without seams is one island',()=>{
 const islands=uvIslands(cube(),[]);
 assert.equal(Math.max(...islands)+1,1);
});

test('seams around the top face split it into its own island',()=>{
 const m=cube();
 const islands=uvIslands(m,topSeams(m));
 assert.equal(Math.max(...islands)+1,2);
});

test('unwrapBox gives every face corner a uv inside 0..1 and splits islands apart',()=>{
 const m=cube();
 const r=unwrapBox(m,topSeams(m));
 assert.equal(r.uvIndex.length,m.index.length);
 assert.ok(r.uvIndex.every(i=>i>=0));
 assert.ok(r.uv.every(([u,v])=>u>=0&&u<=1&&v>=0&&v<=1),JSON.stringify(r.uv.slice(0,4)));
 assert.equal(Math.max(...r.islands)+1,2);
 // two islands land in different grid cells: top-face uvs are separated from the rest
 const topFaceCorners=[4*3,4*3+1,4*3+2,5*3,5*3+1,5*3+2].map(k=>r.uv[r.uvIndex[k]]);
 const other=r.uv.filter((_,i)=>![4*3,4*3+1,4*3+2,5*3,5*3+1,5*3+2].map(k=>r.uvIndex[k]).includes(i));
 const sep=topFaceCorners.every(([u])=>u<0.5)!==other.every(([u])=>u<0.5)||topFaceCorners.every(([,v])=>v<0.5)!==other.every(([,v])=>v<0.5);
 assert.ok(sep,'islands occupy different cells');
});

test('planarProject normalizes to 0..1 and keeps welded vertices shared',()=>{
 const m=cube();
 const r=planarProject(m,'z');
 assert.ok(r.uv.every(([u,v])=>u>=0&&u<=1&&v>=0&&v<=1));
 assert.equal(r.uv.length,8); // welded cube: one uv per vertex
 assert.throws(()=>planarProject({positions:[],index:[]},'x'),UvError);
});

test('seamsAround finds geometrically matching edges on unwelded meshes',()=>{
 // unwelded quad: two triangles with duplicated corners
 const m:MeshData={positions:[0,0,0, 1,0,0, 1,1,0, 0,0,0, 1,1,0, 0,1,0],index:[0,1,2, 3,4,5]};
 const found=seamsAround(m,[[1,2]]);
 assert.equal(found.length,1);
 assert.deepEqual(found[0],[1,2]);
 // a degenerate query matches nothing
 assert.equal(seamsAround(m,[[0,3]]).length,0); // (0,0,0)-(0,0,0): no such edge
 assert.equal(seamsAround(m,[[2,4]]).length,0); // (1,1,0)-(1,1,0): no such edge
 const diag=seamsAround(m,[[0,4]]); // (0,0,0)-(1,1,0): the quad diagonal
 assert.equal(diag.length,2); // found in both triangle copies, geometrically matched
 assert.deepEqual(diag,[[0,2],[3,4]]);
});

test('remapSeams keeps seams across a vertex split and drops edges that vanished',()=>{
 const m=cube();
 const seams=topSeams(m);
 const r=unwrapBox(m,seams);
 // expand positions per uv slot, like the stage does when applying an unwrap
 const slotVert=new Array<number>(r.uv.length);
 for(let k=0;k<r.uvIndex.length;k++)slotVert[r.uvIndex[k]]=m.index[k];
 const np:number[]=[];for(const v of slotVert)np.push(m.positions[v*3],m.positions[v*3+1],m.positions[v*3+2]);
 const split:MeshData={positions:np,index:r.uvIndex};
 const kept=remapSeams(m,seams,split);
 assert.equal(kept.length,8); // each of the 4 top edges exists in both island copies
 // a second unwrap with the remapped seams still splits the top face off
 const again=uvIslands(split,kept);
 assert.equal(Math.max(...again)+1,2);
 // edges that no longer exist geometrically drop out
 const moved:MeshData={positions:m.positions.map((x,i)=>i%3===1?x+2:x),index:m.index};
 assert.equal(remapSeams(m,seams,moved).length,0);
});
