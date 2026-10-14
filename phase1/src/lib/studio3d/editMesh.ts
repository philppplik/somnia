/** Mesh edit operations on plain position/index arrays - no three.js, so every op is testable in Node and the viewport stays the only three consumer. All meshes are indexed triangle lists. */
export class EditError extends Error{name='EditError';}
export interface MeshData{positions:number[];index:number[];}
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
