import {multiply,parseTransform,serializeTransform,fmt} from '../vectorio/matrix';
import type {Matrix} from '../vectorio/types';
export type {Matrix};
export const I:Matrix=[1,0,0,1,0,0];
export const mul=(...ms:Matrix[]):Matrix=>ms.reduce((a,b)=>multiply(a,b),I);
export const translate=(dx:number,dy:number):Matrix=>[1,0,0,1,dx,dy];
export const scaleAbout=(sx:number,sy:number,ax:number,ay:number):Matrix=>[sx,0,0,sy,ax-sx*ax,ay-sy*ay];
export const rotateAbout=(deg:number,cx:number,cy:number):Matrix=>{const r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return mul(translate(cx,cy),[c,s,-s,c,0,0],translate(-cx,-cy));};
export function invert(m:Matrix):Matrix{const det=m[0]*m[3]-m[1]*m[2];if(!det||!Number.isFinite(det))return I;return[m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];}
export const apply=(m:Matrix,x:number,y:number):{x:number;y:number}=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
export const isTranslateOnly=(m:Matrix)=>Math.abs(m[0]-1)<1e-9&&Math.abs(m[3]-1)<1e-9&&Math.abs(m[1])<1e-9&&Math.abs(m[2])<1e-9;
export interface AttrSource{tag:string;get(name:string):string|undefined}
const num=(v:string|undefined,d=0)=>{if(v===undefined)return d;const n=parseFloat(v);return Number.isFinite(n)?n:d;};
const f=(n:number)=>fmt(n,4);
const SHAPES_WITH_OWN_GEOMETRY=new Set(['rect','ellipse','circle','line']);
/**
 * Attribute changes that apply `delta` (given in root user space) to one element.
 * `parentToRoot` maps the element's parent coordinate system to root user space.
 * Simple shapes without a transform get new geometry attributes, everything else gets a transform.
 */
export function changesForDelta(el:AttrSource,delta:Matrix,parentToRoot:Matrix):Record<string,string|null>{
 const local=mul(invert(parentToRoot),delta,parentToRoot);
 const hadTransform=el.get('transform')!==undefined;
 const old=parseTransform(el.get('transform'))??I;
 const next=mul(local,old);
 return changesForMatrix(el,next,hadTransform);}
export function changesForMatrix(el:AttrSource,next:Matrix,hadTransform:boolean):Record<string,string|null>{
 const axis=Math.abs(next[1])<1e-9&&Math.abs(next[2])<1e-9&&next[0]>0&&next[3]>0;
 if(!hadTransform&&SHAPES_WITH_OWN_GEOMETRY.has(el.tag)){
  if(el.tag==='rect'&&axis){const x=num(el.get('x')),y=num(el.get('y')),w=num(el.get('width')),h=num(el.get('height'));
   const out:Record<string,string|null>={x:f(x*next[0]+next[4]),y:f(y*next[3]+next[5]),width:f(w*next[0]),height:f(h*next[3])};
   if(el.get('rx')!==undefined)out.rx=f(num(el.get('rx'))*next[0]);if(el.get('ry')!==undefined)out.ry=f(num(el.get('ry'))*next[3]);
   if(Math.abs(next[0]-1)<1e-9&&Math.abs(next[3]-1)<1e-9){delete out.width;delete out.height;delete out.rx;delete out.ry;}
   if(el.get('x')===undefined&&out.x==='0')delete out.x;if(el.get('y')===undefined&&out.y==='0')delete out.y;return out;}
  if(el.tag==='ellipse'&&axis)return{cx:f(num(el.get('cx'))*next[0]+next[4]),cy:f(num(el.get('cy'))*next[3]+next[5]),rx:f(num(el.get('rx'))*next[0]),ry:f(num(el.get('ry'))*next[3])};
  if(el.tag==='circle'&&axis&&Math.abs(next[0]-next[3])<1e-9)return{cx:f(num(el.get('cx'))*next[0]+next[4]),cy:f(num(el.get('cy'))*next[3]+next[5]),r:f(num(el.get('r'))*next[0])};
  if(el.tag==='line'){const a=apply(next,num(el.get('x1')),num(el.get('y1'))),b=apply(next,num(el.get('x2')),num(el.get('y2')));return{x1:f(a.x),y1:f(a.y),x2:f(b.x),y2:f(b.y)};}
 }
 const ident=Math.abs(next[0]-1)<1e-9&&Math.abs(next[3]-1)<1e-9&&Math.abs(next[1])<1e-9&&Math.abs(next[2])<1e-9&&Math.abs(next[4])<1e-9&&Math.abs(next[5])<1e-9;
 return{transform:ident?null:serializeTransform(next,4)};}
export interface Box{x:number;y:number;w:number;h:number}
export const unionBox=(bs:Box[]):Box|null=>{if(!bs.length)return null;const x0=Math.min(...bs.map(b=>b.x)),y0=Math.min(...bs.map(b=>b.y)),x1=Math.max(...bs.map(b=>b.x+b.w)),y1=Math.max(...bs.map(b=>b.y+b.h));return{x:x0,y:y0,w:x1-x0,h:y1-y0};};
export type Handle='nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w';
export const HANDLES:Handle[]=['nw','n','ne','e','se','s','sw','w'];
/** Scale matrix (root space) for dragging `handle` of `box` to point p. Shift keeps the ratio, alt scales from the centre. */
export function resizeDelta(box:Box,handle:Handle,p:{x:number;y:number},shift:boolean,alt:boolean):Matrix{
 const L=handle.includes('w'),R=handle.includes('e'),T=handle.includes('n'),B=handle.includes('s');
 const cx=box.x+box.w/2,cy=box.y+box.h/2;
 const ax=alt?cx:L?box.x+box.w:R?box.x:cx,ay=alt?cy:T?box.y+box.h:B?box.y:cy;
 const fx=alt?2:1;let sx=1,sy=1;
 if(L||R){const ref=L?box.x:box.x+box.w;const d0=ref-ax||1;sx=(p.x-ax)/d0;}
 if(T||B){const ref=T?box.y:box.y+box.h;const d0=ref-ay||1;sy=(p.y-ay)/d0;}
 void fx;
 if(shift&&(L||R)&&(T||B)){const s=Math.abs(sx)>Math.abs(sy)?sx:sy;sx=s;sy=s;}
 else if(shift&&(L||R)&&!(T||B)){sy=sx;}
 else if(shift&&(T||B)&&!(L||R)){sx=sy;}
 if(Math.abs(sx)<1e-3)sx=1e-3*(sx<0?-1:1);if(Math.abs(sy)<1e-3)sy=1e-3*(sy<0?-1:1);
 return scaleAbout(sx,sy,ax,ay);}
export type AlignKind='left'|'hcenter'|'right'|'top'|'vcenter'|'bottom';
export function alignDelta(b:Box,target:Box,k:AlignKind):Matrix{
 switch(k){case'left':return translate(target.x-b.x,0);case'right':return translate(target.x+target.w-(b.x+b.w),0);case'hcenter':return translate(target.x+target.w/2-(b.x+b.w/2),0);
  case'top':return translate(0,target.y-b.y);case'bottom':return translate(0,target.y+target.h-(b.y+b.h));default:return translate(0,target.y+target.h/2-(b.y+b.h/2));}}
