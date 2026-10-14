/** Mesh edit operations on plain position/index arrays - no three.js, so every op is testable in Node and the viewport stays the only three consumer. All meshes are indexed triangle lists. */
export class EditError extends Error{name='EditError';}
export interface MeshData{positions:number[];index:number[];/** Per-vertex sculpt mask 0..1 (1 = fully protected). Dropped by topology-changing ops. */mask?:number[];}
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
 const positions:number[]=[];const remap=new Map<number,number>();
 const keep=(i:number)=>{let n=remap.get(i);if(n===undefined){n=positions.length/3;remap.set(i,n);positions.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);if(Math.abs(m.positions[i*3+ai])<=EPS)positions[n*3+ai]=0;}return n;};
 const cross=new Map<string,number>();
 const cut=(x:number,y:number)=>{
  const k=x<y?`${x}_${y}`:`${y}_${x}`;let n=cross.get(k);
  if(n!==undefined)return n;
  const px=v3(m,x),py=v3(m,y);const dx=px[ai],dy=py[ai];const t=dx/(dx-dy);
  n=positions.length/3;cross.set(k,n);
  positions.push(px[0]+(py[0]-px[0])*t,px[1]+(py[1]-px[1])*t,px[2]+(py[2]-px[2])*t);
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
 const out={positions,index};
 if(!positions.length)throw new EditError('Nothing remains on the positive side of the mirror plane.');
 check(out);return out;
}
export function mirrorCombine(m:MeshData,axis:MirrorAxis,merge:number,bisect=false):MeshData{
 check(m);
 if(!Number.isFinite(merge)||merge<0||merge>1e6)throw new EditError('The mirror merge distance must be zero or a positive number.');
 if(bisect)m=bisectClip(m,axis);
 const ai=axis==='x'?0:axis==='y'?1:2;
 const nv=m.positions.length/3;
 const positions:number[]=[];const map=new Array<number>(nv);
 for(let i=0;i<nv;i++){
  const c=m.positions[i*3+ai];
  if(Math.abs(c)<=merge){positions.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);positions[positions.length-3+ai]=0;map[i]=i;}
  else{positions.push(m.positions[i*3],m.positions[i*3+1],m.positions[i*3+2]);map[i]=-1;}
 }
 for(let i=0;i<nv;i++){
  if(map[i]!==-1)continue;
  const x=m.positions[i*3],y=m.positions[i*3+1],z=m.positions[i*3+2];
  map[i]=positions.length/3;
  positions.push(axis==='x'?-x:x,axis==='y'?-y:y,axis==='z'?-z:z);
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
 const out={positions,index};check(out);return out;
}
