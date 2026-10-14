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
