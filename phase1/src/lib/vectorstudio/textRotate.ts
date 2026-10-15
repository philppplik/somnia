import {textBox,type Point,type VectorText} from '../vectorio';
/** Distance of the rotation handle above the text box, in screen pixels. */
export const HANDLE_GAP_PX=22;
export const SNAP_DEGREES=15;
const rad=(d:number)=>d*Math.PI/180;
const turn=(t:Pick<VectorText,'x'|'y'>,p:Point,deg:number):Point=>({x:t.x+(p.x-t.x)*Math.cos(rad(deg))-(p.y-t.y)*Math.sin(rad(deg)),y:t.y+(p.x-t.x)*Math.sin(rad(deg))+(p.y-t.y)*Math.cos(rad(deg))});
/** The handle in the text's own (unrotated) frame: centred above the box. */
export function handleLocal(t:VectorText,zoom:number):Point{
 if(!(zoom>0))throw new RangeError('zoom must be positive');
 const b=textBox(t);return {x:(b.minX+b.maxX)/2,y:b.minY-HANDLE_GAP_PX/zoom};
}
/** The handle in document space (follows the current rotation). */
export const handlePoint=(t:VectorText,zoom:number):Point=>turn(t,handleLocal(t,zoom),t.rotation??0);
/** Rotation in degrees (-180..180, one decimal) that points the handle at `to`; `snap` rounds to 15 degree steps. */
export function rotationFor(t:VectorText,to:Point,zoom:number,snap=false):number{
 const h=handleLocal(t,zoom),a0=Math.atan2(h.y-t.y,h.x-t.x),a1=Math.atan2(to.y-t.y,to.x-t.x);
 if(![a0,a1].every(Number.isFinite))return t.rotation??0;
 let d=(a1-a0)*180/Math.PI;d=((d+180)%360+360)%360-180;
 if(snap)d=Math.round(d/SNAP_DEGREES)*SNAP_DEGREES;
 const r=Math.round(d*10)/10;return Object.is(r,-0)?0:r;
}
