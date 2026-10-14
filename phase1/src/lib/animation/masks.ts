import {evaluateMod} from './modifiers';
import {worldMatrix,type Matrix} from './scene';
import {EASE_IN,EASE_OUT,MAX_LAYER_MASKS,MAX_MASK_POINTS,findComp,findLayer,newId,type AnimationDocument,type Composition,type Layer,type LayerMask,type LayerMatte,type MaskPath,type MaskShapeKey,MAX_SHAPE_KEYS,type MaskProp,type MaskPoint,type PropValue,type Property,type Vec2} from './model';
import {evaluate} from './interpolate';
import {snapToFrame} from './time';
import {EASE_PRESETS,type EasePreset} from './graph';
import type {Edit} from './edit';
const num=(n:number)=>String(Math.round(n*1e4)/1e4);
/** A mask with every keyed property read at one tick. */
export function lerpPath(keys:readonly MaskShapeKey[],tick:number):MaskPath{
 if(tick<=keys[0].t)return keys[0].path;const last=keys[keys.length-1];if(tick>=last.t)return last.path;
 let i=0;while(keys[i+1].t<=tick)i++;const a=keys[i],b=keys[i+1],f=(tick-a.t)/(b.t-a.t),mix=(u=0,v=0)=>round(u+(v-u)*f);
 return {closed:a.path.closed,points:a.path.points.map((q,j)=>{const r=b.path.points[j];
  return {x:mix(q.x,r.x),y:mix(q.y,r.y),inX:mix(q.inX,r.inX),inY:mix(q.inY,r.inY),outX:mix(q.outX,r.outX),outY:mix(q.outY,r.outY)};})};
}
export function resolveMask(m:LayerMask,tick:number):LayerMask{
 if(m.shapeKeys?.length&&m.path)m={...m,path:lerpPath(m.shapeKeys,tick)};
 const a=m.anim;if(!a)return m;
 const pos=a.position?.keys.length?evaluate(a.position,tick) as Vec2:[m.x,m.y],size=a.size?.keys.length?evaluate(a.size,tick) as Vec2:[m.width,m.height];
 return {...m,x:pos[0],y:pos[1],width:Math.max(1,size[0]),height:Math.max(1,size[1]),
  feather:a.feather?.keys.length?Math.min(64,Math.max(0,evaluate(a.feather,tick) as number)):m.feather,
  opacity:a.opacity?.keys.length?Math.min(100,Math.max(0,evaluate(a.opacity,tick) as number)):m.opacity};
}
/** Path data of a bezier mask path moved by (dx, dy). Corners use straight handles. */
export function bezierPath(p:MaskPath,dx:number,dy:number):string{
 const pts=p.points,n=pts.length,pt=(q:MaskPoint)=>`${num(q.x+dx)} ${num(q.y+dy)}`;
 const seg=(a:MaskPoint,b:MaskPoint)=>`C${num(a.x+(a.outX??0)+dx)} ${num(a.y+(a.outY??0)+dy)} ${num(b.x+(b.inX??0)+dx)} ${num(b.y+(b.inY??0)+dy)} ${pt(b)}`;
 let d=`M${pt(pts[0])}`;for(let i=0;i<n-1;i++)d+=seg(pts[i],pts[i+1]);
 if(p.closed)d+=`${seg(pts[n-1],pts[0])}Z`;return d;
}
/** SVG path of a resolved mask; with `invert` an outer frame is added so the even-odd rule selects everything outside the shape. */
export function maskPath(m:LayerMask,frame:{x:number;y:number;w:number;h:number}):string{
 const {x,y,width:w,height:h}=m;
 const shape=m.shape==='path'&&m.path?bezierPath(m.path,x,y):m.shape==='rect'?`M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`
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
   const masks=l.masks.map(m=>resolveMask(m,tick));
   const first=masks[0].mode==='add'?'#000':'#fff';
   const shapes=masks.map((m,j)=>{
    const f=m.feather>0?` filter="url(#${prefix}lmaskf-${i}-${j})"`:'';const op=m.opacity!==undefined&&m.opacity<100?` fill-opacity="${num(m.opacity/100)}"`:'';
    return `<path d="${maskPath(m,frame)}" fill="${m.mode==='add'?'#fff':'#000'}"${op} fill-rule="evenodd"${f}/>`;}).join('');
   const filters=masks.map((m,j)=>m.feather>0?`<filter id="${prefix}lmaskf-${i}-${j}" filterUnits="userSpaceOnUse" x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${num(m.feather)}"/></filter>`:'').join('');
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
export type MaskPatch=Partial<Omit<LayerMask,'id'|'anim'|'path'>>;
export type MaskOp=
 |{op:'set';mask:string;prop:MaskProp;value:PropValue;t:number}
 |{op:'animate';mask:string;prop:MaskProp;on:boolean;t:number}
 |{op:'path';mask:string;points:readonly {x:number;y:number}[];closed:boolean;smooth:boolean}
 |{op:'keyMove';mask:string;prop:MaskProp|'path';from:number;to:number}
 |{op:'keyRemove';mask:string;prop:MaskProp|'path';t:number}
 |{op:'keyEase';mask:string;prop:MaskProp;t:number;preset:EasePreset}
 |{op:'box';mask:string;x:number;y:number;width:number;height:number;t:number}
 |{op:'point';mask:string;index:number;x:number;y:number;t?:number}
 |{op:'pen';mask:string;x:number;y:number;outX?:number;outY?:number;restart?:boolean}
 |{op:'close';mask:string}
 |{op:'handle';mask:string;index:number;which:'in'|'out';x:number;y:number;mirror:boolean;t?:number}
 |{op:'pathAnimate';mask:string;on:boolean;t:number}
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
  case 'update':need(o.mask);return set(list.map(m=>{if(m.id!==o.mask)return m;const n={...m,...o.patch};
   if(n.shape==='path'){if(!n.path)n.path=smoothPath(boxPoints(n),true,true);}else{delete n.path;delete n.shapeKeys;}return n;}));
  case 'path':{need(o.mask);if(o.points.length>MAX_MASK_POINTS)throw Error(`At most ${MAX_MASK_POINTS} path points.`);if(list.some(m=>m.id===o.mask&&m.shapeKeys?.length))throw Error('Remove the path animation before replacing the points.');return set(list.map(m=>m.id===o.mask?{...m,shape:'path',path:smoothPath(o.points,o.closed,o.smooth)}:m));}
  case 'keyMove':case 'keyRemove':case 'keyEase':{need(o.mask);
   return set(list.map(m=>m.id===o.mask?(o.op==='keyMove'?(o.prop==='path'?moveShapeKey(m,o.from,o.to,c):moveMaskKey(m,o.prop,o.from,o.to,c)):o.op==='keyRemove'?(o.prop==='path'?removeShapeKey(m,o.t):removeMaskKey(m,o.prop,o.t)):easeMaskKey(m,o.prop,o.t,o.preset)):m));}
  case 'box':{need(o.mask);const t=snapToFrame(o.t,c.fps);if(t<c.start||t>=c.start+c.duration)throw Error('Time is outside the composition.');
   return set(list.map(m=>m.id===o.mask?setMaskValue(setMaskValue(m,'position',[o.x,o.y],t),'size',[o.width,o.height],t):m));}
  case 'point':case 'handle':{need(o.mask);const t=o.t===undefined?undefined:frameT(o.t,c);
   return set(list.map(m=>m.id===o.mask?editPath(m,t,path=>{const q=path.points[o.index];if(!q)throw Error('Path point no longer exists.');
    return {...path,points:path.points.map((p,i)=>{if(i!==o.index)return p;
     if(o.op==='point')return {...p,x:round(o.x),y:round(o.y)};
     const sx=round(o.x),sy=round(o.y),mx=round(-o.x),my=round(-o.y);
     return o.which==='out'?{...p,outX:sx,outY:sy,...(o.mirror?{inX:mx,inY:my}:{})}:{...p,inX:sx,inY:sy,...(o.mirror?{outX:mx,outY:my}:{})};})};}):m));}
  case 'pen':{need(o.mask);return set(list.map(m=>{if(m.id!==o.mask)return m;
   const pt={x:round(o.x),y:round(o.y),...(o.outX!==undefined&&o.outY!==undefined&&Math.hypot(o.outX,o.outY)>=1?{outX:round(o.outX),outY:round(o.outY),inX:round(-o.outX),inY:round(-o.outY)}:{})};
   if(o.restart||m.shape!=='path'||!m.path){const {anim:_a,shapeKeys:_s,...rest}=m;return {...rest,shape:'path' as const,path:{closed:false,points:[pt]},...(m.anim?{anim:m.anim}:{})};}
   if(m.shapeKeys?.length)throw Error('Remove the path animation before adding points.');
   if(m.path.closed)throw Error('The path is closed.');if(m.path.points.length>=MAX_MASK_POINTS)throw Error(`At most ${MAX_MASK_POINTS} path points.`);
   return {...m,path:{...m.path,points:[...m.path.points,pt]}};}));}
  case 'close':{need(o.mask);return set(list.map(m=>{if(m.id!==o.mask)return m;if(!m.path||m.path.closed||m.path.points.length<3)throw Error('A closed path needs three points.');
   if(m.shapeKeys?.length)throw Error('Remove the path animation before closing the path.');return {...m,path:{...m.path,closed:true}};}));}
  case 'pathAnimate':{need(o.mask);const t=frameT(o.t,c);return set(list.map(m=>{if(m.id!==o.mask)return m;if(m.shape!=='path'||!m.path)throw Error('Only path masks can morph.');
   if(o.on){if(m.shapeKeys?.length)return m;return {...m,shapeKeys:[{t,path:m.path}]};}
   if(!m.shapeKeys?.length)return m;const {shapeKeys:_k,...rest}=m;return {...rest,path:lerpPath(m.shapeKeys,t)};}));}
  case 'set':case 'animate':{need(o.mask);const t=snapToFrame(o.t,c.fps);if(t<c.start||t>=c.start+c.duration)throw Error('Time is outside the composition.');
   return set(list.map(m=>m.id===o.mask?(o.op==='set'?setMaskValue(m,o.prop,o.value,t):animateMask(m,o.prop,o.on,t)):m));}
 }
}
/** Track matte edit. `source: null` removes the matte. */
export function matteEdit(doc:AnimationDocument,layerId:string,source:string|null,mode:LayerMatte['mode']='alpha',invert=false):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');
 return {type:'layer.matte',layer:l.id,matte:source===null?null:{source,mode,invert}};
}

const frameT=(t:number,c:Composition)=>{const s=snapToFrame(t,c.fps);if(s<c.start||s>=c.start+c.duration)throw Error('Time is outside the composition.');return s;};
/** Applies `fn` to the path: the static path, or the path key at `t` when the mask morphs (a key is added at `t` when none exists). */
function editPath(m:LayerMask,t:number|undefined,fn:(p:MaskPath)=>MaskPath):LayerMask{
 if(!m.path)throw Error('Mask has no path.');
 if(!m.shapeKeys?.length)return {...m,path:fn(m.path)};
 if(t===undefined)throw Error('A time is needed to edit an animated path.');
 const cur=lerpPath(m.shapeKeys,t),next=fn(cur),keys=[...m.shapeKeys.filter(k=>k.t!==t),{t,path:next}].sort((a,b)=>a.t-b.t);
 if(keys.length>MAX_SHAPE_KEYS)throw Error(`At most ${MAX_SHAPE_KEYS} path keys.`);return {...m,shapeKeys:keys};
}
/** Moves one path key to a free frame. */
export function moveShapeKey(m:LayerMask,from:number,to:number,comp:Composition):LayerMask{
 const ks=m.shapeKeys;if(!ks?.some(k=>k.t===from))throw Error('Key no longer exists.');const target=frameT(to,comp);
 if(target!==from&&ks.some(k=>k.t===target))throw Error('Another key already sits at that time.');
 return {...m,shapeKeys:ks.map(k=>k.t===from?{...k,t:target}:k).sort((a,b)=>a.t-b.t)};
}
/** Deletes a path key. The last key makes the path static with that key's shape. */
export function removeShapeKey(m:LayerMask,t:number):LayerMask{
 const ks=m.shapeKeys,k=ks?.find(x=>x.t===t);if(!ks||!k)throw Error('Key no longer exists.');
 if(ks.length>1)return {...m,shapeKeys:ks.filter(x=>x!==k)};const {shapeKeys:_k,...rest}=m;return {...rest,path:k.path};
}
const key=(t:number,v:PropValue)=>({t,v,interp:'linear' as const,out:EASE_OUT,in:EASE_IN});
const base=(m:LayerMask,prop:MaskProp):PropValue=>prop==='position'?[m.x,m.y]:prop==='size'?[m.width,m.height]:prop==='feather'?m.feather:m.opacity??100;
const isVec=(v:PropValue):v is Vec2=>Array.isArray(v);
function staticSet(m:LayerMask,prop:MaskProp,v:PropValue):LayerMask{
 if(prop==='position'&&isVec(v))return {...m,x:v[0],y:v[1]};if(prop==='size'&&isVec(v))return {...m,width:v[0],height:v[1]};
 if(prop==='feather'&&!isVec(v))return {...m,feather:v};if(prop==='opacity'&&!isVec(v))return {...m,opacity:v};
 throw Error('Value does not fit the mask property.');
}
/** Writes a value: a key at `t` when the property is animated, otherwise the static value. */
export function setMaskValue(m:LayerMask,prop:MaskProp,v:PropValue,t:number):LayerMask{
 const cur=m.anim?.[prop];if(!cur?.keys.length)return staticSet(m,prop,v);
 if(isVec(v)!==(cur.type==='vec2'))throw Error('Value does not fit the mask property.');
 return {...m,anim:{...m.anim,[prop]:{...cur,keys:[...cur.keys.filter(k=>k.t!==t),key(t,v)].sort((a,b)=>a.t-b.t)}}};
}
/** Turns keyframing on (one key at `t` with the current value) or off (static value becomes the value at `t`). */
export function animateMask(m:LayerMask,prop:MaskProp,on:boolean,t:number):LayerMask{
 const cur=m.anim?.[prop],type=prop==='position'||prop==='size'?'vec2' as const:'scalar' as const;
 if(on){if(cur?.keys.length)return m;const v=base(m,prop);return {...m,anim:{...m.anim,[prop]:{type,value:v,keys:[key(t,v)]} as Property}};}
 if(!cur?.keys.length)return m;const v=evaluate(cur,t),next=staticSet(m,prop,v);const anim={...m.anim};delete anim[prop];
 return {...next,anim:Object.keys(anim).length?anim:undefined};
}
const boxPoints=(m:LayerMask)=>[{x:0,y:0},{x:m.width,y:0},{x:m.width,y:m.height},{x:0,y:m.height}];
/** Catmull-Rom to bezier handles, deterministic. Corners when `smooth` is false. Open paths keep straight end handles. */
export function smoothPath(points:readonly {x:number;y:number}[],closed:boolean,smooth:boolean):MaskPath{
 const n=points.length;
 return {closed,points:points.map((q,i)=>{
  if(!smooth)return {x:q.x,y:q.y};
  const prev=points[closed?(i+n-1)%n:Math.max(0,i-1)],next=points[closed?(i+1)%n:Math.min(n-1,i+1)];
  const hx=(next.x-prev.x)/6,hy=(next.y-prev.y)/6;
  const first=!closed&&i===0,last=!closed&&i===n-1;
  return {x:q.x,y:q.y,...(first?{}:{inX:round(-hx),inY:round(-hy)}),...(last?{}:{outX:round(hx),outY:round(hy)})};
 })};
}
const round=(v:number)=>Math.round(v*1e4)/1e4;

const keysOf=(m:LayerMask,prop:MaskProp)=>{const p=m.anim?.[prop];if(!p?.keys.length)throw Error('Mask property has no keys.');return p;};
/** Moves one key to another frame. The target must be inside the composition and free. */
export function moveMaskKey(m:LayerMask,prop:MaskProp,from:number,to:number,comp:Composition):LayerMask{
 const p=keysOf(m,prop),target=snapToFrame(to,comp.fps),k=p.keys.find(x=>x.t===from);
 if(!k)throw Error('Key no longer exists.');
 if(target<comp.start||target>=comp.start+comp.duration)throw Error('Time is outside the composition.');
 if(target!==from&&p.keys.some(x=>x.t===target))throw Error('Another key already sits at that time.');
 return {...m,anim:{...m.anim,[prop]:{...p,keys:p.keys.map(x=>x===k?{...x,t:target}:x).sort((a,b)=>a.t-b.t)}}};
}
/** Deletes a key. The last key turns the property static with that key's value. */
export function removeMaskKey(m:LayerMask,prop:MaskProp,t:number):LayerMask{
 const p=keysOf(m,prop),k=p.keys.find(x=>x.t===t);if(!k)throw Error('Key no longer exists.');
 if(p.keys.length>1)return {...m,anim:{...m.anim,[prop]:{...p,keys:p.keys.filter(x=>x!==k)}}};
 const next=staticSet(m,prop,k.v),anim={...m.anim};delete anim[prop];return {...next,anim:Object.keys(anim).length?anim:undefined};
}
/** Applies an ease preset to the segment that starts at key `t`. */
export function easeMaskKey(m:LayerMask,prop:MaskProp,t:number,preset:EasePreset):LayerMask{
 const p=keysOf(m,prop),e=EASE_PRESETS[preset];if(!e)throw Error('Unknown ease preset.');if(!p.keys.some(x=>x.t===t))throw Error('Key no longer exists.');
 return {...m,anim:{...m.anim,[prop]:{...p,keys:p.keys.map(x=>x.t===t?{...x,interp:e.interp,...('out' in e?{out:e.out,in:e.in}:{})}:x)}}};
}
