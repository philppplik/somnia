import test from 'node:test';
import assert from 'node:assert/strict';
import {uvIslands,unwrapBox,planarProject,seamsAround,remapSeams,unfoldAngles,packUv,gridUv} from './uvUnwrap';
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

// unwelded box: 24 corners, 6 quads, every face owns its vertices (like three's BoxGeometry)
function boxUnwelded():MeshData{
 const positions:number[]=[];const index:number[]=[];
 const quad=(a:[number,number,number],b:[number,number,number],c:[number,number,number],d:[number,number,number])=>{
  const base=positions.length/3;positions.push(...a,...b,...c,...d);index.push(base,base+1,base+2,base,base+2,base+3);
 };
 quad([.5,.5,.5],[.5,.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]); // +x
 quad([-.5,.5,-.5],[-.5,.5,.5],[-.5,-.5,.5],[-.5,-.5,-.5]); // -x
 quad([-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]); // +y
 quad([-.5,-.5,.5],[.5,-.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5]); // -y
 quad([-.5,.5,.5],[.5,.5,.5],[.5,-.5,.5],[-.5,-.5,.5]); // +z
 quad([.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,-.5],[.5,-.5,-.5]); // -z
 return{positions,index};
}
const topSeamsBox=(m:MeshData):[number,number][]=>{
 // the +y face is triangles 4,5 (verts 8..11): its four border edges, all coincident copies (as uvSeamMark stores them)
 return seamsAround(m,[[8,9],[9,10],[10,11],[11,8]]);
};
const uvEdgeLen=(r:{uv:[number,number][];uvIndex:number[]},k1:number,k2:number)=>{
 const[a,b]=[r.uv[r.uvIndex[k1]],r.uv[r.uvIndex[k2]]];
 return Math.hypot(a[0]-b[0],a[1]-b[1]);
};

test('unfoldAngles keeps the exact 3D angles inside an island',()=>{
 const m=boxUnwelded();
 const r=unfoldAngles(m,topSeamsBox(m));
 assert.equal(Math.max(...r.islands)+1,2);
 assert.equal(r.uvIndex.length,m.index.length);
 assert.ok(r.uvIndex.every(i=>i>=0));
 assert.ok(r.uv.every(([u,v])=>Number.isFinite(u)&&Number.isFinite(v)));
 // the top island (triangles 4,5) is laid out angle-exact: uv edge lengths match 3D up to one uniform layout scale
 const len3=(a:number,b:number)=>Math.hypot(m.positions[a*3]-m.positions[b*3],m.positions[a*3+1]-m.positions[b*3+1],m.positions[a*3+2]-m.positions[b*3+2]);
 const ratios:number[]=[];
 for(const f of[4,5])for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  ratios.push(uvEdgeLen(r,f*3+e,f*3+(e+1)%3)/len3(a,b));
 }
 for(const q of ratios)assert.ok(Math.abs(q-ratios[0])<1e-9,`ratio ${q} vs ${ratios[0]}`);
 assert.ok(ratios[0]>0);
});

test('unfoldAngles unfolds a whole unwelded box into one connected island',()=>{
 const m=boxUnwelded();
 const r=unfoldAngles(m,[]);
 assert.equal(Math.max(...r.islands)+1,1);
 assert.equal(r.uv.length,24,'every unwelded corner keeps its own slot');
 assert.ok(r.uv.every(([u,v])=>Number.isFinite(u)&&Number.isFinite(v)));
 // along the BFS tree the unfolding is angle-exact; the layout is finite and non-degenerate
 const us=r.uv.map(([u])=>u),vs=r.uv.map(([,v])=>v);
 assert.ok(Math.max(...us)-Math.min(...us)>0.5&&Math.max(...vs)-Math.min(...vs)>0.5,'the cross layout spans real area');
});

test('packUv lays islands out non-overlapping with padding inside 0..1',()=>{
 const m=boxUnwelded();
 const raw=unwrapBox(m,topSeamsBox(m));
 const r=packUv(raw,0.05);
 assert.ok(r.uv.every(([u,v])=>u>=0&&u<=1&&v>=0&&v<=1),JSON.stringify(r.uv));
 // per-island bounding boxes are disjoint with a positive gap
 const boxes=[0,1].map(ii=>{
  const slots=new Set<number>();for(let f=0;f<r.islands.length;f++)if(r.islands[f]===ii)for(let e=0;e<3;e++)slots.add(r.uvIndex[f*3+e]);
  let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
  for(const i of slots){const[u,v]=r.uv[i];mnu=Math.min(mnu,u);mnv=Math.min(mnv,v);mxu=Math.max(mxu,u);mxv=Math.max(mxv,v);}
  return{mnu,mnv,mxu,mxv};
 });
 const[a,b]=boxes;
 const gapX=Math.max(a.mnu-b.mxu,b.mnu-a.mxu),gapY=Math.max(a.mnv-b.mxv,b.mnv-a.mxv);
 assert.ok(gapX>0||gapY>0,`islands overlap: ${JSON.stringify(boxes)}`);
});

test('pack layout differs from the grid layout and stays in 0..1',()=>{
 const m=boxUnwelded();
 const grid=gridUv(unwrapBox(m,topSeamsBox(m)));
 const packed=unwrapBox(m,topSeamsBox(m),{pack:true,padding:0.02});
 assert.notDeepEqual(packed.uv,grid.uv);
 assert.ok(packed.uv.every(([u,v])=>u>=0&&u<=1&&v>=0&&v<=1));
});
