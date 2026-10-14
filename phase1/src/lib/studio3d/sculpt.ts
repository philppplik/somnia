/** Sculpt brushes on plain mesh data - no three.js. One dab moves vertices around a centre; the stage snapshots a stroke and turns it into one undo step. */
import type {MeshData} from './editMesh';
export class SculptError extends Error{name='SculptError';}
export type SculptBrush='grab'|'smooth'|'inflate';
export type SculptSymmetry='none'|'x'|'y'|'z';
export type SculptFalloff='smooth'|'linear'|'constant';
export interface SculptOpts{brush:SculptBrush;radius:number;strength:number;falloff:SculptFalloff;/** Drag vector for grab, in world units. */delta?:[number,number,number];symmetry?:SculptSymmetry;}
const weight=(d:number,r:number,f:SculptFalloff):number=>{
 if(d>=r)return 0;
 if(f==='constant')return 1;
 const t=1-d/r;
 return f==='linear'?t:t*t*(3-2*t);
};
const mirror=(p:[number,number,number],s:SculptSymmetry):[number,number,number]=>s==='x'?[-p[0],p[1],p[2]]:s==='y'?[p[0],-p[1],p[2]]:s==='z'?[p[0],p[1],-p[2]]:p;
const mirrorDelta=(d:[number,number,number],s:SculptSymmetry):[number,number,number]=>s==='x'?[-d[0],d[1],d[2]]:s==='y'?[d[0],-d[1],d[2]]:s==='z'?[d[0],d[1],-d[2]]:d;
const dabAt=(m:MeshData,out:number[],center:[number,number,number],o:Required<SculptOpts>)=>{
 const{brush,radius,strength,falloff,delta}=o;
 for(let i=0;i<m.positions.length/3;i++){
  const x=out[i*3],y=out[i*3+1],z=out[i*3+2];
  const d=Math.hypot(x-center[0],y-center[1],z-center[2]);
  const w=weight(d,radius,falloff)*strength;
  if(!w)continue;
  if(brush==='grab'){out[i*3]+=delta[0]*w;out[i*3+1]+=delta[1]*w;out[i*3+2]+=delta[2]*w;}
 }
 if(brush==='smooth'){
  // Laplacian relax: pull every vertex toward the average of its neighbours.
  const nbs:number[][]=Array.from({length:m.positions.length/3},()=>[]);
  for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){
   const a=m.index[f+e],b=m.index[f+(e+1)%3];nbs[a].push(b);nbs[b].push(a);
  }
  for(let i=0;i<m.positions.length/3;i++){
   const x=out[i*3],y=out[i*3+1],z=out[i*3+2];
   const d=Math.hypot(x-center[0],y-center[1],z-center[2]);
   const w=weight(d,radius,falloff)*strength;
   if(!w||!nbs[i].length)continue;
   let ax=0,ay=0,az=0;for(const n of nbs[i]){ax+=out[n*3];ay+=out[n*3+1];az+=out[n*3+2];}
   ax/=nbs[i].length;ay/=nbs[i].length;az/=nbs[i].length;
   out[i*3]+= (ax-x)*w;out[i*3+1]+=(ay-y)*w;out[i*3+2]+=(az-z)*w;
  }
 }
 if(brush==='inflate'){
  // Vertex normals from the positions before this dab.
  const normals=new Array<number>(m.positions.length).fill(0);
  for(let f=0;f<m.index.length;f+=3){
   const[a,b,c]=[m.index[f],m.index[f+1],m.index[f+2]];
   const ux=m.positions[b*3]-m.positions[a*3],uy=m.positions[b*3+1]-m.positions[a*3+1],uz=m.positions[b*3+2]-m.positions[a*3+2];
   const vx=m.positions[c*3]-m.positions[a*3],vy=m.positions[c*3+1]-m.positions[a*3+1],vz=m.positions[c*3+2]-m.positions[a*3+2];
   const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
   for(const v of[a,b,c]){normals[v*3]+=nx;normals[v*3+1]+=ny;normals[v*3+2]+=nz;}
  }
  for(let i=0;i<m.positions.length/3;i++){
   const l=Math.hypot(normals[i*3],normals[i*3+1],normals[i*3+2])||1;
   const x=out[i*3],y=out[i*3+1],z=out[i*3+2];
   const d=Math.hypot(x-center[0],y-center[1],z-center[2]);
   const w=weight(d,radius,falloff)*strength;
   if(!w)continue;
   out[i*3]+=normals[i*3]/l*w*radius*0.2;out[i*3+1]+=normals[i*3+1]/l*w*radius*0.2;out[i*3+2]+=normals[i*3+2]/l*w*radius*0.2;
  }
 }
};
/** Applies one brush dab (plus its symmetry mirror) and returns the new mesh data. */
export function sculptDab(m:MeshData,center:[number,number,number],opts:SculptOpts):MeshData{
 if(!center.every(Number.isFinite))throw new SculptError('The brush centre is invalid.');
 if(!Number.isFinite(opts.radius)||opts.radius<=0||opts.radius>1e6)throw new SculptError('The brush radius must be a positive number.');
 if(!Number.isFinite(opts.strength)||opts.strength<=0||opts.strength>1)throw new SculptError('The brush strength must be between 0 and 1.');
 if(opts.brush==='grab'&&!(opts.delta&&opts.delta.every(Number.isFinite)))throw new SculptError('The grab brush needs a drag vector.');
 if(opts.brush!=='grab'&&opts.brush!=='smooth'&&opts.brush!=='inflate')throw new SculptError(`Unknown brush ${String(opts.brush)}.`);
 const symmetry=opts.symmetry??'none';
 const o:Required<SculptOpts>={brush:opts.brush,radius:opts.radius,strength:opts.strength,falloff:opts.falloff,delta:opts.delta??[0,0,0],symmetry};
 const out=[...m.positions];
 dabAt(m,out,center,o);
 if(symmetry!=='none')dabAt(m,out,mirror(center,symmetry),{...o,delta:mirrorDelta(o.delta,symmetry)});
 return{positions:out,index:[...m.index]};
}
