import {evaluateMod} from './modifiers';
import {worldMatrix,type Matrix} from './scene';
import {MAX_LAYER_MASKS,findComp,findLayer,newId,type AnimationDocument,type Composition,type Layer,type LayerMask,type LayerMatte} from './model';
import type {Edit} from './edit';
const num=(n:number)=>String(Math.round(n*1e4)/1e4);
/** SVG path of a mask shape; with `invert` an outer frame is added so the even-odd rule selects everything outside the shape. */
export function maskPath(m:LayerMask,frame:{x:number;y:number;w:number;h:number}):string{
 const {x,y,width:w,height:h}=m;
 const shape=m.shape==='rect'?`M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`
  :`M${num(x)} ${num(y+h/2)}a${num(w/2)} ${num(h/2)} 0 1 0 ${num(w)} 0a${num(w/2)} ${num(h/2)} 0 1 0 ${num(-w)} 0Z`;
 return m.invert?`M${num(frame.x)} ${num(frame.y)}h${num(frame.w)}v${num(frame.h)}h${num(-frame.w)}Z${shape}`:shape;
}
export type LayerBody=(layer:Layer,index:number)=>string;
/** Mask and matte reference ids (prefix keeps viewer and export documents apart). */
export const maskId=(p:string,i:number)=>`${p}lmask-${i}`;
export const matteId=(p:string,i:number)=>`${p}lmatte-${i}`;
export const hasMasks=(l:Layer)=>!!l.masks?.length;
/** <defs> content for every mask and track matte of the composition at `tick`. `body` renders a layer's content (effects and fills included) in its own space. */
export function maskDefs(comp:Composition,tick:number,prefix:string,body:LayerBody):string{
 const W=comp.width,H=comp.height,frame={x:-W,y:-H,w:3*W,h:3*H},solo=comp.layers.some(l=>l.solo);
 return comp.layers.map((l,i)=>{
  let out='';
  if(l.masks?.length){
   const first=l.masks[0].mode==='add'?'#000':'#fff';
   const shapes=l.masks.map((m,j)=>{
    const f=m.feather>0?` filter="url(#${prefix}lmaskf-${i}-${j})"`:'';
    return `<path d="${maskPath(m,frame)}" fill="${m.mode==='add'?'#fff':'#000'}" fill-rule="evenodd"${f}/>`;}).join('');
   const filters=l.masks.map((m,j)=>m.feather>0?`<filter id="${prefix}lmaskf-${i}-${j}" filterUnits="userSpaceOnUse" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${num(m.feather)}"/></filter>`:'').join('');
   out+=`${filters}<mask id="${maskId(prefix,i)}" maskUnits="userSpaceOnUse" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}"><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="${first}"/>${shapes}</mask>`;
  }
  if(l.matte){
   const si=comp.layers.findIndex(x=>x.id===l.matte!.source),src=comp.layers[si];
   if(src){
    const live=src.visible&&(!solo||src.solo||l.solo)&&tick>=src.inT+src.offset&&tick<src.outT+src.offset;
    const m:Matrix=worldMatrix(comp,src,tick),op=Math.min(1,Math.max(0,(evaluateMod(src.transform.opacity,tick) as number)/100));
    const content=live?`<g transform="matrix(${m.map(num).join(' ')})" opacity="${num(op)}">${body(src,si)}</g>`:'';
    const {mode,invert}=l.matte;
    const full=`x="0" y="0" width="${W}" height="${H}"`;
    const inv=(rows:string)=>`<filter id="${matteId(prefix,i)}-inv" filterUnits="userSpaceOnUse" ${full} color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${rows}"/></filter>`;
    if(mode==='alpha'&&!invert)out+=`<mask id="${matteId(prefix,i)}" maskUnits="userSpaceOnUse" ${full} mask-type="alpha">${content}</mask>`;
    else if(mode==='alpha')out+=`${inv('0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -1 1')}<mask id="${matteId(prefix,i)}" maskUnits="userSpaceOnUse" ${full}><g filter="url(#${matteId(prefix,i)}-inv)"><rect ${full} fill="none"/>${content}</g></mask>`;
    else if(!invert)out+=`<mask id="${matteId(prefix,i)}" maskUnits="userSpaceOnUse" ${full}><rect ${full} fill="#000"/>${content}</mask>`;
    else out+=`${inv('-1 0 0 0 1 0 -1 0 0 1 0 0 -1 0 1 0 0 0 0 1')}<mask id="${matteId(prefix,i)}" maskUnits="userSpaceOnUse" ${full}><g filter="url(#${matteId(prefix,i)}-inv)"><rect ${full} fill="#000"/>${content}</g></mask>`;
   }
  }
  return out;
 }).join('');
}
export type MaskPatch=Partial<Omit<LayerMask,'id'>>;
export type MaskOp=
 |{op:'add';id?:string}
 |{op:'remove';mask:string}
 |{op:'update';mask:string;patch:MaskPatch};
/** A starter mask covering the middle half of the layer's source box (or composition when the layer has none). */
export function defaultMask(l:Layer,comp:Composition,id=newId('mask')):LayerMask{
 const w=l.source.width??comp.width,h=l.source.height??comp.height;
 return {id,shape:'ellipse',mode:'add',x:Math.round(w/4),y:Math.round(h/4),width:Math.max(1,Math.round(w/2)),height:Math.max(1,Math.round(h/2)),feather:0,invert:false};
}
export function maskEdit(doc:AnimationDocument,layerId:string,o:MaskOp):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');
 if(l.kind==='null'||l.kind==='audio')throw Error('Masks need a drawable layer.');
 const list=l.masks??[];const need=(id:string)=>{if(!list.some(m=>m.id===id))throw Error('Mask no longer exists.');};
 const set=(masks:readonly LayerMask[]):Edit=>({type:'layer.masks',layer:l.id,masks});
 switch(o.op){
  case 'add':if(list.length>=MAX_LAYER_MASKS)throw Error(`At most ${MAX_LAYER_MASKS} masks per layer.`);return set([...list,defaultMask(l,c,o.id)]);
  case 'remove':need(o.mask);return set(list.filter(m=>m.id!==o.mask));
  case 'update':need(o.mask);return set(list.map(m=>m.id===o.mask?{...m,...o.patch}:m));
 }
}
/** Track matte edit. `source: null` removes the matte. */
export function matteEdit(doc:AnimationDocument,layerId:string,source:string|null,mode:LayerMatte['mode']='alpha',invert=false):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');
 return {type:'layer.matte',layer:l.id,matte:source===null?null:{source,mode,invert}};
}
