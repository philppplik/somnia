/**
 * Slide shape geometry for selection and overlays (P2a). Pure and unit-tested; no DOM.
 * All input is EMU from the package model. Percent outputs are relative to the slide, so an
 * overlay positioned with them stays correct at any zoom or window size.
 */
import type {ShapeRef,ShapeBounds} from './deckPackage';
export interface SlideSize {cx:number;cy:number}
export interface OverlayRect {left:number;top:number;width:number;height:number;rotateDeg:number}
export type ShapeLimit='rotated'|'flipped'|'group'|'inherited'|'nested'|'noBounds'|'locked';
export const EMU_PER_PT=12700;
/** Rotation is stored in 1/60000 degree. */
export const rotationDeg=(b:Pick<ShapeBounds,'rot'>)=>((b.rot/60000)%360+360)%360;
/** Top-level shapes only: shapes inside a group are reachable through the group. */
export const selectableShapes=(shapes:readonly ShapeRef[])=>shapes.filter(s=>s.parentId===null);
export function limitsOf(s:ShapeRef):ShapeLimit[]{
  const out:ShapeLimit[]=[];
  if(s.parentId!==null)out.push('nested');
  if(s.kind==='group')out.push('group');
  if(!s.bounds)out.push('noBounds');
  else{
    if(s.bounds.source!=='slide')out.push('inherited');
    if(rotationDeg(s.bounds)!==0)out.push('rotated');
    if(s.bounds.flipH||s.bounds.flipV)out.push('flipped');
  }
  return out;
}
export function overlayRect(b:ShapeBounds,size:SlideSize):OverlayRect{
  return {left:b.x/size.cx*100,top:b.y/size.cy*100,width:b.w/size.cx*100,height:b.h/size.cy*100,rotateDeg:rotationDeg(b)};
}
/** True when the point (EMU, slide space) lies inside the shape's stored frame, rotation included. */
export function containsPoint(b:ShapeBounds,px:number,py:number):boolean{
  const cx=b.x+b.w/2,cy=b.y+b.h/2,a=-rotationDeg(b)*Math.PI/180;
  const dx=px-cx,dy=py-cy,rx=dx*Math.cos(a)-dy*Math.sin(a),ry=dx*Math.sin(a)+dy*Math.cos(a);
  return Math.abs(rx)<=b.w/2&&Math.abs(ry)<=b.h/2;
}
/** Topmost selectable shape at a point given as fractions (0..1) of the rendered slide. Later shapes draw on top. */
export function hitTest(shapes:readonly ShapeRef[],size:SlideSize,fx:number,fy:number):ShapeRef|null{
  if(!Number.isFinite(fx)||!Number.isFinite(fy)||fx<0||fy<0||fx>1||fy>1||!(size.cx>0)||!(size.cy>0))return null;
  const px=fx*size.cx,py=fy*size.cy,list=selectableShapes(shapes);
  for(let i=list.length-1;i>=0;i--){const b=list[i].bounds;if(b&&containsPoint(b,px,py))return list[i];}
  return null;
}
/** Next/previous in z-order (wraps). `null` current starts from the end/beginning. */
export function stepShape(shapes:readonly ShapeRef[],current:number|null,delta:1|-1):ShapeRef|null{
  const list=selectableShapes(shapes);if(!list.length)return null;
  const at=list.findIndex(s=>s.id===current);
  if(at<0)return delta===1?list[0]:list[list.length-1];
  return list[(at+delta+list.length)%list.length];
}

/* P2b: pure move/resize math in EMU. The UI converts pointer deltas with slide fractions, so zoom never matters here. */
export type Handle='n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se';
export const HANDLES:readonly Handle[]=['nw','n','ne','e','se','s','sw','w'];
export interface Box {x:number;y:number;w:number;h:number}
const MIN=127000;
const clamp=(v:number,lo:number,hi:number)=>Math.min(Math.max(v,lo),Math.max(lo,hi));
/** Moves a box by (dx,dy) keeping at least a 10 pt corner on the slide. */
export function moveBox(b:Box,dx:number,dy:number,size:SlideSize):Box{
  return {...b,x:Math.round(clamp(b.x+dx,MIN-b.w,size.cx-MIN)),y:Math.round(clamp(b.y+dy,MIN-b.h,size.cy-MIN))};
}
/** Drags one handle by (dx,dy). Edges stop at a 10 pt minimum size and at the slide edge (or where they already were). */
export function resizeBox(b:Box,handle:Handle,dx:number,dy:number,size:SlideSize):Box{
  let l=b.x,t=b.y,r=b.x+b.w,btm=b.y+b.h;
  if(handle.includes('w'))l=clamp(l+dx,Math.min(0,b.x),r-MIN);
  if(handle.includes('e'))r=clamp(r+dx,l+MIN,Math.max(size.cx,b.x+b.w));
  if(handle.includes('n'))t=clamp(t+dy,Math.min(0,b.y),btm-MIN);
  if(handle.includes('s'))btm=clamp(btm+dy,t+MIN,Math.max(size.cy,b.y+b.h));
  return {x:Math.round(l),y:Math.round(t),w:Math.round(r-l),h:Math.round(btm-t)};
}
export const boxOf=(b:{x:number;y:number;w:number;h:number}):Box=>({x:b.x,y:b.y,w:b.w,h:b.h});

/** Corner resize that keeps the aspect ratio (pictures). The opposite corner stays fixed. */
export function resizeBoxAspect(b:Box,handle:Handle,dx:number,dy:number,size:SlideSize):Box{
  if(handle.length!==2)return resizeBox(b,handle,dx,dy,size);
  const r=resizeBox(b,handle,dx,dy,size),sx=r.w/b.w,sy=r.h/b.h;
  let s=Math.abs(sx-1)>=Math.abs(sy-1)?sx:sy;
  s=Math.max(s,MIN/Math.min(b.w,b.h));s=Math.min(s,Math.max(size.cx,b.w)/b.w,Math.max(size.cy,b.h)/b.h);
  const w=Math.round(b.w*s),h=Math.round(b.h*s);
  return {x:handle.includes('w')?b.x+b.w-w:b.x,y:handle.includes('n')?b.y+b.h-h:b.y,w,h};
}

export type AlignMode='left'|'center'|'right'|'top'|'middle'|'bottom';
export const ALIGN_MODES:readonly AlignMode[]=['left','center','right','top','middle','bottom'];
/** Aligns a box to the slide edges or centre. Size never changes; boxes larger than the slide align to the near edge. */
export function alignBox(b:Box,mode:AlignMode,size:SlideSize):Box{
  const fit=(room:number,len:number,at:'start'|'mid'|'end')=>Math.max(0,Math.round(at==='start'?0:at==='mid'?(room-len)/2:room-len));
  switch(mode){
    case 'left':return {...b,x:0};
    case 'center':return {...b,x:fit(size.cx,b.w,'mid')};
    case 'right':return {...b,x:fit(size.cx,b.w,'end')};
    case 'top':return {...b,y:0};
    case 'middle':return {...b,y:fit(size.cy,b.h,'mid')};
    case 'bottom':return {...b,y:fit(size.cy,b.h,'end')};
  }
}
