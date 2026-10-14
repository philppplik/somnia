/** Mesh edit operations on plain position/index arrays - no three.js, so every op is testable in Node and the viewport stays the only three consumer. All meshes are indexed triangle lists. */
export class EditError extends Error{name='EditError';}
export interface MeshData{positions:number[];index:number[];/** Per-vertex sculpt mask 0..1 (1 = fully protected). Dropped by topology-changing ops. */mask?:number[];/** UVs parallel to positions (2 per vertex). Carried through by the bake ops that can preserve them (mirror/symmetrize/subdivide), dropped by the rest. */uvs?:number[];/** Explicit per-vertex normals (3 per vertex). Only the normals ops read or write them; every other op drops them and the geometry rebuild recomputes smooth normals. */normals?:number[];}
/** Hard cap for one editable mesh; operations that would pass it are refused. */
export const MAX_EDIT_VERTICES=200_000;
export const MAX_EDIT_TRIANGLES=400_000;
const v3=(m:MeshData,i:number):[number,number,number]=>[m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]];
const sub=(a:number[],b:number[]):[number,number,number]=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:number[],b:number[]):[number,number,number]=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=(a:number[])=>Math.hypot(a[0],a[1],a[2]);
const norm=(a:[number,number,number]):[number,number,number]=>{const l=len(a)||1;return[a[0]/l,a[1]/l,a[2]/l];};
export const faceNormal=(m:MeshData,f:number):[number,number,number]=>{
 const[a,b,c]=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
 return norm(cross(sub(v3(m,b),v3(m,a)),sub(v3(m,c),v3(m,a))));
};
export const faceCenter=(m:MeshData,f:number):[number,number,number]=>{
 const[a,b,c]=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
 return[(m.positions[a*3]+m.positions[b*3]+m.positions[c*3])/3,(m.positions[a*3+1]+m.positions[b*3+1]+m.positions[c*3+1])/3,(m.positions[a*3+2]+m.positions[b*3+2]+m.positions[c*3+2])/3];
};
const check=(m:MeshData)=>{
 const verts=m.positions.length/3,tris=m.index.length/3;
 if(!Number.isInteger(verts)||!Number.isInteger(tris)||m.positions.some(n=>!Number.isFinite(n)))throw new EditError('The mesh data is damaged.');
 if(m.uvs&&(m.uvs.length!==verts*2||m.uvs.some(n=>!Number.isFinite(n))))throw new EditError('The mesh data is damaged.');
 if(m.normals&&(m.normals.length!==verts*3||m.normals.some(n=>!Number.isFinite(n))))throw new EditError('The mesh data is damaged.');
 if(verts>MAX_EDIT_VERTICES||tris>MAX_EDIT_TRIANGLES)throw new EditError(`This mesh is too large to edit (${Math.round(verts).toLocaleString('en-US')} vertices).`);
};
const checkFaces=(m:MeshData,faces:number[])=>{
 if(!faces.length)throw new EditError('Select at least one face first.');
 for(const f of faces)if(!Number.isInteger(f)||f<0||f>=m.index.length/3)throw new EditError('A selected face does not exist.');
};
/** Extrudes the selected faces along their averaged normal: new side walls plus a moved cap. */
export function extrudeFaces(m:MeshData,faces:number[],offset:number):MeshData{
 check(m);checkFaces(m,faces);
 if(!Number.isFinite(offset)||offset===0||Math.abs(offset)>1e6)throw new EditError('The extrude distance must be a non-zero number.');
 const sel=new Set(faces);
 let nx=0,ny=0,nz=0;for(const f of faces){const n=faceNormal(m,f);nx+=n[0];ny+=n[1];nz+=n[2];}
 const dir=norm([nx,ny,nz]);
 // Boundary edges of the selection: edges used by exactly one selected face.
 const use=new Map<string,{a:number;b:number;n:number}>();
 const key=(a:number,b:number)=>a<b?`${a}_${b}`:`${b}_${a}`;
 for(const f of sel)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];const k=key(a,b);const u=use.get(k);
  if(u)u.n++;else use.set(k,{a,b,n:1});
 }
 const boundary=[...use.values()].filter(u=>u.n===1);
 if(!boundary.length)throw new EditError('The selected faces have no boundary to extrude.');
 // Duplicate every vertex touched by the selection; the duplicate moves along dir, the original stays.
 const touched=new Set<number>();for(const f of sel)for(let e=0;e<3;e++)touched.add(m.index[f*3+e]);
 const dup=new Map<number,number>();const positions=[...m.positions];
 for(const v of touched){dup.set(v,positions.length/3);positions.push(m.positions[v*3]+dir[0]*offset,m.positions[v*3+1]+dir[1]*offset,m.positions[v*3+2]+dir[2]*offset);}
 const index:number[]=[];
 for(let f=0;f<m.index.length/3;f++){
  const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
  index.push(...(sel.has(f)?t.map(v=>dup.get(v)!):t));
 }
 for(const{b,a,n:unused}of boundary.map(u=>({a:u.a,b:u.b,n:u.n}))){void unused;
  // wall quad (a,b,b',a') as two triangles; orientation: keep the winding of the selected face that owns the edge.
  let fa=-1;for(const f of sel){const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];if((t[0]===a&&t[1]===b)||(t[1]===a&&t[2]===b)||(t[2]===a&&t[0]===b)){fa=1;break;}if((t[1]===a&&t[0]===b)||(t[2]===a&&t[1]===b)||(t[0]===a&&t[2]===b)){fa=0;break;}}
  const A=a,B=b,A2=dup.get(a)!,B2=dup.get(b)!;
  if(fa===1)index.push(A,B,B2, A,B2,A2);else index.push(A,B2,B, A,A2,B2);
 }
 const out={positions,index};check(out);return out;
}
/** Insets each selected face toward its centroid, leaving a ring of quads around it. */
export function insetFaces(m:MeshData,faces:number[],amount:number):MeshData{
 check(m);checkFaces(m,faces);
 if(!Number.isFinite(amount)||amount<=0||amount>=1)throw new EditError('The inset amount must be between 0 and 1.');
 const sel=new Set(faces);
 const positions=[...m.positions];const index:number[]=[];
 for(let f=0;f<m.index.length/3;f++){
  const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
  if(!sel.has(f)){index.push(...t);continue;}
  const c=faceCenter(m,f);const inner:number[]=[];
  for(const v of t){
   const p=v3(m,v);const ni=positions.length/3;
   positions.push(p[0]+(c[0]-p[0])*amount,p[1]+(c[1]-p[1])*amount,p[2]+(c[2]-p[2])*amount);
   inner.push(ni);
  }
  index.push(...inner);
  for(let e=0;e<3;e++){const a=t[e],b=t[(e+1)%3],a2=inner[e],b2=inner[(e+1)%3];index.push(a,b,b2, a,b2,a2);}
 }
 const out={positions,index};check(out);return out;
}
/** Bevels (chamfers) the selected vertices: each is replaced by a flat face set back along its edges. */
export function bevelVertices(m:MeshData,verts:number[],width:number):MeshData{
 check(m);
 if(!verts.length)throw new EditError('Select at least one vertex first.');
 if(!Number.isFinite(width)||width<=0||width>1e6)throw new EditError('The bevel width must be a positive number.');
 for(const v of verts)if(!Number.isInteger(v)||v<0||v>=m.positions.length/3)throw new EditError('A selected vertex does not exist.');
 const sel=new Set(verts);
 // Neighbours of each selected vertex (via edges of adjacent triangles), in ring order per fan.
 const positions=[...m.positions];const index:number[]=[];
 const newFaceVerts:number[]=[];
 const facesOf=(v:number)=>{const out:number[]=[];for(let f=0;f<m.index.length/3;f++)for(let e=0;e<3;e++)if(m.index[f*3+e]===v)out.push(f);return out;};
 const replace=new Map<number,Map<number,number>>(); // sel vertex -> neighbour -> new vertex
 for(const v of sel){
  const adj=facesOf(v);
  const nbs=new Set<number>();
  for(const f of adj){const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];for(const x of t)if(x!==v&&!sel.has(x))nbs.add(x);}
  if(!nbs.size)throw new EditError('A selected vertex is only connected to other selected vertices.');
  const pv=v3(m,v);const map=new Map<number,number>();
  for(const n of nbs){
   const pn=v3(m,n);const d=sub(pn,pv);const l=len(d)||1;const w=Math.min(width,l*0.49);
   const ni=positions.length/3;positions.push(pv[0]+d[0]/l*w,pv[1]+d[1]/l*w,pv[2]+d[2]/l*w);
   map.set(n,ni);newFaceVerts.push(ni);
  }
  replace.set(v,map);
 }
 for(let f=0;f<m.index.length/3;f++){
  const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
  const s=t.filter(v=>sel.has(v));
  if(!s.length){index.push(...t);continue;}
  if(s.length>1)throw new EditError('Selected vertices may not share a face; bevel them one area at a time.');
  const v=s[0];const map=replace.get(v)!;
  for(let e=0;e<3;e++){
   if(t[e]===v){
    const a=t[(e+1)%3],b=t[(e+2)%3];const na=map.get(a),nb=map.get(b);
    if(na===undefined||nb===undefined){index.push(t[e],a,b);continue;}
    index.push(na,a,b, na,b,nb);
   }
  }
 }
 // Cap each bevelled vertex with a fan around its average (ring order approximated by angle around the normal).
 for(const v of sel){
  const map=replace.get(v)!;const pts=[...map.values()];
  const c=[0,0,0];for(const p of pts){c[0]+=positions[p*3]/pts.length;c[1]+=positions[p*3+1]/pts.length;c[2]+=positions[p*3+2]/pts.length;}
  const pv=v3(m,v);
  const n=norm(sub(c as [number,number,number],pv));
  const ref=Math.abs(n[0])<0.9?[1,0,0]:[0,1,0];
  const u=norm(cross(n,ref as [number,number,number]));const w=cross(n,u);
  pts.sort((p,q)=>{const pa=sub(v3({positions,index},p),c as [number,number,number]),pb=sub(v3({positions,index},q),c as [number,number,number]);
   return Math.atan2(pa[0]*w[0]+pa[1]*w[1]+pa[2]*w[2],pa[0]*u[0]+pa[1]*u[1]+pa[2]*u[2])-Math.atan2(pb[0]*w[0]+pb[1]*w[1]+pb[2]*w[2],pb[0]*u[0]+pb[1]*u[1]+pb[2]*u[2]);});
  const ci=positions.length/3;positions.push(c[0],c[1],c[2]);
  for(let i=0;i<pts.length;i++)index.push(ci,pts[i],pts[(i+1)%pts.length]);
 }
 const out={positions,index};check(out);return out;
}
/** Cuts the mesh with a plane through the midpoint of the chosen edge, perpendicular to the edge direction - the loop cut for grid-like primitives. */
export function loopCut(m:MeshData,edge:[number,number]):MeshData{
 check(m);
 const[a,b]=edge;
 for(const v of edge)if(!Number.isInteger(v)||v<0||v>=m.positions.length/3)throw new EditError('The chosen edge does not exist.');
 const pa=v3(m,a),pb=v3(m,b);const d=norm(sub(pb,pa));
 if(len(sub(pb,pa))<1e-9)throw new EditError('The chosen edge has zero length.');
 const c:[number,number,number]=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2,(pa[2]+pb[2])/2];
 const side=(p:[number,number,number])=>Math.sign((p[0]-c[0])*d[0]+(p[1]-c[1])*d[1]+(p[2]-c[2])*d[2]);
 const positions=[...m.positions];const index:number[]=[];
 const mid=new Map<string,number>();
 const cut=(x:number,y:number)=>{
  const k=x<y?`${x}_${y}`:`${y}_${x}`;const got=mid.get(k);if(got!==undefined)return got;
  const px=v3(m,x),py=v3(m,y);const dx=(px[0]-c[0])*d[0]+(px[1]-c[1])*d[1]+(px[2]-c[2])*d[2];const dy=(py[0]-c[0])*d[0]+(py[1]-c[1])*d[1]+(py[2]-c[2])*d[2];
  const t=dx/(dx-dy);const ni=positions.length/3;
  positions.push(px[0]+(py[0]-px[0])*t,px[1]+(py[1]-px[1])*t,px[2]+(py[2]-px[2])*t);
  mid.set(k,ni);return ni;
 };
 let cuts=0;
 for(let f=0;f<m.index.length/3;f++){
  const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
  const s=t.map(v=>side(v3(m,v)));
  if(s.every(x=>x>=0)||s.every(x=>x<=0)){index.push(...t);continue;}
  const lone=s.filter(x=>x>0).length===1?t[s.indexOf(1)]:s.filter(x=>x<0).length===1?t[s.indexOf(-1)]:-1;
  if(lone<0){index.push(...t);continue;}
  const others=t.filter(v=>v!==lone);
  const m1=cut(lone,others[0]),m2=cut(lone,others[1]);cuts++;
  index.push(lone,m1,m2, m1,others[0],others[1], m1,others[1],m2);
 }
 if(!cuts)throw new EditError('No edge loop crosses the chosen edge; loop cut needs a grid-like region.');
 const out={positions,index};check(out);return out;
}
/** Chamfers the selected edges: each edge becomes a flat face set back from both sides. Edges are matched geometrically, so unwelded primitives (per-face corners) work. Selected edges may not touch or share a face. */
export function bevelEdges(m:MeshData,edges:[number,number][],width:number,segments=1):MeshData{
 check(m);
 if(!edges.length)throw new EditError('Select at least one edge first.');
 if(!Number.isFinite(width)||width<=0||width>1e6)throw new EditError('The bevel width must be a positive number.');
 if(!Number.isInteger(segments)||segments<1||segments>8)throw new EditError('The bevel segments must be a whole number between 1 and 8.');
 const nv=m.positions.length/3;
 const EPS=1e-6;
 const same=(i:number,p:[number,number,number])=>Math.abs(m.positions[i*3]-p[0])<EPS&&Math.abs(m.positions[i*3+1]-p[1])<EPS&&Math.abs(m.positions[i*3+2]-p[2])<EPS;
 // validate everything on the original mesh first, so a bad edge cannot leave a half-applied bevel
 const plans:{f:number;va:number;vb:number;c:number;pa:[number,number,number];pb:[number,number,number];forward:boolean}[][]=[];
 const usedFaces=new Set<number>();const usedPts:[number,number,number][]=[];
 for(const e of edges){
  if(!Array.isArray(e)||e.length!==2||!e.every(v=>Number.isInteger(v)&&v>=0&&v<nv)||e[0]===e[1])throw new EditError('A selected edge does not exist.');
  const pa=v3(m,e[0]),pb=v3(m,e[1]);
  for(const q of[pa,pb])for(const u of usedPts)if(Math.abs(q[0]-u[0])<EPS&&Math.abs(q[1]-u[1])<EPS&&Math.abs(q[2]-u[2])<EPS)throw new EditError('Selected edges may not touch; bevel them one area at a time.');
  usedPts.push(pa,pb);
  const adj:{f:number;va:number;vb:number;c:number;pa:[number,number,number];pb:[number,number,number];forward:boolean}[]=[];
  for(let f=0;f<m.index.length/3;f++){
   const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
   let va=-1,vb=-1,c=-1,forward=false;
   for(let k=0;k<3;k++){
    const x=t[k],y=t[(k+1)%3],z=t[(k+2)%3];
    if(same(x,pa)&&same(y,pb)){va=x;vb=y;c=z;forward=true;break;}
    if(same(x,pb)&&same(y,pa)){va=y;vb=x;c=z;forward=false;break;}
   }
   if(va>=0)adj.push({f,va,vb,c,pa,pb,forward});
  }
  if(adj.length!==2)throw new EditError('Edge bevel needs edges with exactly two neighbouring faces.');
  for(const a of adj){if(usedFaces.has(a.f))throw new EditError('Selected edges may not share a face; bevel them one area at a time.');usedFaces.add(a.f);}
  plans.push(adj);
 }
 const positions=[...m.positions];const index=[...m.index];
 for(const adj of plans){
  const edgeDir=norm(sub(adj[0].pb,adj[0].pa));
  // per face: tangent pull direction (unit) and clamped width
  const dirs:[number,number,number][]=[];const ws:number[]=[];
  for(const a of adj){
   const pc=v3(m,a.c);
   const vec=sub(pc,a.pa);const along=vec[0]*edgeDir[0]+vec[1]*edgeDir[1]+vec[2]*edgeDir[2];
   const perp:[number,number,number]=[vec[0]-edgeDir[0]*along,vec[1]-edgeDir[1]*along,vec[2]-edgeDir[2]*along];
   const l=len(perp);if(l<1e-9)throw new EditError('A face next to a selected edge is degenerate.');
   dirs.push([perp[0]/l,perp[1]/l,perp[2]/l]);
   ws.push(Math.min(width,l*0.49));
  }
  const w=Math.min(ws[0],ws[1]);
  const n1=dirs[0],n2=dirs[1];
  const cosPhi=Math.max(-1,Math.min(1,n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2]));
  const phi=Math.acos(cosPhi);
  // arc rows between the two faces; segments=1 (or near-coplanar faces) is the straight chamfer
  const segs=phi<1e-6?1:segments;
  const rows:[number,number][]=[]; // per row: [vertIndexA,vertIndexB]
  const rowPoint=(pa:[number,number,number],theta:number):[number,number,number]=>{
   if(segs===1)return[pa[0]+n1[0]*w,pa[1]+n1[1]*w,pa[2]+n1[2]*w];
   const r=w*Math.tan(phi/2);
   // q1: unit vector in the n1-n2 plane perpendicular to n1, toward n2
   const d=n2[0]-n1[0]*cosPhi;const e=n2[1]-n1[1]*cosPhi;const f=n2[2]-n1[2]*cosPhi;
   const ql=Math.hypot(d,e,f)||1;const q1:[number,number,number]=[d/ql,e/ql,f/ql];
   const c:[number,number,number]=[pa[0]+n1[0]*w+q1[0]*r,pa[1]+n1[1]*w+q1[1]*r,pa[2]+n1[2]*w+q1[2]*r];
   return[c[0]-r*(Math.cos(theta)*q1[0]+Math.sin(theta)*n1[0]),c[1]-r*(Math.cos(theta)*q1[1]+Math.sin(theta)*n1[1]),c[2]-r*(Math.cos(theta)*q1[2]+Math.sin(theta)*n1[2])];
  };
  for(let j=0;j<=segs;j++){
   const theta=phi*j/segs;
   const ia=positions.length/3;const pa=rowPoint(adj[0].pa,theta);
   positions.push(pa[0],pa[1],pa[2]);
   const pb=rowPoint(adj[0].pb,theta);
   positions.push(pb[0],pb[1],pb[2]);
   rows.push([ia,ia+1]);
  }
  // rewrite both faces to their tangent rows (first and last row)
  const[a1,b1]=rows[0],[a2,b2]=rows[rows.length-1];
  for(const[k,a]of adj.entries()){
   const[na,nb]=k===0?[a1,b1]:[a2,b2];
   for(let kk=0;kk<3;kk++){
    if(index[a.f*3+kk]===a.va)index[a.f*3+kk]=na;
    if(index[a.f*3+kk]===a.vb)index[a.f*3+kk]=nb;
   }
  }
  // strip between consecutive rows with face1's winding
  const fwd=adj[0].forward;
  for(let j=0;j<rows.length-1;j++){
   const[ra,rb]=rows[j],[ca,cb]=rows[j+1];
   if(fwd)index.push(ra,rb,cb, ra,cb,ca);else index.push(ra,cb,rb, ra,ca,cb);
  }
 }
 const out={positions,index};check(out);return out;
}
/** Slides an edge loop along its neighbouring faces: every loop vertex moves along the guide edge most perpendicular to the loop tangent, scaled by factor (-1.5..1.5). */
export function slideEdges(m:MeshData,edges:[number,number][],factor:number):MeshData{
 check(m);
 if(!edges.length)throw new EditError('Select at least one edge first.');
 if(!Number.isFinite(factor)||factor===0||Math.abs(factor)>1.5)throw new EditError('The slide factor must be between -1.5 and 1.5 and not zero.');
 const nv=m.positions.length/3;
 const loopVerts=new Set<number>();
 for(const e of edges){
  if(!Array.isArray(e)||e.length!==2||!e.every(v=>Number.isInteger(v)&&v>=0&&v<nv)||e[0]===e[1])throw new EditError('A selected edge does not exist.');
  loopVerts.add(e[0]);loopVerts.add(e[1]);
 }
 const incident:number[][]=Array.from({length:nv},()=>[]);
 for(let f=0;f<m.index.length/3;f++)for(let e=0;e<3;e++){
  const a=m.index[f+e],b=m.index[f+(e+1)%3];incident[a].push(b);incident[b].push(a);
 }
 // per-vertex guide: the spoke (edge to a non-loop neighbour) most perpendicular to the loop tangent
 const guide=new Map<number,[number,number,number]>();
 for(const v of loopVerts){
  const nbs=[...new Set(incident[v])];
  const loopNbs=nbs.filter(u=>loopVerts.has(u));
  const spokes=nbs.filter(u=>!loopVerts.has(u));
  if(!spokes.length||!loopNbs.length)throw new EditError('Loop slide needs a grid-like region: every loop vertex needs neighbours inside and outside the loop.');
  const pv=v3(m,v);
  let tangent:[number,number,number];
  if(loopNbs.length>=2){const d=sub(v3(m,loopNbs[1]),v3(m,loopNbs[0]));tangent=norm([d[0],d[1],d[2]]);}
  else tangent=norm(sub(v3(m,loopNbs[0]),pv));
  let best:number|null=null,bestScore=Infinity;
  for(const u of spokes){
   const d=sub(v3(m,u),pv);const l=len(d);if(l<1e-9)continue;
   const score=Math.abs((d[0]*tangent[0]+d[1]*tangent[1]+d[2]*tangent[2])/l);
   if(score<bestScore){bestScore=score;best=u;}
  }
  if(best===null)throw new EditError('Loop slide needs a grid-like region: a loop vertex has no usable guide edge.');
  guide.set(v,sub(v3(m,best),pv));
 }
 // consistent orientation against the first vertex's guide
 const first=[...loopVerts][0];const ref=guide.get(first)!;
 const positions=[...m.positions];
 for(const v of loopVerts){
  let g=guide.get(v)!;
  if(g[0]*ref[0]+g[1]*ref[1]+g[2]*ref[2]<0)g=[-g[0],-g[1],-g[2]];
  positions[v*3]+=g[0]*factor;positions[v*3+1]+=g[1]*factor;positions[v*3+2]+=g[2]*factor;
 }
 const out={positions,index:[...m.index]};check(out);return out;
}
export type MirrorAxis='x'|'y'|'z';
/** Combines a mesh with its mirror across a local axis plane through the origin. Vertices within merge distance of the plane are welded onto it. */
/** Cuts the mesh at an axis plane through the origin and keeps only the positive side; crossing faces are split along the plane. */
export function bisectClip(m:MeshData,axis:MirrorAxis):MeshData{
 check(m);
 const ai=axis==='x'?0:axis==='y'?1:2;
 const EPS=1e-9;
 const side=(i:number)=>m.positions[i*3+ai]>EPS?1:m.positions[i*3+ai]<-EPS?-1:0;
 const positions:number[]=[];const remap=new Map<number,number>();const uvs:number[]|undefined=m.uvs?[]:undefined;
 const keep=(i:number)=>{let n=remap.get(i);if(n===undefined){n=positions.length/3;remap.set(i,n);positions.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);if(uvs)uvs.push(m.uvs![i*2],m.uvs![i*2+1]);if(Math.abs(m.positions[i*3+ai])<=EPS)positions[n*3+ai]=0;}return n;};
 const cross=new Map<string,number>();
 const cut=(x:number,y:number)=>{
  const k=x<y?`${x}_${y}`:`${y}_${x}`;let n=cross.get(k);
  if(n!==undefined)return n;
  const px=v3(m,x),py=v3(m,y);const dx=px[ai],dy=py[ai];const t=dx/(dx-dy);
  n=positions.length/3;cross.set(k,n);
  positions.push(px[0]+(py[0]-px[0])*t,px[1]+(py[1]-px[1])*t,px[2]+(py[2]-px[2])*t);
  if(uvs)uvs.push(m.uvs![x*2]+(m.uvs![y*2]-m.uvs![x*2])*t,m.uvs![x*2+1]+(m.uvs![y*2+1]-m.uvs![x*2+1])*t);
  positions[n*3+ai]=0;return n;
 };
 const index:number[]=[];
 for(let f=0;f<m.index.length/3;f++){
  const t=[m.index[f*3],m.index[f*3+1],m.index[f*3+2]];
  const s=t.map(side);
  if(s.every(x=>x<0))continue; // fully on the clipped side
  if(s.every(x=>x>=0)){index.push(keep(t[0]),keep(t[1]),keep(t[2]));continue;}
  // crossing: collect the positive polygon (1 or 2 positive verts)
  const poly:number[]=[];
  for(let e=0;e<3;e++){
   const a=t[e],b=t[(e+1)%3],sa=s[e],sb=s[(e+1)%3];
   if(sa>=0)poly.push(keep(a));
   if((sa>0&&sb<0)||(sa<0&&sb>0))poly.push(cut(a,b));
  }
  if(poly.length===3)index.push(poly[0],poly[1],poly[2]);
  else if(poly.length===4)index.push(poly[0],poly[1],poly[2], poly[0],poly[2],poly[3]);
 }
 const out:MeshData=uvs?{positions,index,uvs}:{positions,index};
 if(!positions.length)throw new EditError('Nothing remains on the positive side of the mirror plane.');
 check(out);return out;
}
/** Bakes a symmetry: keeps the chosen side of the mirror plane, mirrors it onto the other side and welds vertices within merge distance of the plane. Shares the clip/mirror math of the mirror modifier. */
export function symmetrizeMesh(m:MeshData,axis:MirrorAxis,side:'positive'|'negative',merge:number):MeshData{
 check(m);
 if(side==='positive')return mirrorCombine(m,axis,merge,true);
 const ai=axis==='x'?0:axis==='y'?1:2;
 const flip=(d:MeshData):MeshData=>{
  const positions=[...d.positions];
  for(let i=ai;i<positions.length;i+=3)positions[i]=-positions[i];
  const index:number[]=[];
  for(let f=0;f<d.index.length;f+=3)index.push(d.index[f],d.index[f+2],d.index[f+1]); // keep normals outward after mirroring
  return d.uvs?{positions,index,uvs:[...d.uvs]}:{positions,index};
 };
 return flip(mirrorCombine(flip(m),axis,merge,true));
}

/** One round of the Loop subdivision scheme: every triangle splits into four; new edge points weigh the edge ends 3/8 and the two opposite vertices 1/8 (boundary edges only average their ends), original vertices are pulled towards their neighbours (boundary vertices only along the boundary). */
const loopOnce=(m:MeshData):MeshData=>{
 const nv=m.positions.length/3,nt=m.index.length/3;
 const key=(a:number,b:number)=>a<b?`${a}_${b}`:`${b}_${a}`;
 const edges=new Map<string,{a:number;b:number;opp:number[]}>();
 const nbr:number[][]=Array.from({length:nv},()=>[]);
 const link=(a:number,b:number,o:number)=>{
  const k=key(a,b);let e=edges.get(k);
  if(!e){e={a:Math.min(a,b),b:Math.max(a,b),opp:[]};edges.set(k,e);}
  e.opp.push(o);
  if(!nbr[a].includes(b))nbr[a].push(b);
  if(!nbr[b].includes(a))nbr[b].push(a);
 };
 for(let f=0;f<nt;f++){const a=m.index[f*3],b=m.index[f*3+1],c=m.index[f*3+2];link(a,b,c);link(b,c,a);link(c,a,b);}
 const bnd:number[][]=Array.from({length:nv},()=>[]);
 for(const e of edges.values())if(e.opp.length===1){bnd[e.a].push(e.b);bnd[e.b].push(e.a);}
 const positions=[...m.positions];
 const uvs=m.uvs?[...m.uvs]:undefined;
 for(let i=0;i<nv;i++){
  const p=v3(m,i);let q:[number,number,number];let wsum:[number,number]|null=null;
  if(bnd[i].length===2){
   const b0=v3(m,bnd[i][0]),b1=v3(m,bnd[i][1]);
   q=[p[0]*0.75+(b0[0]+b1[0])*0.125,p[1]*0.75+(b0[1]+b1[1])*0.125,p[2]*0.75+(b0[2]+b1[2])*0.125];
   if(uvs)wsum=[m.uvs![i*2]*0.75+(m.uvs![bnd[i][0]*2]+m.uvs![bnd[i][1]*2])*0.125,m.uvs![i*2+1]*0.75+(m.uvs![bnd[i][0]*2+1]+m.uvs![bnd[i][1]*2+1])*0.125];
  }else if(bnd[i].length===0&&nbr[i].length>=3){
   const k=nbr[i].length,beta=(1/k)*(5/8-Math.pow(3/8+Math.cos(2*Math.PI/k)/4,2));
   let sx=0,sy=0,sz=0,su=0,sv=0;for(const j of nbr[i]){sx+=m.positions[j*3];sy+=m.positions[j*3+1];sz+=m.positions[j*3+2];if(uvs){su+=m.uvs![j*2];sv+=m.uvs![j*2+1];}}
   const w=1-k*beta;
   q=[p[0]*w+sx*beta,p[1]*w+sy*beta,p[2]*w+sz*beta];
   if(uvs)wsum=[m.uvs![i*2]*w+su*beta,m.uvs![i*2+1]*w+sv*beta];
  }else q=p; // non-manifold or nearly isolated vertex: leave it in place
  positions[i*3]=q[0];positions[i*3+1]=q[1];positions[i*3+2]=q[2];
  if(uvs&&wsum){uvs[i*2]=wsum[0];uvs[i*2+1]=wsum[1];}
 }
 const mid=new Map<string,number>();
 for(const [k,e] of edges){
  const a=v3(m,e.a),b=v3(m,e.b);let p:[number,number,number];
  if(e.opp.length>=2){
   const c=v3(m,e.opp[0]),d=v3(m,e.opp[1]);
   p=[(a[0]+b[0])*0.375+(c[0]+d[0])*0.125,(a[1]+b[1])*0.375+(c[1]+d[1])*0.125,(a[2]+b[2])*0.375+(c[2]+d[2])*0.125];
  }else p=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
  mid.set(k,positions.length/3);positions.push(p[0],p[1],p[2]);
  if(uvs){
   if(e.opp.length>=2)uvs.push((m.uvs![e.a*2]+m.uvs![e.b*2])*0.375+(m.uvs![e.opp[0]*2]+m.uvs![e.opp[1]*2])*0.125,(m.uvs![e.a*2+1]+m.uvs![e.b*2+1])*0.375+(m.uvs![e.opp[0]*2+1]+m.uvs![e.opp[1]*2+1])*0.125);
   else uvs.push((m.uvs![e.a*2]+m.uvs![e.b*2])/2,(m.uvs![e.a*2+1]+m.uvs![e.b*2+1])/2);
  }
 }
 const index:number[]=[];
 for(let f=0;f<nt;f++){
  const a=m.index[f*3],b=m.index[f*3+1],c=m.index[f*3+2];
  const ab=mid.get(key(a,b))!,bc=mid.get(key(b,c))!,ca=mid.get(key(c,a))!;
  index.push(a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca);
 }
 return uvs?{positions,index,uvs}:{positions,index};
};

/** What a cleanup changed: welded vertex pairs, dropped collapsed/duplicate faces, removed unreferenced vertices, flipped inside-out components. */
export interface CleanupResult{mesh:MeshData;welded:number;facesDropped:number;vertsDropped:number;flipped:number;}
/** Mesh cleanup: welds vertices within the distance onto the first occurrence (positions never move; with UVs only vertices whose UVs also match weld, so UV seams survive), drops collapsed and duplicate faces plus unreferenced vertices, makes the winding consistent per connected part and flips closed parts whose signed volume is negative (inside-out). Open parts are only made consistent, never volume-flipped. Drops the sculpt mask like every topology-changing op. */
export function cleanupMesh(m:MeshData,weld:number):CleanupResult{
 check(m);
 if(!Number.isFinite(weld)||weld<0||weld>1e6)throw new EditError('The weld distance must be zero or a positive number.');
 let index=[...m.index];const uvs=m.uvs?[...m.uvs]:undefined;let positions=[...m.positions];
 let welded=0;
 if(weld>0){
  const grid=new Map<string,number[]>();
  const map=new Array<number>(positions.length/3);
  for(let i=0;i<positions.length/3;i++){
   const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
   const cx=Math.floor(x/weld),cy=Math.floor(y/weld),cz=Math.floor(z/weld);
   let found=-1;
   for(let dx=-1;dx<=1&&found<0;dx++)for(let dy=-1;dy<=1&&found<0;dy++)for(let dz=-1;dz<=1&&found<0;dz++){
    const bucket=grid.get(`${cx+dx}_${cy+dy}_${cz+dz}`);
    if(!bucket)continue;
    for(const j of bucket){
     const ddx=positions[j*3]-x,ddy=positions[j*3+1]-y,ddz=positions[j*3+2]-z;
     if(ddx*ddx+ddy*ddy+ddz*ddz>weld*weld)continue;
     if(uvs&&(Math.abs(uvs[j*2]-uvs[i*2])>1e-6||Math.abs(uvs[j*2+1]-uvs[i*2+1])>1e-6))continue; // same spot, different texture coordinate: a UV seam, not a double
     found=j;break;
    }
   }
   if(found<0){found=i;const k=`${cx}_${cy}_${cz}`;const b=grid.get(k);if(b)b.push(i);else grid.set(k,[i]);}
   else welded++;
   map[i]=found;
  }
  index=index.map(i=>map[i]);
 }
 // Collapsed faces (a repeated corner) and exact duplicates (same three corners, either winding).
 const seen=new Set<string>();const kept:number[]=[];let facesDropped=0;
 for(let f=0;f<index.length;f+=3){
  const a=index[f],b=index[f+1],c=index[f+2];
  if(a===b||b===c||a===c){facesDropped++;continue;}
  const k=[a,b,c].sort((p,q)=>p-q).join('_');
  if(seen.has(k)){facesDropped++;continue;}
  seen.add(k);kept.push(a,b,c);
 }
 index=kept;
 // Remove vertices no face references anymore.
 const used=[...new Set(index)].sort((a,b)=>a-b);
 const remap=new Map<number,number>();const np:number[]=[];const nuv:number[]|undefined=uvs?[]:undefined;
 for(const i of used){
  remap.set(i,np.length/3);
  np.push(positions[i*3],positions[i*3+1],positions[i*3+2]);
  if(nuv)nuv.push(uvs![i*2],uvs![i*2+1]);
 }
 const vertsDropped=positions.length/3-used.length;
 positions=np;index=index.map(i=>remap.get(i)!);
 const w=unifyWinding(positions,index);index=w.index;
 const mesh:MeshData=nuv?{positions,index,uvs:nuv}:{positions,index};
 check(mesh);
 return{mesh,welded,facesDropped,vertsDropped,flipped:w.flipped};
}
/** Makes the winding consistent across shared edges inside each connected part, then flips closed parts with a negative signed volume (inside-out); open parts are only made consistent, never volume-flipped. Returns the new index. */
const unifyWinding=(positions:number[],src:number[]):{index:number[];flipped:number}=>{
 const index=[...src];
 const nf=index.length/3;
 const edgeKey=(a:number,b:number)=>a<b?`${a}_${b}`:`${b}_${a}`;
 const edgeFaces=new Map<string,number[]>();
 for(let f=0;f<nf;f++)for(let e=0;e<3;e++){
  const a=index[f*3+e],b=index[f*3+(e+1)%3];
  const k=edgeKey(a,b);const l=edgeFaces.get(k);if(l)l.push(f);else edgeFaces.set(k,[f]);
 }
 const traverses=(f:number,u:number,v:number)=>{for(let e=0;e<3;e++)if(index[f*3+e]===u&&index[f*3+(e+1)%3]===v)return true;return false;};
 const flip=(f:number)=>{const t=index[f*3+1];index[f*3+1]=index[f*3+2];index[f*3+2]=t;};
 const comp=new Array<number>(nf).fill(-1);let flipped=0,nc=0;
 for(let s=0;s<nf;s++){
  if(comp[s]>=0)continue;
  const queue=[s];comp[s]=nc;const faces:number[]=[];let closed=true;
  while(queue.length){
   const f=queue.pop()!;faces.push(f);
   for(let e=0;e<3;e++){
    const u=index[f*3+e],v=index[f*3+(e+1)%3];
    const sharers=edgeFaces.get(edgeKey(u,v))!;
    if(sharers.length!==2){closed=false;continue;} // boundary or non-manifold edge
    const g=sharers[0]===f?sharers[1]:sharers[0];
    if(comp[g]>=0)continue;
    if(traverses(f,u,v)===traverses(g,u,v))flip(g); // neighbours must run the shared edge opposite ways
    comp[g]=comp[s];queue.push(g);
   }
  }
  if(closed){
   let vol=0;
   for(const f of faces){const a=v3({positions} as MeshData,index[f*3]),b=v3({positions} as MeshData,index[f*3+1]),c=v3({positions} as MeshData,index[f*3+2]);vol+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
   // (signed volume x6 of the part relative to the origin)
   if(vol<0){for(const f of faces)flip(f);flipped++;}
  }
  nc++;
 }
 return{index,flipped};
};

/** Subdivides the mesh smoothly with the Loop scheme, 1-3 iterations (each multiplies triangles by four, capped by the edit size limits). Drops the sculpt mask like every topology-changing op. */
export function subdivideLoop(m:MeshData,iterations:number):MeshData{
 check(m);
 if(!Number.isInteger(iterations)||iterations<1||iterations>3)throw new EditError('Iterations must be a whole number between 1 and 3.');
 let cur:MeshData=m.uvs?{positions:[...m.positions],index:[...m.index],uvs:[...m.uvs]}:{positions:[...m.positions],index:[...m.index]};
 for(let k=0;k<iterations;k++){
  if(cur.index.length/3*4>MAX_EDIT_TRIANGLES)throw new EditError(`Subdividing would exceed ${MAX_EDIT_TRIANGLES.toLocaleString('en-US')} triangles.`);
  cur=loopOnce(cur);
 }
 return cur;
}

export function mirrorCombine(m:MeshData,axis:MirrorAxis,merge:number,bisect=false):MeshData{
 check(m);
 if(!Number.isFinite(merge)||merge<0||merge>1e6)throw new EditError('The mirror merge distance must be zero or a positive number.');
 if(bisect)m=bisectClip(m,axis);
 const ai=axis==='x'?0:axis==='y'?1:2;
 const nv=m.positions.length/3;
 const positions:number[]=[];const map=new Array<number>(nv);const uvs:number[]|undefined=m.uvs?[]:undefined;
 for(let i=0;i<nv;i++){
  const c=m.positions[i*3+ai];
  if(uvs)uvs.push(m.uvs![i*2],m.uvs![i*2+1]);
  if(Math.abs(c)<=merge){positions.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);positions[positions.length-3+ai]=0;map[i]=i;}
  else{positions.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);map[i]=-1;}
 }
 for(let i=0;i<nv;i++){
  if(map[i]!==-1)continue;
  const x=m.positions[i*3],y=m.positions[i*3+1],z=m.positions[i*3+2];
  map[i]=positions.length/3;
  positions.push(axis==='x'?-x:x,axis==='y'?-y:y,axis==='z'?-z:z);
  if(uvs)uvs.push(m.uvs![i*2],m.uvs![i*2+1]); // mirrored twin reuses the source UVs
 }
 const welded=new Set<number>();for(let i=0;i<nv;i++)if(map[i]===i&&Math.abs(m.positions[i*3+ai])<=merge)welded.add(i);
 const index=[...m.index];
 for(let f=0;f<m.index.length/3;f++){
  const va=m.index[f*3],vb=m.index[f*3+1],vc=m.index[f*3+2];
  if(welded.has(va)&&welded.has(vb)&&welded.has(vc))continue; // on-plane face: its mirror is the same triangle
  const a=map[va],b=map[vb],c=map[vc];
  if(a===b||b===c||a===c)continue; // face collapsed onto the plane
  index.push(a,c,b); // mirrored winding
 }
 const out:MeshData=uvs?{positions,index,uvs}:{positions,index};check(out);return out;
}

/** The normals toolbox operations. */
export type NormalsOp='flip'|'outside'|'smooth'|'flat'|'angle';
/** Reverses the winding of every face: the mesh points the other way. Explicit normals are negated so the shading style (flat/smooth/split) survives; UVs and mask are kept. */
export function flipMesh(m:MeshData):MeshData{
 check(m);
 const index:number[]=[];
 for(let f=0;f<m.index.length;f+=3)index.push(m.index[f],m.index[f+2],m.index[f+1]);
 const normals=m.normals?m.normals.map(n=>-n):undefined;
 return{...m,index,...(normals?{normals}:{})};
}
/** Recalculates orientation: consistent winding per connected part, closed parts flipped so their signed volume is positive (normals point outward). UVs and mask survive; explicit normals are dropped (the geometry rebuild recomputes them). */
export function outsideMesh(m:MeshData):{mesh:MeshData;flipped:number}{
 check(m);
 const w=unifyWinding(m.positions,m.index);
 const mesh:MeshData={positions:[...m.positions],index:w.index,...(m.uvs?{uvs:[...m.uvs]}:{}),...(m.mask?{mask:[...m.mask]}:{})};
 return{mesh,flipped:w.flipped};
}
/** Rebuilds normals by angle: corners of the same vertex share a smoothed normal while the angle between their face normals stays within the limit; harder edges split into separate vertices with their own normals (0 splits everything = flat, 180 shares everything = smooth). UV seams survive automatically because seam twins are different vertices. Positions never move. Drops the sculpt mask. */
export function smoothMesh(m:MeshData,angleDeg:number):MeshData{
 check(m);
 if(!Number.isFinite(angleDeg)||angleDeg<0||angleDeg>180)throw new EditError('The smooth angle must be a number between 0 and 180 degrees.');
 const nt=m.index.length/3;
 const fn:[number,number,number][]=[];
 for(let f=0;f<nt;f++)fn.push(faceNormal(m,f));
 // Corner angles weight the average: a cube corner touched by two triangles of the same quad
 // face must not count that face twice (angle-weighted normals, like DCC tools).
 const wa:number[]=new Array(nt*3);
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e]*3,b=m.index[f*3+(e+1)%3]*3,c=m.index[f*3+(e+2)%3]*3;
  const ux=m.positions[b]-m.positions[a],uy=m.positions[b+1]-m.positions[a+1],uz=m.positions[b+2]-m.positions[a+2];
  const vx=m.positions[c]-m.positions[a],vy=m.positions[c+1]-m.positions[a+1],vz=m.positions[c+2]-m.positions[a+2];
  const lu=Math.hypot(ux,uy,uz)||1,lv=Math.hypot(vx,vy,vz)||1;
  wa[f*3+e]=Math.acos(Math.min(1,Math.max(-1,(ux*vx+uy*vy+uz*vz)/(lu*lv))));
 }
 const parent:number[]=Array.from({length:nt*3},(_,i)=>i);
 const find=(x:number)=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
 const union=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
 const cosLimit=Math.cos(angleDeg*Math.PI/180)-1e-9;
 // Edges are matched by POSITION, not vertex index: UV-seam twins (same position, different
 // UVs, split vertices) still smooth together, while their UVs stay split below. This is how
 // DCC tools shade across UV seams. True boundary and non-manifold edges never smooth.
 const nv=m.positions.length/3;
 const pk:string[]=[];
 for(let v=0;v<nv;v++)pk.push(`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`);
 const edges=new Map<string,{f:number;a:number;b:number}[]>();
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  const ka=pk[a],kb=pk[b];const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
  const rec={f,a,b};const l=edges.get(k);if(l)l.push(rec);else edges.set(k,[rec]);
 }
 for(const l of edges.values()){
  if(l.length!==2)continue; // boundary or non-manifold edge: no smoothing across it
  const[p,q]=l;
  const dot=fn[p.f][0]*fn[q.f][0]+fn[p.f][1]*fn[q.f][1]+fn[p.f][2]*fn[q.f][2];
  if(dot<cosLimit)continue; // harder than the limit: split
  for(const v of [p.a,p.b]){
   // Match endpoints by position: q's corner at this end may be a UV-seam twin (different vertex).
   let cs=-1,ct=-1;
   for(let e=0;e<3;e++){if(m.index[p.f*3+e]===v)cs=e;if(pk[m.index[q.f*3+e]]===pk[v])ct=e;}
   if(cs>=0&&ct>=0)union(p.f*3+cs,q.f*3+ct);
  }
 }
 // Output vertices split by (normal group, UV): twins keep their own UVs but share the
 // group's averaged normal, so UV seams survive smoothing.
 const acc=new Map<number,[number,number,number]>();
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const r=find(f*3+e),w=wa[f*3+e];let a=acc.get(r);if(!a){a=[0,0,0];acc.set(r,a);}
  a[0]+=fn[f][0]*w;a[1]+=fn[f][1]*w;a[2]+=fn[f][2]*w;
 }
 for(const a of acc.values()){const l=Math.hypot(a[0],a[1],a[2])||1;a[0]/=l;a[1]/=l;a[2]/=l;}
 const groups=new Map<string,number>();
 const positions:number[]=[];const normals:number[]=[];const uvs:number[]|undefined=m.uvs?[]:undefined;
 const index:number[]=[];
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const c=f*3+e,r=find(c),v=m.index[c];
  const uk=uvs?`|${Math.round(m.uvs![v*2]*1e6)},${Math.round(m.uvs![v*2+1]*1e6)}`:'';
  const gk=r+uk;let id=groups.get(gk);
  if(id===undefined){
   id=positions.length/3;groups.set(gk,id);
   positions.push(m.positions[v*3],m.positions[v*3+1],m.positions[v*3+2]);
   if(uvs)uvs.push(m.uvs![v*2],m.uvs![v*2+1]);
   const a=acc.get(r)!;normals.push(a[0],a[1],a[2]);
  }
  index.push(id);
 }
 const out:MeshData=uvs?{positions,index,uvs,normals}:{positions,index,normals};
 check(out);return out;
}

/** Splits a mesh into its connected parts, largest first. Connectivity matches edges by position, not vertex index: UV-seam twins and exactly touching surfaces count as one piece, only truly loose geometry separates. UVs, explicit normals and sculpt masks travel with their part. */
export function separateMesh(m:MeshData):MeshData[]{
 check(m);
 const nv=m.positions.length/3,nt=m.index.length/3;
 const parent:number[]=Array.from({length:nv},(_,i)=>i);
 const find=(x:number)=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
 const union=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
 for(let f=0;f<nt;f++){union(m.index[f*3],m.index[f*3+1]);union(m.index[f*3+1],m.index[f*3+2]);}
 const pk:string[]=[];
 for(let v=0;v<nv;v++)pk.push(`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`);
 const edges=new Map<string,number[]>();
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  const ka=pk[a],kb=pk[b];const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
  const l=edges.get(k);if(l){if(l[0]!==a||l[1]!==b)l.push(a,b);}else edges.set(k,[a,b]);
 }
 for(const l of edges.values())for(let i=2;i<l.length;i+=2){union(l[0],l[i]);union(l[1],l[i+1]);}
 const islands=new Map<number,number[]>();
 for(let f=0;f<nt;f++){
  const r=find(m.index[f*3]);const l=islands.get(r);if(l)l.push(f);else islands.set(r,[f]);
 }
 const groups=[...islands.values()].sort((a,b)=>b.length-a.length);
 return groups.map(faces=>{
  const map=new Map<number,number>();
  const positions:number[]=[];const index:number[]=[];
  const uvs:number[]|undefined=m.uvs?[]:undefined;
  const normals:number[]|undefined=m.normals?[]:undefined;
  const mask:number[]|undefined=m.mask?[]:undefined;
  for(const f of faces)for(let e=0;e<3;e++){
   const v=m.index[f*3+e];let id=map.get(v);
   if(id===undefined){
    id=positions.length/3;map.set(v,id);
    positions.push(m.positions[v*3],m.positions[v*3+1],m.positions[v*3+2]);
    if(uvs)uvs.push(m.uvs![v*2],m.uvs![v*2+1]);
    if(normals)normals.push(m.normals![v*3],m.normals![v*3+1],m.normals![v*3+2]);
    if(mask)mask.push(m.mask![v]);
   }
   index.push(id);
  }
  const out:MeshData={positions,index,...(uvs?{uvs}:{}),...(normals?{normals}:{}),...(mask?{mask}:{})};
  check(out);return out;
 });
}

/** Gives a surface real thickness: the original shifts outward, a flipped copy shifts inward and open borders get stitched side walls (offset -1 = fully inward, 0 = centered, 1 = fully outward). Face winding is kept consistent with the original surface, so inner walls of closed meshes point into the cavity. UVs travel with both skins; walls reuse the border UVs. Sculpt masks and explicit normals are dropped (rebuilt smooth). */
export function solidifyMesh(m:MeshData,thickness:number,offset:number):MeshData{
 check(m);
 if(!Number.isFinite(thickness)||thickness<=0||thickness>1e6)throw new EditError('The solidify thickness must be a positive number.');
 if(!Number.isFinite(offset)||offset<-1||offset>1)throw new EditError('The solidify offset must be between -1 and 1.');
 const nv=m.positions.length/3,nt=m.index.length/3;
 // Smooth per-vertex normals of the original surface, angle-weighted like smoothMesh.
 const nrm:number[]=new Array(nv*3).fill(0);
 for(let f=0;f<nt;f++){
  const n=faceNormal(m,f);
  for(let e=0;e<3;e++){
   const vi=m.index[f*3+e];
   const a=vi*3,b=m.index[f*3+(e+1)%3]*3,c=m.index[f*3+(e+2)%3]*3;
   const ux=m.positions[b]-m.positions[a],uy=m.positions[b+1]-m.positions[a+1],uz=m.positions[b+2]-m.positions[a+2];
   const vx=m.positions[c]-m.positions[a],vy=m.positions[c+1]-m.positions[a+1],vz=m.positions[c+2]-m.positions[a+2];
   const lu=Math.hypot(ux,uy,uz)||1,lv=Math.hypot(vx,vy,vz)||1;
   const w=Math.acos(Math.min(1,Math.max(-1,(ux*vx+uy*vy+uz*vz)/(lu*lv))));
   nrm[a]+=n[0]*w;nrm[a+1]+=n[1]*w;nrm[a+2]+=n[2]*w;
  }
 }
 // Twins (UV seams) must shift together or the inner skin rips open: average normals by position.
 const pkN=new Map<string,number[]>();
 for(let v=0;v<nv;v++){
  const k=`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`;
  const l=pkN.get(k);if(l)l.push(v);else pkN.set(k,[v]);
 }
 for(const l of pkN.values()){
  if(l.length<2)continue;
  let x=0,y=0,z=0;for(const v of l){x+=nrm[v*3];y+=nrm[v*3+1];z+=nrm[v*3+2];}
  for(const v of l){nrm[v*3]=x;nrm[v*3+1]=y;nrm[v*3+2]=z;}
 }
 for(let v=0;v<nv;v++){const l=Math.hypot(nrm[v*3],nrm[v*3+1],nrm[v*3+2])||1;nrm[v*3]/=l;nrm[v*3+1]/=l;nrm[v*3+2]/=l;}
 const outT=thickness*(offset+1)/2,inT=thickness*(1-offset)/2;
 const positions:number[]=new Array(nv*6);
 for(let v=0;v<nv;v++){
  const p=v*3;
  positions[p]=m.positions[p]+nrm[p]*outT;positions[p+1]=m.positions[p+1]+nrm[p+1]*outT;positions[p+2]=m.positions[p+2]+nrm[p+2]*outT;
  positions[nv*3+p]=m.positions[p]-nrm[p]*inT;positions[nv*3+p+1]=m.positions[p+1]-nrm[p+1]*inT;positions[nv*3+p+2]=m.positions[p+2]-nrm[p+2]*inT;
 }
 const uvs:number[]|undefined=m.uvs?new Array(nv*4):undefined;
 if(uvs)for(let v=0;v<nv*2;v++){uvs[v]=m.uvs![v];uvs[nv*2+v]=m.uvs![v];}
 const index:number[]=[];
 // All outer triangles first: the orientation pass below seeds on the first nt triangles.
 for(let f=0;f<nt;f++)index.push(m.index[f*3],m.index[f*3+1],m.index[f*3+2]); // outer skin keeps the original winding
 for(let f=0;f<nt;f++)index.push(m.index[f*3]+nv,m.index[f*3+2]+nv,m.index[f*3+1]+nv); // inner skin flipped
 // True borders: position-keyed edges used by exactly one original face (UV-seam twins are interior).
 const pk:string[]=[];
 for(let v=0;v<nv;v++)pk.push(`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`);
 const edgeUse=new Map<string,{a:number;b:number;n:number}>();
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  const ka=pk[a],kb=pk[b];const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
  const u=edgeUse.get(k);if(u)u.n++;else edgeUse.set(k,{a,b,n:1});
 }
 for(const u of edgeUse.values()){
  if(u.n!==1)continue;
  const a=u.a,b=u.b;
  index.push(a,b,b+nv, a,b+nv,a+nv); // side wall; the orientation pass below fixes any mismatch
 }
 // Orient every triangle consistently with the original outer skin: BFS over position-keyed
 // edges, a shared edge must be traversed in opposite directions by its two triangles.
 const qt=index.length/3;
 // Adjacency keys come from the NEW positions: outer and inner skins sit at different offsets.
 const pko=(v:number)=>`${Math.round(positions[v*3]*1e6)},${Math.round(positions[v*3+1]*1e6)},${Math.round(positions[v*3+2]*1e6)}`;
 const tEdges=new Map<string,{t:number;a:number;b:number}[]>();
 for(let t=0;t<qt;t++)for(let e=0;e<3;e++){
  const a=index[t*3+e],b=index[t*3+(e+1)%3];
  const ka=pko(a),kb=pko(b);const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
  const rec={t,a,b};const l=tEdges.get(k);if(l)l.push(rec);else tEdges.set(k,[rec]);
 }
 const flip=(t:number)=>{for(let f=0;f<1;f++){const tmp=index[t*3+1];index[t*3+1]=index[t*3+2];index[t*3+2]=tmp;}};
 const seen=new Array<boolean>(qt).fill(false);
 const queue:number[]=[];
 for(let t=0;t<nt;t++){seen[t]=true;queue.push(t);} // original outer skin is the reference
 for(let qi=0;qi<queue.length;qi++){
  const t=queue[qi];
  for(let e=0;e<3;e++){
   const a=index[t*3+e],b=index[t*3+(e+1)%3];
   const ka=pko(a),kb=pko(b);const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
   const l=tEdges.get(k)!;if(l.length!==2)continue;
   const other=l[0].t===t?l[1]:l[0];
   if(seen[other.t])continue;
   // The neighbour must traverse this edge as (b,a). It currently stores (other.a,other.b).
   if(other.a===a&&other.b===b)flip(other.t);
   seen[other.t]=true;queue.push(other.t);
  }
 }
 const out:MeshData=uvs?{positions,index,uvs}:{positions,index};
 check(out);return out;
}

/** Caps open borders: every border loop (position-keyed edges used by exactly one face) gets a centroid fan wound consistently with the surface that owns the border. Returns the filled mesh and how many holes were capped. UVs travel with the border, the cap centre averages them; sculpt masks and explicit normals are dropped (rebuilt smooth). */
export function fillHolesMesh(m:MeshData):{mesh:MeshData;holes:number}{
 check(m);
 const nv=m.positions.length/3,nt=m.index.length/3;
 const pk:string[]=[];
 for(let v=0;v<nv;v++)pk.push(`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`);
 const use=new Map<string,{a:number;b:number;n:number}>();
 for(let f=0;f<nt;f++)for(let e=0;e<3;e++){
  const a=m.index[f*3+e],b=m.index[f*3+(e+1)%3];
  const ka=pk[a],kb=pk[b];const k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
  const u=use.get(k);if(u)u.n++;else use.set(k,{a,b,n:1});
 }
 const borders=[...use.values()].filter(u=>u.n===1);
 if(!borders.length)throw new EditError('The mesh has no open borders to fill.');
 const byStart=new Map<string,number[]>();
 borders.forEach((u,i)=>{const l=byStart.get(pk[u.a]);if(l)l.push(i);else byStart.set(pk[u.a],[i]);});
 const used=new Array<boolean>(borders.length).fill(false);
 const loops:{a:number;b:number}[][]=[];
 for(let i=0;i<borders.length;i++){
  if(used[i])continue;
  const loop:{a:number;b:number}[]=[];
  let cur=i;
  while(true){
   used[cur]=true;loop.push(borders[cur]);
   const end=pk[borders[cur].b];
   if(end===pk[borders[i].a])break;
   const next=(byStart.get(end)||[]).find(x=>!used[x]);
   if(next===undefined)throw new EditError('An open border is too tangled to fill (a border vertex is not manifold).');
   cur=next;
  }
  if(loop.length>=3)loops.push(loop);
 }
 if(!loops.length)throw new EditError('An open border is too tangled to fill (a border vertex is not manifold).');
 const positions=[...m.positions];
 const uvs=m.uvs?[...m.uvs]:undefined;
 const index=[...m.index];
 for(const loop of loops){
  let cx=0,cy=0,cz=0,cu=0,cv=0;
  for(const e of loop){cx+=m.positions[e.a*3];cy+=m.positions[e.a*3+1];cz+=m.positions[e.a*3+2];if(uvs){cu+=m.uvs![e.a*2];cv+=m.uvs![e.a*2+1];}}
  const n=loop.length;
  const c=positions.length/3;
  positions.push(cx/n,cy/n,cz/n);
  if(uvs)uvs.push(cu/n,cv/n);
  // The surface traverses each border edge a->b, so the cap traverses it b->a.
  for(const e of loop)index.push(e.b,e.a,c);
 }
 const out:MeshData=uvs?{positions,index,uvs}:{positions,index};
 check(out);return{mesh:out,holes:loops.length};
}
