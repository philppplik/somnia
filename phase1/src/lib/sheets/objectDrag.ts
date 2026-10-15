import type {ObjectOp} from './protocol';
import type {Geometry} from './geometry';
/** A pointer drag of a picture or shape: pixel deltas from where it started. */
export interface ObjectDrag{key:string;mode:'move'|'resize';x0:number;y0:number;mx:number;my:number}
interface Boxed{id:number;row:number;col:number;dx:number;dy:number;width:number;height:number}
const r1=(n:number)=>Math.round(n*10)/10,clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
/** Turns a finished drag into one `place` operation: the new cell and offset (moves) or the new size (resizes). Pure; the bridge re-validates. */
export function dropPlacement(kind:'image'|'shape',o:Boxed,d:ObjectDrag,geo:Pick<Geometry,'colLeft'|'rowTop'|'colAt'|'rowAt'|'zoom'>):Extract<ObjectOp,{kind:'place'}>{
 const z=geo.zoom>0?geo.zoom:1;
 if(d.mode==='resize')return {kind:'place',object:kind,id:o.id,row:o.row,col:o.col,dx:o.dx,dy:o.dy,width:r1(clamp(o.width+d.mx/z,kind==='shape'?8:1,4000)),height:r1(clamp(o.height+d.my/z,kind==='shape'&&o.height>2?8:1,4000))};
 const x=Math.max(0,geo.colLeft(o.col)+o.dx*z+d.mx),y=Math.max(0,geo.rowTop(o.row)+o.dy*z+d.my),col=geo.colAt(x),row=geo.rowAt(y);
 return {kind:'place',object:kind,id:o.id,row,col,dx:r1(clamp((x-geo.colLeft(col))/z,0,100_000)),dy:r1(clamp((y-geo.rowTop(row))/z,0,100_000))};
}
