/** UV unwrap tools on plain mesh data - no three.js, a leaf module: seam-aware box unwrap, angle-based unfolding, planar projection, island detection and packing. Texture UV transforms live in uv.ts. */
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
/** Layout choice for the unwrap methods: a square grid of cells (stable, wasteful) or shelf packing with padding (tight, non-overlapping). */
export interface UvLayoutOpts{pack?:boolean;/** Gap between packed islands, in source uv units before normalization (0..0.5). */padding?:number;}
const layout=(r:UvResult,opts?:UvLayoutOpts):UvResult=>opts?.pack?packUv(r,opts.padding??0.02):gridUv(r);
/** uv slots grouped per island. */
const islandSlots=(r:UvResult):number[][]=>{
 const n=Math.max(...r.islands)+1;
 const seen:Set<number>[]=Array.from({length:n},()=>new Set());
 for(let f=0;f<r.islands.length;f++)for(let e=0;e<3;e++)seen[r.islands[f]].add(r.uvIndex[f*3+e]);
 return seen.map(x=>[...x]);
};
/** Lays islands out in a square grid of 0..1 cells, each island normalized into its own cell with a small margin. */
export function gridUv(r:UvResult):UvResult{
 const n=Math.max(...r.islands)+1;
 const cols=Math.ceil(Math.sqrt(n));
 const uv=r.uv.map(([u,v]):Uv=>[u,v]);
 islandSlots(r).forEach((slots,ii)=>{
  let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
  for(const i of slots){const[u,v]=r.uv[i];mnu=Math.min(mnu,u);mnv=Math.min(mnv,v);mxu=Math.max(mxu,u);mxv=Math.max(mxv,v);}
  const su=(mxu-mnu)||1,sv=(mxv-mnv)||1;const s=0.9/Math.max(su,sv);
  const col=ii%cols,row=Math.floor(ii/cols);
  for(const sl of slots){const[u,v]=r.uv[sl];uv[sl]=[col/cols+0.05/cols+(u-mnu)*s/cols,row/cols+0.05/cols+(v-mnv)*s/cols];}
 });
 return{...r,uv};
}
/** Packs islands non-overlapping with padding: bounding-box shelf packing, scaled into the 0..1 square with a half-padding margin. With rotate, islands taller than wide are turned 90 degrees first so the shelves stay shallow. */
export function packUv(r:UvResult,padding=0.02,rotate=false):UvResult{
 const pad=Math.min(Math.max(padding,0),0.5);
 let w=r;
 if(rotate){
  const uv=r.uv.map(([u,v]):Uv=>[u,v]);
  for(const sl of islandSlots(r)){
   let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
   for(const i of sl){const[u,v]=r.uv[i];mnu=Math.min(mnu,u);mnv=Math.min(mnv,v);mxu=Math.max(mxu,u);mxv=Math.max(mxv,v);}
   if(mxv-mnv>mxu-mnu)for(const i of sl){const[u,v]=r.uv[i];uv[i]=[mnu+(v-mnv),mnv+(mxu-u)];}
  }
  w={...r,uv};
 }
 const boxes=islandSlots(w).map(sl=>{
  let mnu=Infinity,mnv=Infinity,mxu=-Infinity,mxv=-Infinity;
  for(const i of sl){const[u,v]=w.uv[i];mnu=Math.min(mnu,u);mnv=Math.min(mnv,v);mxu=Math.max(mxu,u);mxv=Math.max(mxv,v);}
  return{sl,mnu,mnv,w:Math.max(mxu-mnu,1e-9),h:Math.max(mxv-mnv,1e-9)};
 });
 boxes.sort((a,b)=>b.h-a.h);
 const area=boxes.reduce((t,b)=>t+(b.w+pad)*(b.h+pad),0);
 const limit=Math.max(Math.sqrt(area),1e-9);
 const placed:{b:typeof boxes[number];x:number;y:number}[]=[];
 let x=0,y=0,rowH=0;
 for(const b of boxes){
  if(x>0&&x+b.w>limit){x=0;y+=rowH+pad;rowH=0;}
  placed.push({b,x,y});x+=b.w+pad;rowH=Math.max(rowH,b.h);
 }
 let maxW=0;for(const p of placed)maxW=Math.max(maxW,p.x+p.b.w);
 const maxH=y+rowH;
 const s=Math.min(1/maxW,1/maxH);
 const ox=(1-maxW*s)/2,oy=(1-maxH*s)/2;
 const uv=w.uv.map(([u,v]):Uv=>[u,v]);
 for(const p of placed)for(const i of p.b.sl){const[u,v]=w.uv[i];uv[i]=[ox+(p.x+u-p.b.mnu)*s,oy+(p.y+v-p.b.mnv)*s];}
 return{...r,uv};
}
/** Packs the existing UV layout of a mesh without changing its topology: islands follow the real UV borders plus the marked seams, shelf-packed with padding and uniformly scaled into 0..1 (relative island areas are preserved, tall islands rotate 90 degrees). */
export function packExistingUv(m:MeshData,seams:[number,number][],padding=0.02):UvResult{
 check(m);
 const verts=m.positions.length/3;
 if(!m.uvs||m.uvs.length!==verts*2)throw new UvError('The mesh has no UVs to pack.');
 const uv:Uv[]=[];
 for(let v=0;v<verts;v++)uv.push([m.uvs[v*2],m.uvs[v*2+1]]);
 return packUv({uv,uvIndex:m.index.slice(),islands:uvIslands(m,[...seams,...islandBorders(m)]),vertCount:verts},padding,true);
}
/** Seam-aware box unwrap: every island gets the planar projection of its dominant axis, laid out per the chosen layout. */
export function unwrapBox(m:MeshData,seams:[number,number][],opts?:UvLayoutOpts):UvResult{
 check(m);
 const islands=uvIslands(m,seams);
 const islandCount=Math.max(...islands)+1;
 const byIsland:number[][]=Array.from({length:islandCount},()=>[]);
 for(let f=0;f<islands.length;f++)byIsland[islands[f]].push(f);
 const uv:Uv[]=[];const uvIndex=new Array<number>(m.index.length).fill(-1);
 byIsland.forEach((faces,ii)=>{
  const vertUv=project(m,faces,ii);
  const local=new Map<string,number>();
  for(const f of faces)for(let e=0;e<3;e++){
   const v=m.index[f*3+e];const kk=`${v}_${ii}`;
   let slot=local.get(kk);
   if(slot===undefined){slot=uv.length;uv.push(vertUv.get(kk)!);local.set(kk,slot);}
   uvIndex[f*3+e]=slot;
  }
 });
 return layout({uv,uvIndex,islands,vertCount:m.positions.length/3},opts);
}
const dist=(a:[number,number,number],b:[number,number,number])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
/** 2D position of a triangle's third vertex from the placed edge P-Q and the 3D side lengths; side picks the half-plane opposite the reference point. */
const third=(P:Uv,Q:Uv,lpr:number,lqr:number,side:Uv|null):Uv=>{
 const dx=Q[0]-P[0],dy=Q[1]-P[1];const c=Math.hypot(dx,dy)||1e-12;
 const ux=dx/c,uy=dy/c;
 const x=(lpr*lpr-lqr*lqr+c*c)/(2*c);
 const h=Math.sqrt(Math.max(0,lpr*lpr-x*x));
 let sgn=1;
 if(side){const cross=ux*(side[1]-P[1])-uy*(side[0]-P[0]);sgn=cross>0?-1:1;}
 return[P[0]+x*ux-sgn*h*uy,P[1]+x*uy+sgn*h*ux];
};
/** Angle-based unfolding: every island is laid flat along a BFS spanning tree of its faces, each triangle placed with its exact 3D angles; seams cut the layout. Coincident unwelded vertices keep their own slots but land on the same layout point. */
export function unfoldAngles(m:MeshData,seams:[number,number][],opts?:UvLayoutOpts):UvResult{
 check(m);
 const islands=uvIslands(m,seams);
 const islandCount=Math.max(...islands)+1;
 const seam=new Set(seams.map(e=>ekey(e[0],e[1])));
 const nf=m.index.length/3;
 const edgeFaces=new Map<string,number[]>();
 const gkey=(a:number,b:number)=>{const pa=geoKey(v3(m,a)),pb=geoKey(v3(m,b));return pa<pb?`${pa}|${pb}`:`${pb}|${pa}`;};
 for(let f=0;f<nf;f++)for(let e=0;e<3;e++){
  const gk=gkey(m.index[f*3+e],m.index[f*3+(e+1)%3]);
  const arr=edgeFaces.get(gk);if(arr)arr.push(f);else edgeFaces.set(gk,[f]);
 }
 const uv:Uv[]=[];const uvIndex=new Array<number>(m.index.length).fill(-1);
 for(let ii=0;ii<islandCount;ii++){
  const faces:number[]=[];for(let f=0;f<nf;f++)if(islands[f]===ii)faces.push(f);
  if(!faces.length)continue;
  const slotOf=new Map<number,number>();
  const slot=(v:number,p?:Uv):number=>{
   let sl=slotOf.get(v);
   if(sl===undefined){sl=uv.length;uv.push(p??[0,0]);slotOf.set(v,sl);}
   else if(p)uv[sl]=p;
   return sl;
  };
  // root triangle with exact 3D angles
  const f0=faces[0];
  const[a0,b0,c0]=[m.index[f0*3],m.index[f0*3+1],m.index[f0*3+2]];
  const A=v3(m,a0),B=v3(m,b0),C=v3(m,c0);
  slot(a0,[0,0]);slot(b0,[dist(A,B),0]);slot(c0,third([0,0],[dist(A,B),0],dist(A,C),dist(B,C),null));
  const visited=new Set<number>([f0]);
  const queue=[f0];
  while(queue.length){
   const f=queue.shift()!;
   for(let e=0;e<3;e++){
    const va=m.index[f*3+e],vb=m.index[f*3+(e+1)%3];
    if(seam.has(ekey(va,vb)))continue;
    for(const g of edgeFaces.get(gkey(va,vb))??[]){
     if(g===f||visited.has(g)||islands[g]!==ii)continue;
     visited.add(g);queue.push(g);
     // the shared edge's endpoint copies inside g, matched geometrically (unwelded meshes)
     const corners=[m.index[g*3],m.index[g*3+1],m.index[g*3+2]];
     const pa=v3(m,va),pb=v3(m,vb);
     const match=(v:number,q:[number,number,number])=>{const p=v3(m,v);return Math.abs(p[0]-q[0])<1e-6&&Math.abs(p[1]-q[1])<1e-6&&Math.abs(p[2]-q[2])<1e-6;};
     const ga=corners.find(v=>match(v,pa)),gb=corners.find(v=>match(v,pb)),gr=corners.find(v=>!match(v,pa)&&!match(v,pb));
     if(ga===undefined||gb===undefined||gr===undefined)continue;
     const P=uv[slot(va)],Q=uv[slot(vb)];
     if(!slotOf.has(ga))slot(ga,P);
     if(!slotOf.has(gb))slot(gb,Q);
     if(slotOf.has(gr))continue;
     // place against the copies' actual positions (they may differ from f's slots when paths diverge)
     const P2=uv[slotOf.get(ga)!],Q2=uv[slotOf.get(gb)!];
     const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]].find(v=>v!==va&&v!==vb);
     const side=t!==undefined&&slotOf.has(t)?uv[slotOf.get(t)!]:null;
     slot(gr,third(P2,Q2,dist(pa,v3(m,gr)),dist(pb,v3(m,gr)),side));
    }
   }
  }
  for(const f of faces)for(let e=0;e<3;e++){
   const v=m.index[f*3+e];const k=f*3+e;
   uvIndex[k]=slot(v);
  }
 }
 if(uvIndex.some(i=>i<0))throw new UvError('The mesh data is damaged.');
 return layout({uv,uvIndex,islands,vertCount:m.positions.length/3},opts);
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
/** Position edges whose touching sides use different UV coordinates at the shared endpoints - the borders of the current UV islands. Boundary edges (one side only) are not borders. One representative index pair per position edge, low index first. */
export function islandBorders(m:MeshData):[number,number][]{
 check(m);
 if(!m.uvs||m.uvs.length!==m.positions.length/3*2)throw new UvError('The mesh has no UVs.');
 const uses=new Map<string,[number,number][]>();
 for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){
  const a=m.index[f+e],b=m.index[f+(e+1)%3];
  const pa=geoKey(v3(m,a)),pb=geoKey(v3(m,b));
  const gk=pa<pb?`${pa}|${pb}`:`${pb}|${pa}`;
  const arr=uses.get(gk);if(arr)arr.push([a,b]);else uses.set(gk,[[a,b]]);
 }
 const out:[number,number][]=[];
 for(const corners of uses.values()){
  if(corners.length<2)continue;
  const uvAt=new Map<string,[number,number]>();
  for(const v of corners[0])uvAt.set(geoKey(v3(m,v)),[m.uvs[v*2],m.uvs[v*2+1]]);
  let border=false;
  for(let u=1;u<corners.length&&!border;u++)for(const v of corners[u]){
   const ref=uvAt.get(geoKey(v3(m,v)))!;
   if(Math.abs(m.uvs[v*2]-ref[0])>EPS||Math.abs(m.uvs[v*2+1]-ref[1])>EPS){border=true;break;}
  }
  if(border){const [a,b]=corners[0];out.push(a<b?[a,b]:[b,a]);}
 }
 return out;
}
export function seamsAround(m:MeshData,edges:[number,number][]):[number,number][]{
 check(m);
 return matchPts(m,edges.flatMap(e=>[v3(m,e[0]),v3(m,e[1])]));
}
/** Re-finds seams after a geometry rebuild that re-indexed or split vertices (edit ops, UV unwrap): edges that still exist geometrically keep their seam, the rest drop. */
export function remapSeams(from:MeshData,seams:[number,number][],to:MeshData):[number,number][]{
 check(from);check(to);
 return matchPts(to,seams.flatMap(e=>[v3(from,e[0]),v3(from,e[1])]));
}
