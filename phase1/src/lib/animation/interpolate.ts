import type {Interp,Keyframe,PropValue,Property,Vec2} from './model';
/** Solve a CSS-style cubic-bezier(x1,y1,x2,y2) at progress x in [0,1]. Newton with bisection fallback; deterministic. */
export function cubicBezier(x1:number,y1:number,x2:number,y2:number,x:number):number{
 if(x<=0)return 0;if(x>=1)return 1;
 const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
 const sx=(t:number)=>((ax*t+bx)*t+cx)*t,sy=(t:number)=>((ay*t+by)*t+cy)*t,dx=(t:number)=>(3*ax*t+2*bx)*t+cx;
 let t=x;
 for(let i=0;i<8;i++){const e=sx(t)-x;if(Math.abs(e)<1e-7)return sy(t);const d=dx(t);if(Math.abs(d)<1e-6)break;t-=e/d;}
 let lo=0,hi=1;t=x;
 for(let i=0;i<40;i++){const e=sx(t);if(Math.abs(e-x)<1e-7)break;if(e<x)lo=t;else hi=t;t=(lo+hi)/2;}
 return sy(t);
}
const mix=(a:PropValue,b:PropValue,u:number):PropValue=>typeof a==='number'&&typeof b==='number'?a+(b-a)*u:[(a as Vec2)[0]+((b as Vec2)[0]-(a as Vec2)[0])*u,(a as Vec2)[1]+((b as Vec2)[1]-(a as Vec2)[1])*u] as Vec2;
export function segmentProgress(a:Keyframe,b:Keyframe,t:number):number{
 const u=(t-a.t)/(b.t-a.t);const i:Interp=a.interp;
 return i==='hold'?0:i==='linear'?u:cubicBezier(a.out[0],a.out[1],b.in[0],b.in[1],u);
}
/** Value of a property at integer tick `t`. Unanimated properties are constant; outside the key range values clamp. */
export function evaluate(p:Property,t:number):PropValue{
 const k=p.keys;if(!k.length)return p.value;
 if(t<=k[0].t)return k[0].v;
 const last=k[k.length-1];if(t>=last.t)return last.v;
 let lo=0,hi=k.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(k[m].t<=t)lo=m;else hi=m;}
 const a=k[lo],b=k[hi];
 if(a.interp==='hold')return a.v;
 const u=segmentProgress(a,b,t);
 if(hasSpatial(a,b))return spatialPoint(a,b,p.pathMode==='arcLength'?arcParameter(a,b,u):u);
 if(p.type==='vec2'&&(a.channelOut||b.channelIn)){const av=a.v as Vec2,bv=b.v as Vec2;return [0,1].map(ch=>{const out=a.channelOut?.[ch]??a.out,inn=b.channelIn?.[ch]??b.in;const progress=a.interp==='linear'?(t-a.t)/(b.t-a.t):cubicBezier(...out,...inn,(t-a.t)/(b.t-a.t));return av[ch]+(bv[ch]-av[ch])*progress;}) as unknown as Vec2;}
 return mix(a.v,b.v,u);
}
const ZERO:Vec2=[0,0];
/** True when the segment a to b is a spatial Bezier (a non-zero tangent on either side of a vec2 segment). */
export const hasSpatial=(a:Keyframe,b:Keyframe)=>typeof a.v!=='number'&&!!((a.sOut&&(a.sOut[0]||a.sOut[1]))||(b.sIn&&(b.sIn[0]||b.sIn[1])));
/** Cubic Bezier through key values `a` and `b` with tangents as offsets. `u` is the temporal progress, mapped straight onto the Bezier parameter (not arc length). */
export function spatialPoint(a:Keyframe,b:Keyframe,u:number):Vec2{
 const p0=a.v as Vec2,p3=b.v as Vec2,o=a.sOut??ZERO,i=b.sIn??ZERO;
 const p1:Vec2=[p0[0]+o[0],p0[1]+o[1]],p2:Vec2=[p3[0]+i[0],p3[1]+i[1]];const m=1-u;
 const w0=m*m*m,w1=3*m*m*u,w2=3*m*u*u,w3=u*u*u;
 return [w0*p0[0]+w1*p1[0]+w2*p2[0]+w3*p3[0],w0*p0[1]+w1*p1[1]+w2*p2[1]+w3*p3[1]];
}
/** Polyline of the spatial path of a vec2 property, `steps` samples per segment (including both end points). Segments with hold interpolation jump. */
export function samplePath(p:Property,steps=24):Vec2[]{
 const k=p.keys;if(p.type!=='vec2'||!k.length)return [];
 const out:Vec2[]=[k[0].v as Vec2];
 for(let i=0;i<k.length-1;i++){
  const a=k[i],b=k[i+1];
  if(a.interp==='hold'){out.push(a.v as Vec2,b.v as Vec2);continue;}
  if(!hasSpatial(a,b)){out.push(b.v as Vec2);continue;}
  for(let s=1;s<=steps;s++)out.push(spatialPoint(a,b,s/steps));
 }
 return out;
}

const arcCache=new WeakMap<Keyframe,WeakMap<Keyframe,{lengths:number[];total:number}>>();
/** Bounded 256-segment arc-length table, cached by immutable key identity. Temporal easing still controls distance. */
export function arcParameter(a:Keyframe,b:Keyframe,progress:number):number{
 if(progress<=0)return 0;if(progress>=1)return 1;
 let pairs=arcCache.get(a);if(!pairs){pairs=new WeakMap();arcCache.set(a,pairs);}
 let table=pairs.get(b);if(!table){const lengths=[0];let previous=spatialPoint(a,b,0),total=0;
  for(let i=1;i<=256;i++){const p=spatialPoint(a,b,i/256);total+=Math.hypot(p[0]-previous[0],p[1]-previous[1]);lengths.push(total);previous=p;}table={lengths,total};pairs.set(b,table);}
 if(table.total<1e-9)return progress;
 const target=progress*table.total;let lo=0,hi=256;while(hi-lo>1){const mid=(lo+hi)>>1;if(table.lengths[mid]<target)lo=mid;else hi=mid;}
 const span=table.lengths[hi]-table.lengths[lo];return (lo+(span>0?(target-table.lengths[lo])/span:0))/256;
}
