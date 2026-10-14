import {EASE_IN,EASE_OUT,makeTransform,prop,type Composition,type Layer,type LayerSource,type Property,type PropValue,type Vec2} from './model';
import {snapToFrame,TICKS_PER_SECOND} from './time';
import type {Edit} from './edit';
/** Starter templates: a few editable layers with ready-made motion, inserted in one undo step. Everything is plain layers and keys, so the user edits them like any other layer. */
export const TEMPLATE_IDS=['lowerThird','titleReveal','badgePop','ctaBanner'] as const;
export type TemplateId=typeof TEMPLATE_IDS[number];
export const TEMPLATE_LAYERS:Record<TemplateId,number>={lowerThird:3,titleReveal:2,badgePop:2,ctaBanner:2};
const key=(t:number,v:PropValue)=>({t,v,interp:'bezier' as const,out:EASE_OUT,in:EASE_IN});
const keyed=(type:'scalar'|'vec2',frames:readonly {t:number;v:PropValue}[]):Property=>({type,value:frames[0].v,keys:frames.map(f=>key(f.t,f.v))});
/**
 * Edits that add the template to `comp` at tick `at` (snapped to a frame). `ids` are fresh layer ids, one per template layer, top layer first.
 * Motion starts at `at`; layers appear from `at` to the end of the composition. Sizes follow the composition height.
 */
export function templateEdits(comp:Composition,template:TemplateId,at:number,ids:readonly string[]):Edit[]{
 if(!(TEMPLATE_IDS as readonly string[]).includes(template))throw Error('Unknown template.');
 if(ids.length!==TEMPLATE_LAYERS[template])throw Error('Wrong number of layer ids.');
 const start=snapToFrame(Math.max(comp.start,at),comp.fps),end=comp.start+comp.duration;
 if(end-start<TICKS_PER_SECOND/2)throw Error('Move the playhead earlier: the template needs at least half a second.');
 const sec=(s:number)=>Math.min(end,snapToFrame(start+s*TICKS_PER_SECOND,comp.fps));
 const W=comp.width,H=comp.height,u=H/450,r=(n:number)=>Math.round(n*100)/100;
 const layer=(id:string,kind:'shape'|'text',name:string,source:LayerSource,pos:Vec2,motion:Partial<Layer['transform']>={},extra:Partial<Layer>={},anchorLeft=false):Edit=>{
  const t=makeTransform(W,H),sw=source.width??0,sh=source.height??0,ax=source.shape&&anchorLeft?0:sw/2;return {type:'layer.add',kind,id,over:{name,source,inT:start,transform:{...t,...(kind==='shape'?{anchor:prop('vec2',[ax,sh/2])}:{}),position:prop('vec2',pos),...motion},...extra}};
 };
 const fade=(from:number,to:number)=>keyed('scalar',[{t:sec(from),v:0},{t:sec(to),v:100}]);
 const out:Edit[]=[];
 // Bottom layer first: layer.add puts each new layer on top.
 switch(template){
  case 'lowerThird':{
   const pw=r(W*0.46),ph=r(84*u),x=r(W*0.06),y=r(H*0.78);
   out.push(layer(ids[2],'shape','Lower third panel',{shape:'rect',width:pw,height:ph,color:'#7c5cff'},[x+pw/2,y+ph/2],{position:keyed('vec2',[{t:start,v:[-pw/2,y+ph/2]},{t:sec(0.5),v:[x+pw/2,y+ph/2]}])}));
   out.push(layer(ids[1],'text','Lower third subtitle',{text:'Role or topic',size:r(22*u),color:'#e3dcff'},[x+r(18*u),y+r(46*u)],{opacity:fade(0.45,0.8)}));
   out.push(layer(ids[0],'text','Lower third name',{text:'Your name',size:r(36*u),color:'#ffffff'},[x+r(18*u),y+r(8*u)],{opacity:fade(0.3,0.65)}));
   break;}
  case 'titleReveal':{
   const bw=r(W*0.3),bh=r(6*u);
   out.push(layer(ids[1],'shape','Title underline',{shape:'rect',width:bw,height:bh,color:'#7c5cff'},[r(W*0.2),r(H*0.6)+bh/2],{scale:keyed('vec2',[{t:sec(0.8),v:[0,100]},{t:sec(1.3),v:[100,100]}])},{},true));
   out.push(layer(ids[0],'text','Title',{text:'Your title',size:r(88*u),color:'#ffffff'},[r(W*0.2),r(H*0.36)],{},{textReveal:keyed('scalar',[{t:start,v:0},{t:sec(0.9),v:100}])}));
   break;}
  case 'badgePop':{
   const d=r(H*0.3);
   out.push(layer(ids[1],'shape','Badge',{shape:'ellipse',width:d,height:d,color:'#ff7a59'},[W/2,H/2],{scale:keyed('vec2',[{t:start,v:[0,0]},{t:sec(0.35),v:[118,118]},{t:sec(0.55),v:[100,100]}]),rotation:keyed('scalar',[{t:start,v:-25},{t:sec(0.55),v:0}])}));
   out.push(layer(ids[0],'text','Badge label',{text:'NEW',size:r(40*u),color:'#ffffff'},[r(W/2-48*u),r(H/2-24*u)],{opacity:fade(0.4,0.6)}));
   break;}
  case 'ctaBanner':{
   const bh=r(70*u),by=r(H-bh-24*u),bw=r(W*0.8),bx=r((W-bw)/2);
   out.push(layer(ids[1],'shape','Banner',{shape:'roundedRect',width:bw,height:bh,radius:r(14*u),color:'#7c5cff'},[W/2,by+bh/2],{position:keyed('vec2',[{t:start,v:[W/2,H+bh]},{t:sec(0.5),v:[W/2,by+bh/2]}])}));
   out.push(layer(ids[0],'text','Banner text',{text:'Subscribe for more',size:r(34*u),color:'#ffffff'},[bx+r(28*u),by+r(12*u)],{opacity:fade(0.45,0.8)}));
   break;}
 }
 return out;
}
