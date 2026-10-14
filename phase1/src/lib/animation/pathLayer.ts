import {findComp,findLayer,validSource,validMaskPath,MAX_MASK_POINTS,MAX_SHAPE_KEYS,newId,makeTransform,type AnimationDocument,type Layer,type LayerMask,type MaskPath,type MaskPoint,type MaskShapeKey,type Property,type Vec2} from './model';
import {bezierPath,lerpPath,morphPath,morphProblem,MorphError,removePoint,type MorphOpts} from './masks';
import {evaluate} from './interpolate';
import {applyPathFx} from './pathFx';
import {worldMatrix} from './scene';
import {pathData} from '../interface/vectorCore';
import type {InterfacePath} from '../interface/schema';
import type {Edit} from './edit';
import {booleanRings,flattenRing,simplifyRing,strokeOutline,BooleanError,MAX_RESULT_POINTS,type BoolOp,type Pt} from './pathBoolean';
/** Shape layers with a path source: normalized (0..1 of the layer box) bezier points, optional morph keys. */
const r4=(n:number)=>Math.round(n*1e4)/1e4;
const scale=(p:MaskPath,w:number,h:number):MaskPath=>({closed:p.closed,points:p.points.map(q=>({x:q.x*w,y:q.y*h,...(q.inX!==undefined?{inX:q.inX*w,inY:(q.inY??0)*h}:{}),...(q.outX!==undefined?{outX:q.outX*w,outY:(q.outY??0)*h}:{})}))});
const norm=(p:MaskPath,w:number,h:number):MaskPath=>({closed:p.closed,points:p.points.map(q=>({x:r4(q.x/w),y:r4(q.y/h),...(q.inX!==undefined?{inX:r4(q.inX/w),inY:r4((q.inY??0)/h)}:{}),...(q.outX!==undefined?{outX:r4(q.outX/w),outY:r4((q.outY??0)/h)}:{})}))});
const box=(l:Layer)=>({w:Math.max(1,l.source.width??1),h:Math.max(1,l.source.height??1)});
const hasHandles=(p:MaskPath)=>p.points.some(q=>q.inX!==undefined||q.outX!==undefined||q.inY!==undefined||q.outY!==undefined);
/** Every subpath of a path layer, main path first. Documents from before compound paths have no `subpaths` and read as exactly one. */
export const pathSubpaths=(s:Layer['source']):readonly MaskPath[]=>s.path?[s.path as MaskPath,...((s.subpaths??[]) as readonly MaskPath[])]:[];
/** `evenodd` for compound paths so inner subpaths cut holes; absent for single paths (the old default fill rule stays). */
export const layerFillRule=(l:Layer):'evenodd'|undefined=>l.kind==='shape'&&l.source.shape==='path'&&l.source.subpaths?.length?'evenodd':undefined;
/** SVG path data of a path shape layer at a composition tick. Plain polygons keep the legacy output byte for byte. */
export function layerPathD(l:Layer,tick:number):string{
 const s=l.source,p=s.path as MaskPath,{w,h}=box(l);
 if(l.pathFx){const cur=s.pathKeys?.length?lerpPath(s.pathKeys,tick):p,list=s.subpaths?.length?[cur,...(s.subpaths as readonly MaskPath[])]:[cur];return list.map(q=>bezierPath(applyPathFx(scale(q,w,h),l.pathFx!),0,0)).join(' ');}
 if(s.subpaths?.length)return pathSubpaths(s).map(q=>bezierPath(scale(q,w,h),0,0)).join(' ');
 if(!s.pathKeys?.length&&!hasHandles(p))return pathData(s.path as unknown as InterfacePath,s.width??1,s.height??1);
 const cur=s.pathKeys?.length?lerpPath(s.pathKeys,tick):p;return bezierPath(scale(cur,w,h),0,0);
}
/** Points a pen stroke may add to one static path layer. */
export const MAX_PEN_POINTS=256;
const clampH=(n:number)=>Math.min(2,Math.max(-2,r4(n)));
const clamp01=(n:number)=>Math.min(1,Math.max(0,r4(n)));
/** A pen point in normalized coordinates; a drag of at least 1% pulls symmetric handles. */
const penPoint=(o:{x:number;y:number;outX?:number;outY?:number}):MaskPoint=>({x:clamp01(o.x),y:clamp01(o.y),...(o.outX!==undefined&&o.outY!==undefined&&Math.hypot(o.outX,o.outY)>=0.01?{outX:clampH(o.outX),outY:clampH(o.outY),inX:clampH(-o.outX),inY:clampH(-o.outY)}:{})});
/** Splits the segment after point `i` at parameter `u` (de Casteljau); the curve keeps its shape. */
export function splitAt(p:MaskPath,i:number,u:number):MaskPath{
 const n=p.points.length,j=i+1<n?i+1:p.closed?0:-1;if(j<0)throw Error('The last point of an open path has no next segment.');
 const t=Math.min(0.95,Math.max(0.05,u)),a=p.points[i],b=p.points[j],P:Vec2[]=[[a.x,a.y],[a.x+(a.outX??0),a.y+(a.outY??0)],[b.x+(b.inX??0),b.y+(b.inY??0)],[b.x,b.y]];
 const mix=(x:Vec2,y:Vec2):Vec2=>[x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t],q0=mix(P[0],P[1]),q1=mix(P[1],P[2]),q2=mix(P[2],P[3]),r0=mix(q0,q1),r1=mix(q1,q2),m=mix(r0,r1);
 const curved=a.outX!==undefined||b.inX!==undefined;
 const na:MaskPoint=curved?{...a,outX:r4(q0[0]-a.x),outY:r4(q0[1]-a.y)}:a,nb:MaskPoint=curved?{...b,inX:r4(q2[0]-b.x),inY:r4(q2[1]-b.y)}:b;
 const nm:MaskPoint=curved?{x:r4(m[0]),y:r4(m[1]),inX:r4(r0[0]-m[0]),inY:r4(r0[1]-m[1]),outX:r4(r1[0]-m[0]),outY:r4(r1[1]-m[1])}:{x:r4(a.x+(b.x-a.x)*t),y:r4(a.y+(b.y-a.y)*t)};
 const pts=p.points.map((q,k)=>k===i?na:k===j?nb:q);pts.splice(i+1,0,nm);return {...p,points:pts};
}
/** Turns point `i` smooth (Catmull-Rom handles from its neighbours) or into a corner (no handles). Open path ends keep one handle. */
export function cornerAt(p:MaskPath,i:number,smooth:boolean):MaskPath{
 const n=p.points.length,q=p.points[i];
 if(!smooth){const {inX:_a,inY:_b,outX:_c,outY:_d,...rest}=q;return {...p,points:p.points.map((x,k)=>k===i?rest:x)};}
 const prev=p.points[p.closed?(i+n-1)%n:Math.max(0,i-1)],next=p.points[p.closed?(i+1)%n:Math.min(n-1,i+1)],hx=(next.x-prev.x)/6,hy=(next.y-prev.y)/6,first=!p.closed&&i===0,last=!p.closed&&i===n-1;
 return {...p,points:p.points.map((x,k)=>k!==i?x:{x:q.x,y:q.y,...(first?{}:{inX:clampH(-hx),inY:clampH(-hy)}),...(last?{}:{outX:clampH(hx),outY:clampH(hy)})})};
}
/** Moves a path layer by (dx, dy) composition pixels: one position edit, keyed at `t` when the position is animated. The delta is mapped through the parent's matrix. */
export function pathLayerMoveEdit(doc:AnimationDocument,layerId:string,dx:number,dy:number,t:number):Edit{
 const {c,l}=target(doc,layerId);if(l.locked)throw Error('Layer is locked.');
 const par=l.parent?findLayer(c,l.parent):undefined,m=par?worldMatrix(c,par,t):[1,0,0,1,0,0] as const,det=m[0]*m[3]-m[1]*m[2];
 if(Math.abs(det)<1e-9)throw Error('The parent has no area.');
 const px=(m[3]*dx-m[2]*dy)/det,py=(-m[1]*dx+m[0]*dy)/det,cur=evaluate(l.transform.position,t) as Vec2;
 return {type:'prop.set',layer:l.id,prop:'position',value:[Math.round((cur[0]+px)*100)/100,Math.round((cur[1]+py)*100)/100],t};
}
const uniq=(ix:readonly number[],n:number)=>{const u=[...new Set(ix)].sort((a,b)=>a-b);if(!u.length||u.some(k=>!Number.isInteger(k)||k<0||k>=n))throw Error('Point no longer exists.');return u;};
/** Moves the points by one shared delta (normalized). The delta is limited so every moved point stays in the layer box, which keeps the shape. */
export function movePointsBy(p:MaskPath,indices:readonly number[],dx:number,dy:number):MaskPath{
 const ix=uniq(indices,p.points.length),sel=ix.map(k=>p.points[k]);
 const lo=(f:(q:MaskPoint)=>number)=>Math.min(...sel.map(f)),hi=(f:(q:MaskPoint)=>number)=>Math.max(...sel.map(f));
 const mx=Math.min(1-hi(q=>q.x),Math.max(-lo(q=>q.x),dx)),my=Math.min(1-hi(q=>q.y),Math.max(-lo(q=>q.y),dy));
 return {...p,points:p.points.map((q,k)=>ix.includes(k)?{...q,x:r4(q.x+mx),y:r4(q.y+my)}:q)};
}
/** Reshapes the segment after point `i` so the curve point at `u` follows the drag (dx, dy normalized): both control points move by d / (3u(1-u)). Straight segments become curves. */
export function reshapeSegment(p:MaskPath,i:number,u:number,dx:number,dy:number):MaskPath{
 const n=p.points.length,j=i+1<n?i+1:p.closed?0:-1;if(!p.points[i]||j<0)throw Error('Segment no longer exists.');
 const a=p.points[i],b=p.points[j],t=Math.min(0.9,Math.max(0.1,u)),k=1/(3*t*(1-t));
 const o1=[a.outX??(b.x-a.x)/3,a.outY??(b.y-a.y)/3],i1=[b.inX??(a.x-b.x)/3,b.inY??(a.y-b.y)/3];
 const na:MaskPoint={...a,outX:clampH(o1[0]+dx*k),outY:clampH(o1[1]+dy*k)},nb:MaskPoint={...b,inX:clampH(i1[0]+dx*k),inY:clampH(i1[1]+dy*k)};
 return {...p,points:p.points.map((q,m)=>m===i?na:m===j?nb:q)};
}
export type PathLayerOp=
 |{op:'points';path:MaskPath}
 |{op:'animate';on:boolean;t?:number}
 |{op:'point';index:number;x:number;y:number;t?:number}
 |{op:'pen';x:number;y:number;outX?:number;outY?:number}
 |{op:'close'}
 |{op:'addSubpath';path:MaskPath}
 |{op:'removeSubpath';index:number}
 |{op:'insert';index:number;u?:number}
 |{op:'remove';index:number}
 |{op:'corner';index:number;smooth:boolean}
 |{op:'movePoints';indices:readonly number[];dx:number;dy:number;t?:number}
 |{op:'removePoints';indices:readonly number[]}
 |{op:'cornerPoints';indices:readonly number[];smooth:boolean}
 |{op:'segment';index:number;u:number;dx:number;dy:number;t?:number}
 |{op:'handle';index:number;which:'in'|'out';x:number;y:number;mirror?:boolean;t?:number}
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
   if(o.on){if(keys?.length)return upd({});if(s.subpaths?.length)throw Error('Compound paths cannot be animated yet.');if(s.path!.points.length<2)throw Error('Add at least two points first.');if(s.path!.points.length>MAX_MASK_POINTS)throw Error(`Animated paths have at most ${MAX_MASK_POINTS} points.`);
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
  case 'pen':{
   if(keys?.length)throw Error('Remove the path animation before adding points.');
   const cur=s.path as MaskPath;if(cur.closed)throw Error('The path is closed.');if(cur.points.length>=MAX_PEN_POINTS)throw Error(`At most ${MAX_PEN_POINTS} path points.`);
   return upd({path:{closed:false,points:[...cur.points,penPoint(o)]}});}
  case 'close':{
   if(keys?.length)throw Error('Remove the path animation before closing the path.');
   const cur=s.path as MaskPath;if(cur.closed||cur.points.length<3)throw Error('A closed path needs three points.');return upd({path:{...cur,closed:true}});}
  case 'insert':case 'remove':case 'corner':{
   const cap=keys?.length?MAX_MASK_POINTS:MAX_PEN_POINTS,cur=s.path as MaskPath;
   if(!Number.isInteger(o.index)||!cur.points[o.index])throw Error('Point no longer exists.');
   const f=o.op==='insert'?(p:MaskPath)=>{if(p.points.length>=cap)throw Error(`At most ${cap} path points.`);return splitAt(p,o.index,o.u??0.5);}
    :o.op==='remove'?(p:MaskPath)=>{if(keys?.length&&p.points.length<=2)throw Error('An animated path needs two points.');return removePoint(p,o.index);}
    :(p:MaskPath)=>cornerAt(p,o.index,o.smooth);
   return upd({path:f(cur),...(keys?.length?{pathKeys:keys.map(k=>({...k,path:f(k.path)}))}:{})});}
  case 'movePoints':case 'segment':{
   const t=keys?.length?frame(o.t):undefined,cur=keys?.length?lerpPath(keys,t!):s.path as MaskPath;
   const next=o.op==='movePoints'?movePointsBy(cur,o.indices,o.dx,o.dy):reshapeSegment(cur,o.index,o.u,o.dx,o.dy);
   if(!keys?.length)return upd({path:next});
   const nk:MaskShapeKey[]=[...keys.filter(k=>k.t!==t),{t:t!,path:next}].sort((a,b)=>a.t-b.t);
   if(nk.length>MAX_SHAPE_KEYS)throw Error(`At most ${MAX_SHAPE_KEYS} path keys.`);return upd({pathKeys:nk});}
  case 'removePoints':case 'cornerPoints':{
   const cur=s.path as MaskPath,ix=uniq(o.indices,cur.points.length);
   const f=o.op==='removePoints'?(p:MaskPath)=>{const left=p.points.length-ix.length;if(left<(keys?.length?2:p.closed?3:1))throw Error(keys?.length?'An animated path needs two points.':p.closed?'A closed path needs three points.':'A path needs a point.');return {...p,points:p.points.filter((_,k)=>!ix.includes(k))};}
    :(p:MaskPath)=>ix.reduce((acc,k)=>cornerAt(acc,k,o.smooth),p);
   return upd({path:f(cur),...(keys?.length?{pathKeys:keys.map(k=>({...k,path:f(k.path)}))}:{})});}
  case 'addSubpath':{
   if(keys?.length)throw Error('Turn off path animation before adding subpaths.');
   return upd({subpaths:[...(s.subpaths??[]),o.path] as typeof s.subpaths});}
  case 'removeSubpath':{
   const sub=s.subpaths??[];if(!Number.isInteger(o.index)||o.index<1||o.index>sub.length)throw Error('Subpath no longer exists.');
   const left=sub.filter((_,k)=>k!==o.index-1);return upd({subpaths:left.length?left:undefined});}
  case 'handle':{
   const t=keys?.length?frame(o.t):undefined,cur=keys?.length?lerpPath(keys,t!):s.path as MaskPath;
   if(!Number.isInteger(o.index)||!cur.points[o.index])throw Error('Point no longer exists.');
   const hx=clampH(o.x),hy=clampH(o.y),mx=r4(-hx),my=r4(-hy);
   const next:MaskPath={closed:cur.closed,points:cur.points.map((q,i)=>i!==o.index?q:o.which==='out'?{...q,outX:hx,outY:hy,...(o.mirror?{inX:mx,inY:my}:{})}:{...q,inX:hx,inY:hy,...(o.mirror?{outX:mx,outY:my}:{})})};
   if(!keys?.length)return upd({path:next});
   const nk:MaskShapeKey[]=[...keys.filter(k=>k.t!==t),{t:t!,path:next}].sort((a,b)=>a.t-b.t);
   if(nk.length>MAX_SHAPE_KEYS)throw Error(`At most ${MAX_SHAPE_KEYS} path keys.`);return upd({pathKeys:nk});}
  case 'morphTo':{
   if(s.subpaths?.length)throw Error('Compound paths cannot be morphed yet.');
   if(o.other===l.id)throw P('sameLayer','Pick another layer to morph into.');
   const ol=findLayer(c,o.other);if(!ol||ol.kind!=='shape'||ol.source.shape!=='path'||!ol.source.path)throw P('notPathLayer','Pick another path shape layer.');
   if(s.path!.points.length>MAX_MASK_POINTS)throw new MorphError({key:'animation.morph.err.limit',en:`Animated paths have at most ${MAX_MASK_POINTS} points.`,params:{max:MAX_MASK_POINTS}});
   if(!Number.isInteger(o.t))throw Error('A time is needed.');
   if(ol.source.subpaths?.length)throw Error('Compound paths cannot be morphed yet.');
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

/** Starts a new path layer from the first pen click: a composition-sized layer at the origin so the path can use the whole frame. `x`,`y` are composition pixels, `outX`,`outY` the handle drag in pixels. One layer.add, so one undo step. */
export function penNewLayerEdit(doc:AnimationDocument,x:number,y:number,id:string,outX?:number,outY?:number):Edit{
 const c=findComp(doc);if(!c)throw Error('Open a composition first.');
 const tr=makeTransform(c.width,c.height);
 const pt=penPoint({x:x/c.width,y:y/c.height,...(outX!==undefined&&outY!==undefined?{outX:outX/c.width,outY:outY/c.height}:{})});
 return {type:'layer.add',kind:'shape',id,over:{name:'Path',source:{shape:'path',color:'#ff7a59',width:c.width,height:c.height,path:{closed:false,points:[pt]}},transform:{...tr,position:{...tr.position,value:[0,0] as unknown as Vec2}}}};
}

/** Merges path layer `otherId` into `layerId` as extra subpaths and removes it: one undo step (two edits, one dispatch). Points are mapped through both layers' world matrices at the composition start, so the shapes keep their place on screen. Refused when the result would leave the target box or exceed the subpath and point limits. */
export function combinePathsEdits(doc:AnimationDocument,layerId:string,otherId:string):Edit[]{
 const {c,l}=target(doc,layerId);if(l.locked)throw Error('Layer is locked.');
 if(otherId===layerId)throw Error('Pick another path layer.');
 const o=findLayer(c,otherId);if(!o||o.kind!=='shape'||o.source.shape!=='path'||!o.source.path)throw Error('Pick another path shape layer.');
 if(o.locked)throw Error('Layer is locked.');
 if(l.source.pathKeys?.length||o.source.pathKeys?.length)throw Error('Turn off path animation before combining.');
 const t=c.start,M=worldMatrix(c,l,t),N=worldMatrix(c,o,t),det=M[0]*M[3]-M[1]*M[2];if(Math.abs(det)<1e-9)throw Error('The layer has no area.');
 const {w,h}=box(l),{w:w2,h:h2}=box(o);
 const toLocal=(x:number,y:number)=>{const wx=N[0]*x+N[2]*y+N[4],wy=N[1]*x+N[3]*y+N[5],dx=wx-M[4],dy=wy-M[5];return [(M[3]*dx-M[2]*dy)/det,(-M[1]*dx+M[0]*dy)/det] as const;};
 const lin=(x:number,y:number)=>{const wx=N[0]*x+N[2]*y,wy=N[1]*x+N[3]*y;return [(M[3]*wx-M[2]*wy)/det,(-M[1]*wx+M[0]*wy)/det] as const;};
 const mapped=pathSubpaths(o.source).map(sp=>({closed:sp.closed,points:sp.points.map(q=>{
  const [x,y]=toLocal(q.x*w2,q.y*h2),pt:MaskPoint={x:r4(x/w),y:r4(y/h)};
  if(q.inX!==undefined||q.inY!==undefined){const [hx,hy]=lin((q.inX??0)*w2,(q.inY??0)*h2);pt.inX=r4(hx/w);pt.inY=r4(hy/h);}
  if(q.outX!==undefined||q.outY!==undefined){const [hx,hy]=lin((q.outX??0)*w2,(q.outY??0)*h2);pt.outX=r4(hx/w);pt.outY=r4(hy/h);}
  return pt;})}));
 const eps=1e-3;if(mapped.some(sp=>sp.points.some(q=>q.x<-eps||q.x>1+eps||q.y<-eps||q.y>1+eps)))throw Error('The other path would leave this layer box.');
 const clamped=mapped.map(sp=>({...sp,points:sp.points.map(q=>({...q,x:Math.min(1,Math.max(0,q.x)),y:Math.min(1,Math.max(0,q.y))}))}));
 const subpaths=[...(l.source.subpaths??[]),...clamped];
 if(!validSource({...l.source,subpaths:subpaths as never}))throw Error('Too many subpaths or points in one path layer.');
 return [{type:'layer.update',layer:l.id,source:{subpaths:subpaths as never}},{type:'layer.remove',layer:o.id}];
}

/** Path boolean (unite, subtract, intersect, exclude) of `layerId` with `otherId`: the target keeps its place and style, the other layer is removed. One dispatch, one undo step. Curves are flattened (about 0.25 px), so the result has corner points only. Refused for animated, locked, open, same or non-path layers, for empty results and for results outside the target box or above the point limits. */
export function booleanEdits(doc:AnimationDocument,layerId:string,otherId:string,op:BoolOp):Edit[]{
 const {c,l}=target(doc,layerId);if(l.locked)throw Error('Layer is locked.');
 if(otherId===layerId)throw Error('Pick another path layer.');
 const o=findLayer(c,otherId);if(!o||o.kind!=='shape'||o.source.shape!=='path'||!o.source.path)throw Error('Pick another path shape layer.');
 if(o.locked)throw Error('Layer is locked.');
 if(l.source.pathKeys?.length||o.source.pathKeys?.length)throw Error('Turn off path animation before combining.');
 const A=pathSubpaths(l.source),B=pathSubpaths(o.source);
 if([...A,...B].some(sp=>!sp.closed||sp.points.length<3))throw Error('Boolean operations need closed paths.');
 const t=c.start,M=worldMatrix(c,l,t),N=worldMatrix(c,o,t),det=M[0]*M[3]-M[1]*M[2];if(Math.abs(det)<1e-9)throw Error('The layer has no area.');
 const {w,h}=box(l),{w:w2,h:h2}=box(o);
 const toLocal=(x:number,y:number):Pt=>{const wx=N[0]*x+N[2]*y+N[4],wy=N[1]*x+N[3]*y+N[5],dx=wx-M[4],dy=wy-M[5];return [(M[3]*dx-M[2]*dy)/det,(-M[1]*dx+M[0]*dy)/det];};
 const ringsA=A.map(sp=>flattenRing(sp as MaskPath,w,h));
 const ringsB=B.map(sp=>flattenRing(sp as MaskPath,w2,h2).map(p=>toLocal(p[0],p[1])));
 let res:Pt[][];
 try{res=booleanRings(ringsA,ringsB,op);}catch(e){if(e instanceof BooleanError)throw Error(e.message);throw e;}
 if(!res.length)throw Error('The result would be empty.');
 const eps=1e-3;
 const norm01=res.map(r=>r.map(p=>({x:r4(p[0]/w),y:r4(p[1]/h)})));
 if(norm01.some(r=>r.some(q=>q.x<-eps||q.x>1+eps||q.y<-eps||q.y>1+eps)))throw Error('The result would leave this layer box.');
 const rings=norm01.map(r=>({closed:true,points:r.map(q=>({x:Math.min(1,Math.max(0,q.x)),y:Math.min(1,Math.max(0,q.y))}))}));
 if(rings.reduce((n,r)=>n+r.points.length,0)>MAX_RESULT_POINTS)throw Error('Too many subpaths or points in one path layer.');
 const [main,...rest]=rings;
 const source={path:main as never,subpaths:(rest.length?rest:undefined) as never};
 if(!validSource({...l.source,...source}))throw Error('Too many subpaths or points in one path layer.');
 return [{type:'layer.update',layer:l.id,source},{type:'layer.remove',layer:o.id}];
}

const KAPPA=0.5522847498;
/** Closed ring of a rect, ellipse or path mask in layer pixels (curves flattened). Null when the mask is open. */
function maskRing(m:LayerMask):Pt[]|null{
 if(m.shape==='rect')return [[m.x,m.y],[m.x+m.width,m.y],[m.x+m.width,m.y+m.height],[m.x,m.y+m.height]];
 if(m.shape==='ellipse'){const rx=m.width/2,ry=m.height/2,cx=m.x+rx,cy=m.y+ry,kx=rx*KAPPA,ky=ry*KAPPA;
  return flattenRing({closed:true,points:[{x:cx,y:cy-ry,inX:-kx,inY:0,outX:kx,outY:0},{x:cx+rx,y:cy,inX:0,inY:-ky,outX:0,outY:ky},{x:cx,y:cy+ry,inX:kx,inY:0,outX:-kx,outY:0},{x:cx-rx,y:cy,inX:0,inY:ky,outX:0,outY:-ky}]},1,1);}
 if(!m.path||!m.path.closed||m.path.points.length<3)return null;
 return flattenRing({closed:true,points:m.path.points.map(q=>({...q,x:q.x+m.x,y:q.y+m.y}))},1,1);
}
/** Tolerance in pixels when a mask result has to be thinned to fit the mask point limit. */
export const MASK_SIMPLIFY_TOLERANCE=0.5;
/** Path boolean of two masks of one layer: mask `maskId` becomes the result (a path mask with corner points), mask `otherId` is removed. One layer.masks edit, one undo step. Masks hold one path of at most 32 points, so the result must be a single ring: results with holes or several parts are refused, and rings above 32 points are thinned with Douglas-Peucker at 0.5 px or refused. Refused for animated, inverted and open masks and for masks with different modes. */
export function maskBooleanEdit(doc:AnimationDocument,layerId:string,maskId:string,otherId:string,op:BoolOp):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');
 if(l.locked)throw Error('Layer is locked.');
 if(maskId===otherId)throw Error('Pick another mask.');
 const list=l.masks??[],a=list.find(m=>m.id===maskId),b=list.find(m=>m.id===otherId);
 if(!a||!b)throw Error('Mask no longer exists.');
 if([a,b].some(m=>m.anim||m.shapeKeys?.length))throw Error('Turn off mask animation before combining.');
 if(a.invert||b.invert)throw Error('Inverted masks cannot be combined.');
 if(a.mode!==b.mode)throw Error('Both masks need the same mode.');
 const ra=maskRing(a),rb=maskRing(b);if(!ra||!rb)throw Error('Boolean operations need closed paths.');
 let res:Pt[][];try{res=booleanRings([ra],[rb],op);}catch(e){if(e instanceof BooleanError)throw Error(e.message);throw e;}
 if(!res.length)throw Error('The result would be empty.');
 if(res.length>1)throw Error('The result has several parts; a mask holds one path.');
 let ring=res[0];if(ring.length>MAX_MASK_POINTS)ring=simplifyRing(ring,MASK_SIMPLIFY_TOLERANCE);
 if(ring.length>MAX_MASK_POINTS)throw Error(`The result needs more than ${MAX_MASK_POINTS} points.`);
 const path:MaskPath={closed:true,points:ring.map(p=>({x:r4(p[0]),y:r4(p[1])}))};
 const next:LayerMask={...a,shape:'path',x:0,y:0,path};
 if(!validMaskPath(path))throw Error('The result is out of range.');
 return {type:'layer.masks',layer:l.id,masks:list.filter(m=>m.id!==otherId).map(m=>m.id===maskId?next:m)};
}

/** Most flattened segments of one stroked layer that expand stroke accepts. */
export const MAX_STROKE_SEGMENTS=300;
/** Turns the stroke of a static path layer into its own filled outline layer (stroke colour as fill), then removes the stroke from the source layer. Two edits in one dispatch, one undo step. Joins (miter with limit 4, round, bevel) and caps (butt, round, square) follow the stroke settings like the renderer; curves are flattened (about 0.25 px). Masks, matte and effects are copied to the outline layer. Refused for animated paths and for trimmed or dashed strokes (a dashed outline needs one ring per dash, and a layer holds at most 8), zero width and results beyond the path point limits. */
export function expandStrokeEdits(doc:AnimationDocument,layerId:string,id=newId('layer')):Edit[]{
 const {c,l}=target(doc,layerId);if(l.locked)throw Error('Layer is locked.');
 const st=l.stroke;if(!st||st.width<=0)throw Error('The layer has no stroke to expand.');
 if(l.source.pathKeys?.length)throw Error('Turn off path animation before expanding the stroke.');
 if(st.trim||st.dash)throw Error('Remove stroke trim and dash before expanding.');
 const {w,h}=box(l),lines=pathSubpaths(l.source).map(sp=>({pts:flattenRing(sp as MaskPath,w,h),closed:sp.closed}));
 if(lines.reduce((n,ln)=>n+ln.pts.length,0)>MAX_STROKE_SEGMENTS)throw Error('The path is too detailed to expand its stroke.');
 let rings:Pt[][];try{rings=strokeOutline(lines,st.width,{join:st.join,cap:st.cap});}catch(e){if(e instanceof BooleanError)throw Error(e.message);throw e;}
 if(!rings.length)throw Error('The stroke has no area.');
 const all=rings.flat(),x0=Math.floor(Math.min(...all.map(p=>p[0]))),y0=Math.floor(Math.min(...all.map(p=>p[1]))),x1=Math.ceil(Math.max(...all.map(p=>p[0]))),y1=Math.ceil(Math.max(...all.map(p=>p[1])));
 const W=Math.max(1,x1-x0),H=Math.max(1,y1-y0),nrm=rings.map(r=>({closed:true,points:r.map(p=>({x:r4((p[0]-x0)/W),y:r4((p[1]-y0)/H)}))}));
 if(nrm.length>8||nrm.reduce((n,r)=>n+r.points.length,0)>MAX_RESULT_POINTS||nrm.some(r=>r.points.length>256))throw Error('Too many subpaths or points in one path layer.');
 const [main,...rest]=nrm;
 const source={shape:'path' as const,color:st.color,width:W,height:H,path:main as never,...(rest.length?{subpaths:rest as never}:{})};
 if(!validSource(source))throw Error('The outline is out of range.');
 const sh=(p:Property):Property=>({...p,value:(p.value as Vec2).map((v,i)=>v-(i?y0:x0)) as unknown as Vec2,keys:p.keys.map(k=>({...k,v:(k.v as Vec2).map((v,i)=>v-(i?y0:x0)) as unknown as Vec2}))});
 void c;
 return [{type:'layer.stroke',layer:l.id,stroke:null},{type:'layer.add',kind:'shape',id,over:{name:`${l.name} stroke`,source,transform:{...l.transform,anchor:sh(l.transform.anchor)},parent:l.parent,inT:l.inT,outT:l.outT,offset:l.offset,...(l.masks?{masks:l.masks}:{}),...(l.matte?{matte:l.matte}:{}),...(l.effects?{effects:l.effects}:{})}}];
}
