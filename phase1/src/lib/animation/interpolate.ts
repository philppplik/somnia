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
 return a.interp==='hold'?a.v:mix(a.v,b.v,segmentProgress(a,b,t));
}
