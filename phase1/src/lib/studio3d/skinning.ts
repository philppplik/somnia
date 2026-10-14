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

/** Brush shapes for weight painting. */
export const BRUSH_FALLOFFS=['smooth','linear','constant'] as const;
export type BrushFalloff=typeof BRUSH_FALLOFFS[number];
export const BRUSH_MODES=['add','subtract','smooth'] as const;
export type BrushMode=typeof BRUSH_MODES[number];
export interface BrushSettings{/** Reach in the mesh's local units. */radius:number;/** Per-dab amount, 0..1. */strength:number;falloff:BrushFalloff;mode:BrushMode}
export const MIN_BRUSH_RADIUS=0.001,MAX_BRUSH_RADIUS=1000,MIN_BRUSH_STRENGTH=0.01,MAX_BRUSH_STRENGTH=1;
export function checkBrush(b:BrushSettings):BrushSettings{
 if(typeof b.radius!=='number'||!(b.radius>=MIN_BRUSH_RADIUS)||b.radius>MAX_BRUSH_RADIUS)throw new SkinError(`Brush radius must be between ${MIN_BRUSH_RADIUS} and ${MAX_BRUSH_RADIUS}.`);
 if(typeof b.strength!=='number'||!(b.strength>=MIN_BRUSH_STRENGTH)||b.strength>MAX_BRUSH_STRENGTH)throw new SkinError(`Brush strength must be between ${MIN_BRUSH_STRENGTH} and ${MAX_BRUSH_STRENGTH}.`);
 if(!(BRUSH_FALLOFFS as readonly string[]).includes(b.falloff))throw new SkinError(`Brush falloff must be one of ${BRUSH_FALLOFFS.join(', ')}.`);
 if(!(BRUSH_MODES as readonly string[]).includes(b.mode))throw new SkinError(`Brush mode must be one of ${BRUSH_MODES.join(', ')}.`);
 return b;
}
/** Brush factor at distance d: 1 at the centre, fading to 0 at the radius edge. */
export function brushFactor(d:number,radius:number,falloff:BrushFalloff):number{
 if(d>=radius)return 0;
 const t=d/radius;
 if(falloff==='constant')return 1;
 if(falloff==='linear')return 1-t;
 return 1-t*t*(3-2*t); // smoothstep edge
}
/** The slot of a bone in a vertex's influences, or -1. */
function slotOf(indices:Uint16Array,weights:Float32Array,o:number,bone:number):number{
 for(let k=0;k<MAX_INFLUENCES;k++)if(indices[o+k]===bone&&weights[o+k]>0)return k;
 return -1;
}
/** Keeps one vertex legal after a dab: the painted bone keeps its slot, at most four joints, weights in 0..1 summing to 1. Slots are compacted deterministically (weight desc, bone index asc). */
function normalizeVertex(indices:Uint16Array,weights:Float32Array,o:number,bone:number):void{
 const slot=slotOf(indices,weights,o,bone);
 if(slot>=0){
  const w=Math.min(1,Math.max(0,weights[o+slot]));weights[o+slot]=w;
  let sum=0;for(let k=0;k<MAX_INFLUENCES;k++)if(k!==slot)sum+=weights[o+k];
  if(sum>0){const f=(1-w)/sum;for(let k=0;k<MAX_INFLUENCES;k++)if(k!==slot)weights[o+k]*=f;}
  else for(let k=0;k<MAX_INFLUENCES;k++)if(k!==slot)weights[o+k]=0;
 }else{
  // The painted bone left the vertex: the survivors share the whole influence again.
  let sum=0;for(let k=0;k<MAX_INFLUENCES;k++)sum+=weights[o+k];
  if(sum>0)for(let k=0;k<MAX_INFLUENCES;k++)weights[o+k]/=sum;
 }
 const order=[0,1,2,3].sort((a,b)=>(weights[o+b]-weights[o+a])||(indices[o+a]-indices[o+b]));
 const ii=Array.from(indices.slice(o,o+MAX_INFLUENCES)),ww=Array.from(weights.slice(o,o+MAX_INFLUENCES));
 for(let k=0;k<MAX_INFLUENCES;k++){indices[o+k]=ww[order[k]]>0?ii[order[k]]:0;weights[o+k]=ww[order[k]];}
}
/** One brush dab at a centre point in the mesh's local space. Mutates the given attribute arrays in place and returns how many vertices the brush touched (0 when the dab missed). Deterministic. */
export function paintWeights(positions:ArrayLike<number>,indices:Uint16Array,weights:Float32Array,bone:number,center:readonly[number,number,number],brush:BrushSettings):number{
 checkBrush(brush);
 const count=Math.floor(positions.length/3);
 if(count*MAX_INFLUENCES>indices.length||count*MAX_INFLUENCES>weights.length)throw new SkinError('The skin attributes do not match the vertex count.');
 if(!Number.isInteger(bone)||bone<0||bone>65535)throw new SkinError('That bone cannot be painted.');
 const inRange:number[]=[],factor:number[]=[];
 for(let v=0;v<count;v++){
  const dx=positions[v*3]-center[0],dy=positions[v*3+1]-center[1],dz=positions[v*3+2]-center[2];
  const f=brushFactor(Math.sqrt(dx*dx+dy*dy+dz*dz),brush.radius,brush.falloff);
  if(f>0){inRange.push(v);factor.push(f*brush.strength);}
 }
 if(!inRange.length)return 0;
 if(brush.mode==='smooth'){
  // Blur towards the neighbourhood mean: the mean covers every bone present in the brush, so influences can spread to vertices that did not have them.
  const mean=new Map<number,number>();
  for(const v of inRange){const o=v*MAX_INFLUENCES;for(let k=0;k<MAX_INFLUENCES;k++)if(weights[o+k]>0)mean.set(indices[o+k],(mean.get(indices[o+k])??0)+weights[o+k]);}
  for(const [b,t] of mean)mean.set(b,t/inRange.length);
  for(let i=0;i<inRange.length;i++){
   const o=inRange[i]*MAX_INFLUENCES;
   const cur=new Map<number,number>();
   for(let k=0;k<MAX_INFLUENCES;k++)if(weights[o+k]>0)cur.set(indices[o+k],weights[o+k]);
   for(const b of new Set([...cur.keys(),...mean.keys()]))cur.set(b,(cur.get(b)??0)+((mean.get(b)??0)-(cur.get(b)??0))*factor[i]);
   const top=[...cur.entries()].filter(([,w])=>w>1e-12).sort((a,b)=>(b[1]-a[1])||(a[0]-b[0])).slice(0,MAX_INFLUENCES);
   let sum=0;for(const [,w]of top)sum+=w;
   for(let k=0;k<MAX_INFLUENCES;k++){if(k<top.length&&sum>0){indices[o+k]=top[k][0];weights[o+k]=top[k][1]/sum;}else{indices[o+k]=0;weights[o+k]=0;}}
  }
  return inRange.length;
 }
 for(let i=0;i<inRange.length;i++){
  const v=inRange[i],o=v*MAX_INFLUENCES;
  if(brush.mode==='add'){
   let slot=slotOf(indices,weights,o,bone);
   if(slot<0){
    for(let k=0;k<MAX_INFLUENCES;k++)if(weights[o+k]<=0){slot=k;break;}
    if(slot<0){let weak=0;for(let k=1;k<MAX_INFLUENCES;k++)if(weights[o+k]<weights[o+weak])weak=k;if(weights[o+weak]>factor[i])continue;slot=weak;}
    indices[o+slot]=bone;weights[o+slot]=0;
   }
   weights[o+slot]+=factor[i];
  }else{ // subtract
   const slot=slotOf(indices,weights,o,bone);
   if(slot<0)continue;
   weights[o+slot]=Math.max(0,weights[o+slot]-factor[i]);
  }
  normalizeVertex(indices,weights,o,bone);
 }
 return inRange.length;
}
