/** Convex hull of the selected edit-mesh vertices via the bundled three.js ConvexGeometry, returned as plain MeshData so editMesh stays three-free. */
import * as THREE from 'three';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';
import {EditError,MAX_EDIT_VERTICES,MAX_EDIT_TRIANGLES,type MeshData} from './editMesh';

/** Replaces the mesh with the convex hull of the selected vertices. Position-equal twins collapse to one hull vertex; UVs, masks and explicit normals are dropped (the hull is new topology). Hull faces point outward by construction. */
export function convexHullMesh(m:MeshData,verts:number[]):MeshData{
 if(!verts.length)throw new EditError('Select vertices for the convex hull.');
 const nv=m.positions.length/3;
 const seen=new Set<string>();const pts:THREE.Vector3[]=[];
 for(const v of verts){
  if(!Number.isInteger(v)||v<0||v>=nv)throw new EditError(`Vertex ${v} does not exist.`);
  const k=`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`;
  if(seen.has(k))continue;
  seen.add(k);
  pts.push(new THREE.Vector3(m.positions[v*3],m.positions[v*3+1],m.positions[v*3+2]));
 }
 if(pts.length<4)throw new EditError('The convex hull needs at least four selected vertices that span a volume.');
 let g:ConvexGeometry;
 try{g=new ConvexGeometry(pts);}catch{throw new EditError('The selected vertices need to span a non-flat volume for a convex hull.');}
 const pa=g.getAttribute('position');
 if(!pa||pa.count<3)throw new EditError('The selected vertices need to span a non-flat volume for a convex hull.');
 const map=new Map<string,number>();const positions:number[]=[];const index:number[]=[];
 for(let i=0;i<pa.count;i++){
  const x=pa.getX(i),y=pa.getY(i),z=pa.getZ(i);
  const k=`${Math.round(x*1e6)},${Math.round(y*1e6)},${Math.round(z*1e6)}`;
  let id=map.get(k);
  if(id===undefined){id=positions.length/3;map.set(k,id);positions.push(x,y,z);}
  index.push(id);
 }
 g.dispose();
 // Flat or degenerate input produces a zero-volume double-sided sheet; refuse it.
 let vol=0;
 for(let f=0;f<index.length;f+=3){
  const a=index[f]*3,b=index[f+1]*3,c=index[f+2]*3;
  vol+=(positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])-positions[a+1]*(positions[b]*positions[c+2]-positions[b+2]*positions[c])+positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c]))/6;
 }
 if(Math.abs(vol)<1e-9)throw new EditError('The selected vertices need to span a non-flat volume for a convex hull.');
 if(positions.length/3>MAX_EDIT_VERTICES||index.length/3>MAX_EDIT_TRIANGLES)throw new EditError('The convex hull is too large for the editor.');
 return {positions,index};
}
