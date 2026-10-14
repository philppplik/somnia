/** UV unwrap tools on plain mesh data - no three.js, a leaf module: seam-aware box unwrap, planar projection, island detection. Texture UV transforms live in uv.ts. */
import type {MeshData} from './editMesh';
import {UvError} from './uv';
export type Uv=[number,number];
const EPS=1e-6;
const v3=(m:MeshData,i:number):[number,number,number]=>[m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]];
const norm=(a:[number,number,number]):[number,number,number]=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};
const faceNormal=(m:MeshData,f:number):[number,number,number]=>{
 const[a,b,c]=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
 const u=[m.positions[b*3]-m.positions[a*3],m.positions[b*3+1]-m.positions[a*3+1],m.positions[b*3+2]-m.positions[a*3+2]];
 const v=[m.positions[c*3]-m.positions[a*3],m.positions[c*3+1]-m.positions[a*3+1],m.positions[c*3+2]-m.positions[a*3+2]];
 return norm([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]);
};
const ekey=(a:number,b:number)=>a<b?`${a}_${b}`:`${b}_${a}`;
const geoKey=(p:[number,number,number])=>p.map(x=>Math.round(x/EPS*1e-3)/1e-3).join(',');
const check=(m:MeshData)=>{
 if(!m.positions.length||!m.index.length||m.positions.some(n=>!Number.isFinite(n)))throw new UvError('The mesh data is damaged.');
};
/** Splits the mesh into UV islands: face groups connected across edges that are NOT seams. */
export function uvIslands(m:MeshData,seams:[number,number][]):number[]{
 check(m);
 const seam=new Set(seams.map(e=>ekey(e[0],e[1])));
 const nf=m.index.length/3;
 // face adjacency across non-seam edges, matched geometrically so unwelded meshes work
 const edgeFaces=new Map<string,number[]>();
 for(let f=0;f<nf;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  const pa=geoKey(v3(m,a)),pb=geoKey(v3(m,b));
  const gk=pa<pb?`${pa}|${pb}`:`${pb}|${pa}`;
  const arr=edgeFaces.get(gk);if(arr)arr.push(f);else edgeFaces.set(gk,[f]);
 }
 const island=new Array<number>(nf).fill(-1);
 let count=0;
 for(let f0=0;f0<nf;f0++){
  if(island[f0]>=0)continue;
  const stack=[f0];island[f0]=count;
  while(stack.length){
   const f=stack.pop()!;
   for(let e=0;e<3;e++){
    const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
    if(seam.has(ekey(a,b)))continue;
    const pa=geoKey(v3(m,a)),pb=geoKey(v3(m,b));
    const gk=pa<pb?`${pa}|${pb}`:`${pb}|${pa}`;
    for(const g of edgeFaces.get(gk)??[])if(island[g]<0){island[g]=count;stack.push(g);}
   }
  }
  count++;
 }
 return island;
}
/** Projects one island onto the plane of its dominant average normal. */
const project=(m:MeshData,faces:number[],islandIdx:number):Map<string,Uv>=>{
 let nx=0,ny=0,nz=0;
 for(const f of faces){const n=faceNormal(m,f);nx+=Math.abs(n[0]);ny+=Math.abs(n[1]);nz+=Math.abs(n[2]);}
 const drop=nx>=ny&&nx>=nz?0:ny>=nz?1:2;
 const vertUv=new Map<string,Uv>();
 for(const f of faces)for(let e=0;e<3;e++){
  const v=m.index[f*3+e];const p=v3(m,v);
  const uv:Uv=drop===0?[p[1],p[2]]:drop===1?[p[0],p[2]]:[p[0],p[1]];
  vertUv.set(`${v}_${islandIdx}`,uv);
 }
 return vertUv;
};
export interface UvResult{uv:Uv[];/** Per face-corner index (index.length entries) into uv. */uvIndex:number[];islands:number[];vertCount:number;}
/** Seam-aware box unwrap: every island gets the planar projection of its dominant axis, scaled into its own cell of a square 0..1 grid. */
export function unwrapBox(m:MeshData,seams:[number,number][]):UvResult{
 check(m);
 const islands=uvIslands(m,seams);
 const islandCount=Math.max(...islands)+1;
 const byIsland:number[][]=Array.from({length:islandCount},()=>[]);
 for(let f=0;f<islands.length;f++)byIsland[islands[f]].push(f);
 const uv:Uv[]=[];const uvIndex=new Array<number>(m.index.length).fill(-1);
 const cols=Math.ceil(Math.sqrt(islandCount));
 byIsland.forEach((faces,ii)=>{
  const vertUv=project(m,faces,ii);
  // normalize the island into [0.05..0.95] of its grid cell
  let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
  for(const[u,v]of vertUv.values()){mnu=Math.min(mnu,u);mnv=Math.min(mnv,v);mxu=Math.max(mxu,u);mxv=Math.max(mxv,v);}
  const su=(mxu-mnu)||1,sv=(mxv-mnv)||1;const s=0.9/Math.max(su,sv);
  const col=ii%cols,row=Math.floor(ii/cols);
  const local=new Map<string,number>();
  for(const f of faces)for(let e=0;e<3;e++){
   const v=m.index[f*3+e];const kk=`${v}_${ii}`;
   let slot=local.get(kk);
   if(slot===undefined){
    const[u,vv]=vertUv.get(kk)!;
    slot=uv.length;uv.push([col/cols+0.05/cols+(u-mnu)*s/cols,row/cols+0.05/cols+(vv-mnv)*s/cols]);
    local.set(kk,slot);
   }
   uvIndex[f*3+e]=slot;
  }
 });
 return{uv,uvIndex,islands,vertCount:m.positions.length/3};
}
/** Planar projection of the whole mesh along one axis, normalized to 0..1. */
export function planarProject(m:MeshData,axis:'x'|'y'|'z'):UvResult{
 check(m);
 const drop=axis==='x'?0:axis==='y'?1:2;
 const uv:Uv[]=[];const uvIndex=new Array<number>(m.index.length).fill(-1);
 const seen=new Map<number,number>();
 let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
 const raw:Uv[]=[];
 for(let i=0;i<m.positions.length/3;i++){
  const p=v3(m,i);const c:Uv=drop===0?[p[1],p[2]]:drop===1?[p[0],p[2]]:[p[0],p[1]];
  raw.push(c);mnu=Math.min(mnu,c[0]);mnv=Math.min(mnv,c[1]);mxu=Math.max(mxu,c[0]);mxv=Math.max(mxv,c[1]);
 }
 const su=(mxu-mnu)||1,sv=(mxv-mnv)||1;
 for(let k=0;k<m.index.length;k++){
  const v=m.index[k];let slot=seen.get(v);
  if(slot===undefined){slot=uv.length;seen.set(v,slot);uv.push([(raw[v][0]-mnu)/su,(raw[v][1]-mnv)/sv]);}
  uvIndex[k]=slot;
 }
 return{uv,uvIndex,islands:uvIslands(m,[]),vertCount:m.positions.length/3};
}
/** Geometric edge lookup: every mesh edge whose endpoints coincide with a query segment, so unwelded copies all match. */
const matchPts=(m:MeshData,pts:[number,number,number][]):[number,number][]=>{
 const out=new Map<string,[number,number]>();
 for(let f=0;f<m.index.length/3;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  const pa=v3(m,a),pb=v3(m,b);
  for(let k=0;k<pts.length;k+=2){
   const qa=pts[k],qb=pts[k+1];
   const match=(Math.abs(pa[0]-qa[0])<1e-6&&Math.abs(pa[1]-qa[1])<1e-6&&Math.abs(pa[2]-qa[2])<1e-6&&Math.abs(pb[0]-qb[0])<1e-6&&Math.abs(pb[1]-qb[1])<1e-6&&Math.abs(pb[2]-qb[2])<1e-6)
    ||(Math.abs(pa[0]-qb[0])<1e-6&&Math.abs(pa[1]-qb[1])<1e-6&&Math.abs(pa[2]-qb[2])<1e-6&&Math.abs(pb[0]-qa[0])<1e-6&&Math.abs(pb[1]-qa[1])<1e-6&&Math.abs(pb[2]-qa[2])<1e-6);
   if(match)out.set(ekey(a,b),[Math.min(a,b),Math.max(a,b)]);
  }
 }
 return[...out.values()];
};
/** Seam edge lookup helper: geometric match, so unwelded meshes mark all coincident copies. */
export function seamsAround(m:MeshData,edges:[number,number][]):[number,number][]{
 check(m);
 return matchPts(m,edges.flatMap(e=>[v3(m,e[0]),v3(m,e[1])]));
}
/** Re-finds seams after a geometry rebuild that re-indexed or split vertices (edit ops, UV unwrap): edges that still exist geometrically keep their seam, the rest drop. */
export function remapSeams(from:MeshData,seams:[number,number][],to:MeshData):[number,number][]{
 check(from);check(to);
 return matchPts(to,seams.flatMap(e=>[v3(from,e[0]),v3(from,e[1])]));
}
