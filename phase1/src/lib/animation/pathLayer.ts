import {findComp,findLayer,validSource,MAX_MASK_POINTS,MAX_SHAPE_KEYS,newId,type AnimationDocument,type Layer,type LayerMask,type MaskPath,type MaskPoint,type MaskShapeKey,type Property,type Vec2} from './model';
import {bezierPath,lerpPath,morphPath,morphProblem,MorphError,type MorphOpts} from './masks';
import {pathData} from '../interface/vectorCore';
import type {InterfacePath} from '../interface/schema';
import type {Edit} from './edit';
/** Shape layers with a path source: normalized (0..1 of the layer box) bezier points, optional morph keys. */
const r4=(n:number)=>Math.round(n*1e4)/1e4;
const scale=(p:MaskPath,w:number,h:number):MaskPath=>({closed:p.closed,points:p.points.map(q=>({x:q.x*w,y:q.y*h,...(q.inX!==undefined?{inX:q.inX*w,inY:(q.inY??0)*h}:{}),...(q.outX!==undefined?{outX:q.outX*w,outY:(q.outY??0)*h}:{})}))});
const norm=(p:MaskPath,w:number,h:number):MaskPath=>({closed:p.closed,points:p.points.map(q=>({x:r4(q.x/w),y:r4(q.y/h),...(q.inX!==undefined?{inX:r4(q.inX/w),inY:r4((q.inY??0)/h)}:{}),...(q.outX!==undefined?{outX:r4(q.outX/w),outY:r4((q.outY??0)/h)}:{})}))});
const box=(l:Layer)=>({w:Math.max(1,l.source.width??1),h:Math.max(1,l.source.height??1)});
const hasHandles=(p:MaskPath)=>p.points.some(q=>q.inX!==undefined||q.outX!==undefined||q.inY!==undefined||q.outY!==undefined);
/** SVG path data of a path shape layer at a composition tick. Plain polygons keep the legacy output byte for byte. */
export function layerPathD(l:Layer,tick:number):string{
 const s=l.source,p=s.path as MaskPath,{w,h}=box(l);
 if(!s.pathKeys?.length&&!hasHandles(p))return pathData(s.path as unknown as InterfacePath,s.width??1,s.height??1);
 const cur=s.pathKeys?.length?lerpPath(s.pathKeys,tick):p;return bezierPath(scale(cur,w,h),0,0);
}
export type PathLayerOp=
 |{op:'points';path:MaskPath}
 |{op:'animate';on:boolean;t?:number}
 |{op:'point';index:number;x:number;y:number;t?:number}
 |{op:'morphTo';other:string;t:number;opts?:MorphOpts};
const P=(key:string,en:string)=>new MorphError({key:`animation.morph.err.${key}`,en});
function target(doc:AnimationDocument,id:string){
 const c=findComp(doc),l=c&&findLayer(c,id);
 if(!c||!l)throw Error('Select a layer.');
 if(l.kind!=='shape'||l.source.shape!=='path'||!l.source.path)throw Error('Pick a path shape layer.');
 return {c,l};
}
const pm=(l:Layer,w:number,h:number,tick?:number):LayerMask=>({id:l.id,shape:'path',mode:'add',x:0,y:0,width:w,height:h,feather:0,invert:false,
 path:scale(l.source.pathKeys?.length&&tick!==undefined?lerpPath(l.source.pathKeys,tick):l.source.path as MaskPath,w,h),
 ...(l.source.pathKeys?.length?{shapeKeys:l.source.pathKeys.map(k=>({...k,path:scale(k.path,w,h)}))}:{})});
/** One `layer.update` edit for a path layer operation. Refusals are plain Errors, morph refusals MorphErrors. */
export function pathLayerEdit(doc:AnimationDocument,layerId:string,o:PathLayerOp):Edit{
 const {c,l}=target(doc,layerId),s=l.source,keys=s.pathKeys,{w,h}=box(l),upd=(source:Partial<typeof s>):Edit=>({type:'layer.update',layer:l.id,source});
 const frame=(t?:number)=>{if(t===undefined||!Number.isInteger(t))throw Error('A time is needed to edit an animated path.');return t;};
 switch(o.op){
  case 'points':{
   if(keys?.length)throw Error('Turn off path animation before replacing the points.');
   if(o.path.points.length>256)throw Error('At most 256 points.');return upd({path:o.path});}
  case 'animate':{
   if(o.on){if(keys?.length)return upd({});if(s.path!.points.length>MAX_MASK_POINTS)throw Error(`Animated paths have at most ${MAX_MASK_POINTS} points.`);
    return upd({pathKeys:[{t:c.start,path:s.path as MaskPath}]});}
   if(!keys?.length)return upd({});const cur=lerpPath(keys,o.t??c.start);return {type:'layer.update',layer:l.id,source:{path:cur,pathKeys:undefined}};}
  case 'point':{
   const t=keys?.length?frame(o.t):undefined,cur=keys?.length?lerpPath(keys,t!):s.path as MaskPath;
   if(!Number.isInteger(o.index)||o.index<0||o.index>=cur.points.length)throw Error('Point no longer exists.');
   const x=Math.min(1,Math.max(0,r4(o.x))),y=Math.min(1,Math.max(0,r4(o.y)));
   const next:MaskPath={closed:cur.closed,points:cur.points.map((q,i)=>i===o.index?{...q,x,y}:q)};
   if(!keys?.length)return upd({path:next});
   const nk:MaskShapeKey[]=[...keys.filter(k=>k.t!==t),{t:t!,path:next}].sort((a,b)=>a.t-b.t);
   if(nk.length>MAX_SHAPE_KEYS)throw Error(`At most ${MAX_SHAPE_KEYS} path keys.`);return upd({pathKeys:nk});}
  case 'morphTo':{
   if(o.other===l.id)throw P('sameLayer','Pick another layer to morph into.');
   const ol=findLayer(c,o.other);if(!ol||ol.kind!=='shape'||ol.source.shape!=='path'||!ol.source.path)throw P('notPathLayer','Pick another path shape layer.');
   if(s.path!.points.length>MAX_MASK_POINTS)throw new MorphError({key:'animation.morph.err.limit',en:`Animated paths have at most ${MAX_MASK_POINTS} points.`,params:{max:MAX_MASK_POINTS}});
   if(!Number.isInteger(o.t))throw Error('A time is needed.');
   const from=pm(l,w,h),to=pm(ol,w,h,o.t),why=morphProblem(from,to,o.opts);if(why)throw new MorphError(why);
   const res=morphPath(from,to,o.t,c,o.opts),nk=(res.shapeKeys??[]).map(k=>({...k,path:norm(k.path,w,h)}));
   const bad=nk.some(k=>k.path.points.some(q=>!(q.x>=-1e-6&&q.x<=1+1e-6&&q.y>=-1e-6&&q.y<=1+1e-6)));
   if(bad)throw P('outside','The morph would move points outside the layer box.');
   const clamped=nk.map(k=>({...k,path:{...k.path,points:k.path.points.map(q=>({...q,x:Math.min(1,Math.max(0,q.x)),y:Math.min(1,Math.max(0,q.y))}))}}));
   if(!validSource({...s,pathKeys:clamped}))throw P('outside','The morph would move points outside the layer box.');
   return upd({pathKeys:clamped});}
 }
}
/** Edit that turns a path mask into a shape layer placed over the mask, in the same parent. One layer.add, so one undo step. */
export function maskToLayerEdit(doc:AnimationDocument,layerId:string,maskId:string,id=newId('layer')):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId),m=l?.masks?.find(x=>x.id===maskId);
 if(!c||!l||!m)throw Error('Mask no longer exists.');
 if(m.shape!=='path'||!m.path)throw Error('Only path masks can become layers.');
 const all=[m.path,...(m.shapeKeys??[]).map(k=>k.path)].flatMap(p=>p.points);
 if(m.path.points.length>256)throw Error('At most 256 points.');
 const x0=Math.min(...all.map(q=>q.x)),x1=Math.max(...all.map(q=>q.x)),y0=Math.min(...all.map(q=>q.y)),y1=Math.max(...all.map(q=>q.y));
 const w=Math.max(1,Math.round(x1-x0)),h=Math.max(1,Math.round(y1-y0)),mv=(p:MaskPath):MaskPath=>norm({closed:p.closed,points:p.points.map(q=>({...q,x:q.x-x0,y:q.y-y0}))},w,h);
 const ox=m.x+x0,oy=m.y+y0,anchor:Property={...l.transform.anchor,value:(l.transform.anchor.value as Vec2).map((v,i)=>v-(i?oy:ox)) as unknown as Vec2,keys:l.transform.anchor.keys.map(k=>({...k,v:(k.v as Vec2).map((v,i)=>v-(i?oy:ox)) as unknown as Vec2}))};
 const keys=m.shapeKeys?.length&&m.path.points.length<=MAX_MASK_POINTS?m.shapeKeys.map(k=>({...k,path:mv(k.path)})):undefined;
 const source={shape:'path' as const,color:l.source.color??'#ff7a59',width:w,height:h,path:mv(m.path),...(keys?{pathKeys:keys}:{})};
 if(!validSource(source))throw Error('This mask cannot become a layer: its handles reach too far.');
 return {type:'layer.add',kind:'shape',id,over:{name:`${l.name} path`,source,transform:{...l.transform,anchor},parent:l.parent,inT:l.inT,outT:l.outT,offset:l.offset}};
}
