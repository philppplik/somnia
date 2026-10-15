import type {Point} from '../vectorio';
import {HANDLE_GAP_PX,SNAP_DEGREES} from './textRotate';
export interface BoundsXYWH{x:number;y:number;width:number;height:number}
export const centerOf=(b:BoundsXYWH):Point=>({x:b.x+b.width/2,y:b.y+b.height/2});
/** Rotation handle of a selection: centred above its bounds at a constant screen distance. */
export function selectionHandle(b:BoundsXYWH,zoom:number):Point{
 if(!(zoom>0))throw new RangeError('zoom must be positive');
 return {x:b.x+b.width/2,y:b.y-HANDLE_GAP_PX/zoom};
}
/** Degrees (-180..180, one decimal) to turn from the handle's start position to the pointer around `center`; `snap` rounds to 15 degree steps. A pointer on the centre or a non-finite one gives 0. */
export function angleAround(center:Point,handle:Point,to:Point,snap=false):number{
 const a0=Math.atan2(handle.y-center.y,handle.x-center.x),a1=Math.atan2(to.y-center.y,to.x-center.x);
 if(![a0,a1].every(Number.isFinite)||(to.x===center.x&&to.y===center.y))return 0;
 let d=(a1-a0)*180/Math.PI;d=((d+180)%360+360)%360-180;
 if(snap)d=Math.round(d/SNAP_DEGREES)*SNAP_DEGREES;
 const r=Math.round(d*10)/10;return Object.is(r,-0)?0:r;
}
/** Position of a point after turning `deg` around `center` (for drawing the handle during a drag). */
export function turnPoint(center:Point,p:Point,deg:number):Point{
 const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return {x:center.x+(p.x-center.x)*c-(p.y-center.y)*s,y:center.y+(p.x-center.x)*s+(p.y-center.y)*c};
}
