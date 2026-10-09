/** Primitive shape builders. Every shape becomes an ordinary editable path (nodes + handles), nothing is parametric. */
import type {Point,Style,VectorNode,VectorPath} from '../vectorio';
/** Bezier circle constant. */
export const KAPPA=0.5522847498307936;
export type ShapeKind='rect'|'ellipse'|'line'|'polygon'|'star';
export const DEFAULT_SHAPE_STYLE:Partial<Style>={fill:'#6d5ef5',stroke:'#1f1b4d',strokeWidth:2};
let seq=0;
export const newId=(prefix='p')=>`${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
const node=(x:number,y:number,extra:Partial<VectorNode>={}):VectorNode=>({id:newId('n'),x,y,kind:'corner',...extra});
export interface ShapeBox{x:number;y:number;w:number;h:number}
export function normBox(a:Point,b:Point):ShapeBox{return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};}
export function rectPath(b:ShapeBox,radius=0,style:Partial<Style>=DEFAULT_SHAPE_STYLE):VectorPath{
 const r=Math.max(0,Math.min(radius,b.w/2,b.h/2)),{x,y,w,h}=b;
 if(r===0)return {id:newId(),closed:true,name:'Rectangle',style,nodes:[node(x,y),node(x+w,y),node(x+w,y+h),node(x,y+h)]};
 const k=r*(1-KAPPA);
 const nodes=[
  node(x+r,y,{out:undefined}),node(x+w-r,y,{out:{x:x+w-k,y}}),node(x+w,y+r,{in:{x:x+w,y:y+k}}),node(x+w,y+h-r,{out:{x:x+w,y:y+h-k}}),
  node(x+w-r,y+h,{in:{x:x+w-k,y:y+h}}),node(x+r,y+h,{out:{x:x+k,y:y+h}}),node(x,y+h-r,{in:{x,y:y+h-k}}),node(x,y+r,{out:{x,y:y+k}}),
 ];
 nodes[0].in={x:x+k,y};return {id:newId(),closed:true,name:'Rounded rectangle',style,nodes};}
export function ellipsePath(b:ShapeBox,style:Partial<Style>=DEFAULT_SHAPE_STYLE):VectorPath{
 const rx=b.w/2,ry=b.h/2,cx=b.x+rx,cy=b.y+ry,kx=rx*KAPPA,ky=ry*KAPPA;
 const nodes=[
  node(cx,cy-ry,{kind:'symmetric',in:{x:cx-kx,y:cy-ry},out:{x:cx+kx,y:cy-ry}}),
  node(cx+rx,cy,{kind:'symmetric',in:{x:cx+rx,y:cy-ky},out:{x:cx+rx,y:cy+ky}}),
  node(cx,cy+ry,{kind:'symmetric',in:{x:cx+kx,y:cy+ry},out:{x:cx-kx,y:cy+ry}}),
  node(cx-rx,cy,{kind:'symmetric',in:{x:cx-rx,y:cy+ky},out:{x:cx-rx,y:cy-ky}})];
 return {id:newId(),closed:true,name:'Ellipse',style,nodes};}
export function linePath(a:Point,b:Point,style:Partial<Style>={stroke:'#1f1b4d',strokeWidth:2,fill:'none',lineCap:'round'}):VectorPath{
 return {id:newId(),closed:false,name:'Line',style,nodes:[node(a.x,a.y),node(b.x,b.y)]};}
/** Regular polygon inscribed in the box ellipse, first vertex pointing up. */
export function polygonPath(b:ShapeBox,sides=6,style:Partial<Style>=DEFAULT_SHAPE_STYLE):VectorPath{
 const n=Math.max(3,Math.floor(sides)),cx=b.x+b.w/2,cy=b.y+b.h/2;
 const nodes=Array.from({length:n},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return node(cx+Math.cos(a)*b.w/2,cy+Math.sin(a)*b.h/2);});
 return {id:newId(),closed:true,name:'Polygon',style,nodes};}
export function starPath(b:ShapeBox,points=5,inner=0.5,style:Partial<Style>=DEFAULT_SHAPE_STYLE):VectorPath{
 const n=Math.max(3,Math.floor(points)),cx=b.x+b.w/2,cy=b.y+b.h/2,k=Math.min(0.95,Math.max(0.1,inner));
 const nodes=Array.from({length:n*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/n,f=i%2===0?1:k;return node(cx+Math.cos(a)*b.w/2*f,cy+Math.sin(a)*b.h/2*f);});
 return {id:newId(),closed:true,name:'Star',style,nodes};}
export function buildShape(kind:ShapeKind,a:Point,b:Point,opts:{radius?:number;sides?:number;points?:number}={}):VectorPath{
 const box=normBox(a,b);
 switch(kind){case 'rect':return rectPath(box,opts.radius??0);case 'ellipse':return ellipsePath(box);case 'line':return linePath(a,b);
  case 'polygon':return polygonPath(box,opts.sides??6);case 'star':return starPath(box,opts.points??5);}}
