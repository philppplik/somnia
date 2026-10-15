/** Projects the selected edit-mesh vertices onto the closest surface point of a target mesh (shrinkwrap), plus an offset along the target normal. Uses three-mesh-bvh for the closest-point query; editMesh stays three-free. */
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {EditError,type MeshData} from './editMesh';

/** Moves every selected vertex to the nearest point of `target` (in world space, both meshes may carry any transform) plus `offset` along the target normal. Position-equal twins move together; the least-masked twin of a position sets the damping like in moveSelected. Topology, UVs and masks are carried. */
export function shrinkwrapMesh(m:MeshData,verts:number[],target:MeshData,editWorld:number[],targetWorld:number[],offset:number):MeshData{
 if(!verts.length)throw new EditError('Select vertices to shrinkwrap.');
 if(!Number.isFinite(offset)||Math.abs(offset)>1e6)throw new EditError('The shrinkwrap offset must be a finite number.');
 if(!target.index.length)throw new EditError('The shrinkwrap target has no surface.');
 const nv=m.positions.length/3;
 for(const v of verts){if(!Number.isInteger(v)||v<0||v>=nv)throw new EditError(`Vertex ${v} does not exist.`);}
 const geom=new THREE.BufferGeometry();
 geom.setAttribute('position',new THREE.Float32BufferAttribute([...target.positions],3));
 geom.setIndex([...target.index]);
 const bvh=new MeshBVH(geom);
 const eW=new THREE.Matrix4().fromArray(editWorld);
 const eWi=eW.clone().invert();
 const tW=new THREE.Matrix4().fromArray(targetWorld);
 const tWi=tW.clone().invert();
 const nM=new THREE.Matrix3().getNormalMatrix(tW);
 const pk=(v:number)=>`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`;
 const want=new Set(verts.map(pk));
 // One projection per unique position, then every twin moves together.
 const delta=new Map<string,[number,number,number]>();
 const damp=new Map<string,number>();
 const p=new THREE.Vector3(),hit=new THREE.Vector3(),n=new THREE.Vector3();
 for(let v=0;v<nv;v++){
  const k=pk(v);
  if(!want.has(k))continue;
  const mk=m.mask?m.mask[v]:0;
  damp.set(k,Math.min(damp.get(k)??mk,mk));
  if(delta.has(k))continue;
  p.set(m.positions[v*3],m.positions[v*3+1],m.positions[v*3+2]);
  const pw=p.clone().applyMatrix4(eW);
  const pl=pw.clone().applyMatrix4(tWi);
  const res=bvh.closestPointToPoint(pl,{point:hit,faceIndex:0,distance:0});if(!res)continue;
  const f=res.faceIndex*3;
  const ta=target.index[f]*3,tb=target.index[f+1]*3,tc=target.index[f+2]*3;
  const ux=target.positions[tb]-target.positions[ta],uy=target.positions[tb+1]-target.positions[ta+1],uz=target.positions[tb+2]-target.positions[ta+2];
  const vx=target.positions[tc]-target.positions[ta],vy=target.positions[tc+1]-target.positions[ta+1],vz=target.positions[tc+2]-target.positions[ta+2];
  n.set(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx).normalize().applyMatrix3(nM).normalize();
  const q=res.point.clone().applyMatrix4(tW).addScaledVector(n,offset).applyMatrix4(eWi);
  delta.set(k,[q.x-p.x,q.y-p.y,q.z-p.z]);
 }
 geom.dispose();
 const positions=[...m.positions];
 for(let v=0;v<nv;v++){
  const k=pk(v);const d=delta.get(k);if(!d)continue;
  const f=1-damp.get(k)!;if(f===0)continue;
  positions[v*3]+=d[0]*f;positions[v*3+1]+=d[1]*f;positions[v*3+2]+=d[2]*f;
 }
 const out:MeshData={positions,index:[...m.index],...(m.uvs?{uvs:[...m.uvs]}:{}),...(m.mask?{mask:[...m.mask]}:{})};
 return out;
}
