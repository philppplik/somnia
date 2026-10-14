import type {Layer,MaskPath,MaskPoint} from './model';
/** Path effects for path shape layers: zig zag (straight) and wave (smooth) ridges added along every segment. */
export type PathFx=NonNullable<Layer['pathFx']>;
export const PATH_FX_KINDS=['zigzag','wave'] as const;
export const DEFAULT_PATH_FX:PathFx={kind:'zigzag',size:12,ridges:4};
const r4=(n:number)=>Math.round(n*1e4)/1e4;
type V=readonly [number,number];
function cubic(a:MaskPoint,b:MaskPoint,u:number):V{
 const p0:V=[a.x,a.y],p1:V=[a.x+(a.outX??0),a.y+(a.outY??0)],p2:V=[b.x+(b.inX??0),b.y+(b.inY??0)],p3:V=[b.x,b.y],m=1-u;
 return [m*m*m*p0[0]+3*m*m*u*p1[0]+3*m*u*u*p2[0]+u*u*u*p3[0],m*m*m*p0[1]+3*m*m*u*p1[1]+3*m*u*u*p2[1]+u*u*u*p3[1]];
}
/** Points are in layer pixels. Original anchors stay where they are; interior samples alternate +size and -size along the normal. */
export function applyPathFx(p:MaskPath,fx:PathFx):MaskPath{
 const n=p.points.length;if(n<2||fx.size===0)return p;
 const segs=p.closed?n:n-1,sub=fx.ridges*2,out:MaskPoint[]=[];
 for(let i=0;i<segs;i++){
  const a=p.points[i],b=p.points[(i+1)%n];
  const pts:V[]=[];for(let k=0;k<=sub;k++)pts.push(cubic(a,b,k/sub));
  out.push({x:a.x,y:a.y});
  for(let k=1;k<sub;k++){
   const prev=pts[k-1],next=pts[k+1],tx=next[0]-prev[0],ty=next[1]-prev[1],len=Math.hypot(tx,ty)||1,nx=-ty/len,ny=tx/len,s=k%2?fx.size:-fx.size;
   const q:MaskPoint={x:r4(pts[k][0]+nx*s),y:r4(pts[k][1]+ny*s)};
   if(fx.kind==='wave'){const h=len/6;out.push({...q,inX:r4(-tx/len*h),inY:r4(-ty/len*h),outX:r4(tx/len*h),outY:r4(ty/len*h)});}else out.push(q);
  }
 }
 if(!p.closed)out.push({x:p.points[n-1].x,y:p.points[n-1].y});
 if(fx.kind==='wave')return {closed:p.closed,points:out.map((q,i)=>{if(q.inX!==undefined)return q;const nb=out[Math.min(out.length-1,i+1)],pv=out[Math.max(0,i-1)],tx=nb.x-pv.x,ty=nb.y-pv.y,len=Math.hypot(tx,ty)||1,h=len/6;return {...q,inX:r4(-tx/len*h),inY:r4(-ty/len*h),outX:r4(tx/len*h),outY:r4(ty/len*h)};})};
 return {closed:p.closed,points:out};
}
