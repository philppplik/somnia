import type {LayerMask} from './model';
/** Geometry helpers for the on-canvas mask handles. Pure, so drag maths is testable without a DOM. */
export type BoxHandle='nw'|'ne'|'sw'|'se';
export interface Box{x:number;y:number;width:number;height:number}
const LIMIT=16384;
const r1=(n:number)=>Math.round(n*10)/10;
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
export const maskBox=(m:LayerMask):Box=>{
 if(m.shape!=='path'||!m.path)return {x:m.x,y:m.y,width:m.width,height:m.height};
 const xs=m.path.points.map(p=>p.x),ys=m.path.points.map(p=>p.y),x0=Math.min(...xs),y0=Math.min(...ys);
 return {x:m.x+x0,y:m.y+y0,width:Math.max(1,Math.max(...xs)-x0),height:Math.max(1,Math.max(...ys)-y0)};
};
/** Moves a box. Result stays within the supported range. */
export const moveBox=(b:Box,dx:number,dy:number):Box=>({...b,x:r1(clamp(b.x+dx,-LIMIT,LIMIT)),y:r1(clamp(b.y+dy,-LIMIT,LIMIT))});
/** Resizes by dragging one corner; the opposite corner stays fixed. Dragging past it stops at 1 px instead of flipping. */
export function resizeBox(b:Box,handle:BoxHandle,dx:number,dy:number):Box{
 const west=handle==='nw'||handle==='sw',north=handle==='nw'||handle==='ne';
 const right=b.x+b.width,bottom=b.y+b.height;
 let x=west?b.x+dx:b.x,w=west?b.width-dx:b.width+dx,y=north?b.y+dy:b.y,h=north?b.height-dy:b.height+dy;
 w=clamp(w,1,LIMIT);h=clamp(h,1,LIMIT);
 if(west)x=right-w;if(north)y=bottom-h;
 return {x:r1(clamp(x,-LIMIT,LIMIT)),y:r1(clamp(y,-LIMIT,LIMIT)),width:r1(w),height:r1(h)};
}
export const corners=(b:Box):Record<BoxHandle,[number,number]>=>({nw:[b.x,b.y],ne:[b.x+b.width,b.y],sw:[b.x,b.y+b.height],se:[b.x+b.width,b.y+b.height]});
