/** Auto-weights for binding a mesh to a bone chain, and rigid (nearest-bone) binds. Pure, no three.js, and deterministic: the same vertices and segments always give the same weights. */
import {MAX_BONES} from './skeleton';
export class SkinError extends Error{constructor(message:string){super(message);this.name='SkinError';}}
export const MAX_SKIN_VERTICES=250_000;
/** Bounds the O(vertices x bones) distance pass so a huge import cannot hang the tab. */
export const MAX_SKIN_OPS=8_000_000;
/** glTF allows at most four joints per vertex. */
export const MAX_INFLUENCES=4;
export interface BoneSegment{/** Joint position in the mesh's local space. */head:readonly[number,number,number];/** End of the bone's segment: towards its children, or a deterministic fallback for leaf joints. */tail:readonly[number,number,number]}
export interface SkinWeights{/** count*4 joint indices into the segment/bone list; unused slots are 0. */indices:Uint16Array;/** count*4 weights, each row summing to 1; unused slots are 0. */weights:Float32Array}
/** Squared distance from a point to a segment (a degenerate segment acts as a point). */
export function segmentDist2(px:number,py:number,pz:number,s:BoneSegment):number{
 const dx=s.tail[0]-s.head[0],dy=s.tail[1]-s.head[1],dz=s.tail[2]-s.head[2];
 const len2=dx*dx+dy*dy+dz*dz;
 let t=0;
 if(len2>0){t=((px-s.head[0])*dx+(py-s.head[1])*dy+(pz-s.head[2])*dz)/len2;t=t<0?0:t>1?1:t;}
 const cx=s.head[0]+dx*t-px,cy=s.head[1]+dy*t-py,cz=s.head[2]+dz*t-pz;
 return cx*cx+cy*cy+cz*cz;
}
function prepare(positions:ArrayLike<number>,segments:readonly BoneSegment[]):number{
 if(!segments.length)throw new SkinError('There are no bones to bind to.');
 if(segments.length>MAX_BONES)throw new SkinError(`${segments.length} bones are too many to bind; at most ${MAX_BONES} are supported.`);
 const count=Math.floor(positions.length/3);
 if(!count)throw new SkinError('The mesh has no vertices to skin.');
 if(count>MAX_SKIN_VERTICES)throw new SkinError(`The mesh has ${count} vertices; at most ${MAX_SKIN_VERTICES} can be skinned.`);
 if(count*segments.length>MAX_SKIN_OPS)throw new SkinError(`Skinning ${count} vertices against ${segments.length} bones is too heavy; reduce the mesh or the bone count.`);
 return count;
}
/** Smooth bind: every vertex takes up to four joints, weighted by inverse squared distance to their segments (quartic falloff). Ties go to the lower joint index, so the result never depends on iteration luck. */
export function smoothWeights(positions:ArrayLike<number>,segments:readonly BoneSegment[]):SkinWeights{
 const count=prepare(positions,segments);
 const indices=new Uint16Array(count*MAX_INFLUENCES),weights=new Float32Array(count*MAX_INFLUENCES);
 const EPS=1e-6;
 for(let v=0;v<count;v++){
  const px=positions[v*3],py=positions[v*3+1],pz=positions[v*3+2];
  // Fixed-size top-4 selection: w descending, bone index ascending on ties.
  const bi=[-1,-1,-1,-1],bw=[0,0,0,0];
  for(let b=0;b<segments.length;b++){
   const d2=segmentDist2(px,py,pz,segments[b]);const w=1/((d2+EPS)*(d2+EPS));
   for(let k=0;k<MAX_INFLUENCES;k++){
    if(w>bw[k]+1e-20||(Math.abs(w-bw[k])<=1e-20&&b<(bi[k]<0?Infinity:bi[k]))){
     for(let j=MAX_INFLUENCES-1;j>k;j--){bw[j]=bw[j-1];bi[j]=bi[j-1];}
     bw[k]=w;bi[k]=b;break;
    }
   }
  }
  let sum=0;for(const w of bw)sum+=w;
  for(let k=0;k<MAX_INFLUENCES;k++){indices[v*4+k]=bi[k]<0?0:bi[k];weights[v*4+k]=sum>0?bw[k]/sum:0;}
 }
 return{indices,weights};
}
/** Rigid bind: every vertex belongs fully to its nearest joint. The reset state for hand edits. */
export function rigidWeights(positions:ArrayLike<number>,segments:readonly BoneSegment[]):SkinWeights{
 const count=prepare(positions,segments);
 const indices=new Uint16Array(count*MAX_INFLUENCES),weights=new Float32Array(count*MAX_INFLUENCES);
 for(let v=0;v<count;v++){
  const px=positions[v*3],py=positions[v*3+1],pz=positions[v*3+2];
  let best=0,bestD=Infinity;
  for(let b=0;b<segments.length;b++){const d2=segmentDist2(px,py,pz,segments[b]);if(d2<bestD){bestD=d2;best=b;}}
  indices[v*4]=best;weights[v*4]=1;
 }
 return{indices,weights};
}
/** Deterministic heat colour for the weight preview: 0 is cold blue, 1 is hot red. */
export function weightColor(w:number):[number,number,number]{
 const x=Math.min(1,Math.max(0,w));
 // blue -> cyan -> green -> yellow -> red in four equal stops
 const stops:[number,number,number][]=[[0.15,0.25,1],[0,0.85,1],[0.1,0.85,0.15],[1,0.85,0],[1,0.15,0.1]];
 if(x<=0)return[...stops[0]];if(x>=1)return[...stops[stops.length-1]];
 const t=x*(stops.length-1),i=Math.min(stops.length-2,Math.floor(t)),f=t-i;
 return[stops[i][0]+(stops[i+1][0]-stops[i][0])*f,stops[i][1]+(stops[i+1][1]-stops[i][1])*f,stops[i][2]+(stops[i+1][2]-stops[i][2])*f];
}
