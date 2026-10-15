import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,type Composition,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
/** Resize the composition and bring the layers along. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const RESIZE_MODES=['fit','fill','center'] as const;
export type ResizeMode=typeof RESIZE_MODES[number];
const round=(n:number)=>Math.round(n*100)/100;
/** Scale factor for the content: fit keeps everything visible, fill covers the new frame, center keeps the size. */
export const resizeScale=(ow:number,oh:number,nw:number,nh:number,mode:ResizeMode)=>mode==='center'?1:mode==='fit'?Math.min(nw/ow,nh/oh):Math.max(nw/ow,nh/oh);
const pos=(v:PropValue,s:number,ox:number,oy:number,nx:number,ny:number):PropValue=>[round(nx+s*((v as readonly number[])[0]-ox)),round(ny+s*((v as readonly number[])[1]-oy))] as PropValue;
/** Edits that move and scale one top-level layer for the new frame. Children follow their parent. */
export function resizeEdits(l:Layer,s:number,from:{w:number;h:number},to:{w:number;h:number}):Edit[]{
 const e:Edit[]=[],ox=from.w/2,oy=from.h/2,nx=to.w/2,ny=to.h/2,p=l.transform.position,sc=l.transform.scale;
 if(p.keys.length)for(const k of p.keys)e.push({type:'prop.set',layer:l.id,prop:'position',t:k.t,value:pos(k.v,s,ox,oy,nx,ny)});
 else e.push({type:'prop.set',layer:l.id,prop:'position',t:0,value:pos(p.value,s,ox,oy,nx,ny)});
 if(s!==1){const sv=(v:PropValue):PropValue=>[round((v as readonly number[])[0]*s),round((v as readonly number[])[1]*s)] as PropValue;
  if(sc.keys.length)for(const k of sc.keys)e.push({type:'prop.set',layer:l.id,prop:'scale',t:k.t,value:sv(k.v)});else e.push({type:'prop.set',layer:l.id,prop:'scale',t:0,value:sv(sc.value)});}
 if(!p.keys.some(k=>k.channelIn||k.channelOut))for(const k of p.keys){if(k.sIn||k.sOut)e.push({type:'key.spatial',layer:l.id,prop:'position',t:k.t,...(k.sIn?{sIn:[round(k.sIn[0]*s),round(k.sIn[1]*s)] as [number,number]}:{}),...(k.sOut?{sOut:[round(k.sOut[0]*s),round(k.sOut[1]*s)] as [number,number]}:{})});}
 return e;
}
export function resizePlan(c:Composition,w:number,h:number,mode:ResizeMode):{edits:Edit[];layers:number;scale:number}{
 const s=resizeScale(c.width,c.height,w,h,mode),roots=c.layers.filter(l=>l.parent===null&&l.kind!=='audio'),edits:Edit[]=[];
 for(const l of roots)edits.push(...resizeEdits(l,s,{w:c.width,h:c.height},{w,h}));
 edits.push({type:'comp.update',settings:{width:w,height:h}} as Edit);
 return {edits,layers:roots.length,scale:s};
}
export const compResizeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.comp.resize',title:'Change the composition size and move the layers with it',category:'Edit',level:'ui',keywords:['animation','composition','resize','size','width','height','aspect','square','vertical','social','fit','fill','scale','content'],
 params:{type:'object',properties:{width:{type:'integer',minimum:1,maximum:16384},height:{type:'integer',minimum:1,maximum:16384},mode:{enum:[...RESIZE_MODES]}},required:['width','height','mode'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document;return !!d&&!!findComp(d);},
 run:((p:{width:number;height:number;mode:ResizeMode})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!RESIZE_MODES.includes(p?.mode))return expected('Unknown resize mode.');
  if(!Number.isInteger(p.width)||!Number.isInteger(p.height)||p.width<1||p.height<1||p.width>16384||p.height>16384)return expected('The size must be whole pixels from 1 to 16384.');
  if(p.width===c.width&&p.height===c.height)return expected('The composition already has this size.');
  const locked=c.layers.filter(l=>l.parent===null&&l.kind!=='audio'&&l.locked);
  if(locked.length)return expected(`Unlock these layers first so they can move with the new size: ${locked.slice(0,5).map(l=>l.name).join(', ')}.`);
  const r=resizePlan(c,p.width,p.height,p.mode);
  try{s.dispatch(r.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:r.layers,scale:round(r.scale*100)};
 }) as (p:unknown)=>unknown}];
