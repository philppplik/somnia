import {worldMatrix,invertMatrix,multiplyMatrix,decomposeMatrix} from './scene';
import {validateEasingLib} from './easingModel';
import {validateMotionLib} from './motionModel';
import {validateTextPresetLib} from './textPresetModel';
import type {InterfaceAsset} from '../interface/schema';
import {validateAnimationAssets} from './assetsValidation';
import {MAX_AUDIO_VOLUME,type AudioAsset} from './audioCore';
import {prop,createComposition,type TextAnimator,type LayerMask,type LayerMatte,type ClipItem,type KeyRef,type Vec2,createLayer,findComp,findLayer,PROP_META,wouldCycle,EASE_IN,EASE_OUT,TRANSFORM_KEYS,validateDocument,type AnimationDocument,type CompSettings,type Composition,type Interp,type Keyframe,type Layer,type LayerKind,type LayerSource,type LayerEffect,validSource,validEffects,type Property,type PropValue,type TransformKey} from './model';
import {evaluate} from './interpolate';
import {validateModifiers,linkProblems} from './modifiers';
import {snapToFrame,tickToFrame,frameToTick,validRate} from './time';
/** Typed `animation.*` edits. Every mutation goes through applyEdit so undo, recovery and AI share one path. */
export type Edit=
 |{type:'comp.add';settings?:CompSettings;id?:string}
 |{type:'comp.update';comp?:string;settings:CompSettings}
 |{type:'comp.select';comp:string}
 |{type:'comp.remove';comp:string}
 |{type:'layer.add';kind:LayerKind;over?:Partial<Layer>;id?:string}
 |{type:'layer.remove';layer:string}
 |{type:'layer.update';layer:string;name?:string;visible?:boolean;solo?:boolean;locked?:boolean;shy?:boolean;source?:Partial<LayerSource>}
 |{type:'layer.timing';layer:string;inT:number;outT:number}
 |{type:'layer.parent';layer:string;parent:string|null;keepWorld?:boolean;t?:number}
 |{type:'layer.reorder';layer:string;index:number}
 |{type:'prop.set';layer:string;prop:TransformKey;value:PropValue;t:number}
 |{type:'prop.animate';layer:string;prop:TransformKey;on:boolean;t:number}
 |{type:'key.add';layer:string;prop:TransformKey;t:number}
 |{type:'key.remove';layer:string;prop:TransformKey;t:number}
 |{type:'key.move';layer:string;prop:TransformKey;from:number;to:number;replace?:boolean}
 |{type:'key.interp';layer:string;prop:TransformKey;t:number;interp:Interp;channel?:0|1;out?:readonly [number,number];in?:readonly [number,number]}
 /** Move many keys by the same number of ticks (snapped to whole frames) as one step. */
 |{type:'keys.move';keys:readonly KeyRef[];delta:number;replace?:boolean}
 |{type:'keys.remove';keys:readonly KeyRef[]}
 |{type:'keys.paste';layer:string;items:readonly ClipItem[];t:number}
 |{type:'keys.interp';keys:readonly KeyRef[];interp?:Interp;out?:readonly [number,number];in?:readonly [number,number]}
 /** Spatial tangents of a position key, as offsets from the key value. */
 |{type:'key.spatial';layer:string;prop:TransformKey;t:number;sIn?:Vec2;sOut?:Vec2}
 |{type:'keys.spatial';keys:readonly KeyRef[];mode:'smooth'|'straight'}
 |{type:'effect.colorKey';layer:string;effect:string;color:string;t:number}
 |{type:'effect.bypassKey';layer:string;effect:string;bypass:boolean;t:number}
 |{type:'layer.stroke';layer:string;stroke:NonNullable<Layer['stroke']>|null}
 |{type:'effect.amount';layer:string;effect:string;value:number;t:number}
 |{type:'effect.animate';layer:string;effect:string;on:boolean;t:number}
 |{type:'effect.key.remove';layer:string;effect:string;t:number}
 |{type:'text.animators';layer:string;animators:readonly TextAnimator[]}
 |{type:'layer.masks';layer:string;masks:readonly LayerMask[]}
 |{type:'layer.matte';layer:string;matte:LayerMatte|null}
 |{type:'layer.reveal';layer:string;property:Property}
 |{type:'markers.set';markers:readonly import('./model').Marker[]}
 |{type:'asset.import';asset:InterfaceAsset}
 /** Replace the document's saved motion presets (library edits compute the full list). */
 |{type:'easings.set';items:readonly import('./easingModel').EasingSet[]}
 |{type:'motions.set';items:readonly import('./motionModel').MotionSet[]}
 |{type:'textPresets.set';items:readonly import('./textPresetModel').TextPresetSet[]}
 /** Embed a prepared audio asset and add an audio layer whose clip starts at `t` (default 0). */
 |{type:'audio.import';asset:AudioAsset;t?:number;id?:string}
 /** Trim and place an audio clip. All values in ticks; `length` is the played duration. */
 |{type:'audio.update';layer:string;trimIn?:number;length?:number;offset?:number}
 |{type:'audio.volume.set';layer:string;value:number;t:number}
 |{type:'audio.volume.animate';layer:string;on:boolean;t:number}
 |{type:'audio.volume.key.remove';layer:string;t:number}
 |{type:'layer.effects';layer:string;effects:readonly LayerEffect[]}
 |{type:'prop.pathMode';layer:string;mode:'parameter'|'arcLength'}
 |{type:'workarea.set';in:number;out:number}
 |{type:'modifier.add';layer:string;prop:TransformKey;modifier:import('./modifiers').Modifier}
 |{type:'modifier.remove';layer:string;prop:TransformKey;index:number}
 |{type:'modifier.set';layer:string;prop:TransformKey;index:number;modifier:import('./modifiers').Modifier};
export class EditError extends Error{constructor(message:string,readonly code:'locked'|'missing'|'invalid'|'collision'|'cycle'){super(message);this.name='EditError';}}
const fail=(code:EditError['code'],m:string):never=>{throw new EditError(m,code);};
const compOf=(doc:AnimationDocument)=>findComp(doc)??fail('missing','No active composition.');
const withComp=(doc:AnimationDocument,comp:Composition):AnimationDocument=>({...doc,compositions:doc.compositions.map(c=>c.id===comp.id?comp:c)});
const withLayers=(doc:AnimationDocument,fn:(layers:readonly Layer[],comp:Composition)=>readonly Layer[]):AnimationDocument=>{const c=compOf(doc);return withComp(doc,{...c,layers:fn(c.layers,c)});};
function layerOf(doc:AnimationDocument,id:string,allowLocked=false):Layer{
 const l=findLayer(compOf(doc),id)??fail('missing',`Layer ${id} does not exist.`);
 if(l.locked&&!allowLocked)fail('locked',`Layer "${l.name}" is locked.`);return l;
}
const audioLayer=(doc:AnimationDocument,id:string)=>{const l=layerOf(doc,id);return l.kind==='audio'&&l.audio?l:fail('invalid','Select an audio layer.');};
/** Drops embedded audio files no layer refers to, so removing a layer also shrinks the snapshot. Undo restores the earlier document. */
function pruneAudio(doc:AnimationDocument):AnimationDocument{
 if(!doc.audioAssets?.length)return doc;
 const used=new Set(doc.compositions.flatMap(c=>c.layers.map(l=>l.audio?.assetId)));
 const kept=doc.audioAssets.filter(a=>used.has(a.id));return kept.length===doc.audioAssets.length?doc:{...doc,audioAssets:kept};
}
const setLayer=(doc:AnimationDocument,layer:Layer)=>withLayers(doc,ls=>ls.map(l=>l.id===layer.id?layer:l));
const num=(n:unknown,m:string)=>typeof n==='number'&&Number.isFinite(n)?n:fail('invalid',m);
function checkValue(prop:TransformKey,v:PropValue):PropValue{
 const meta=PROP_META[prop];
 const clamp=(n:number)=>{num(n,`${prop} needs finite numbers.`);if(meta.min!==undefined&&n<meta.min)return fail('invalid',`${prop} must be at least ${meta.min}.`);if(meta.max!==undefined&&n>meta.max)return fail('invalid',`${prop} must be at most ${meta.max}.`);return n;};
 if(meta.type==='scalar'){if(typeof v!=='number')return fail('invalid',`${prop} takes one number.`);return clamp(v);}
 if(!Array.isArray(v)||v.length!==2)return fail('invalid',`${prop} takes two numbers.`);
 return [clamp(v[0]),clamp(v[1])] as const;
}
/** A new or changed link must point at a layer of the active composition and leave the links of that composition valid (no loop, same kind, one per property). */
function checkLinks(doc:AnimationDocument,m:import('./modifiers').Modifier):AnimationDocument{
 const c=compOf(doc);
 if(m.type==='link'&&!findLayer(c,m.layer))return fail('missing','The linked layer does not exist.');
 const bad=linkProblems(c.layers as never);if(bad.length)return fail('invalid',bad[0]);return doc;
}
function setProp(doc:AnimationDocument,layer:string,key:TransformKey,fn:(p:Property,l:Layer)=>Property):AnimationDocument{
 const l=layerOf(doc,layer);return setLayer(doc,{...l,transform:{...l.transform,[key]:fn(l.transform[key],l)}});
}
const upsertKey=(keys:readonly Keyframe[],k:Keyframe):Keyframe[]=>[...keys.filter(x=>x.t!==k.t),k].sort((a,b)=>a.t-b.t);
const makeKey=(t:number,v:PropValue,interp:Interp='bezier'):Keyframe=>({t,v,interp,out:EASE_OUT,in:EASE_IN});
function tickOf(comp:Composition,t:number):number{
 num(t,'Time must be a number.');const s=snapToFrame(t,comp.fps);
 return s<comp.start||s>comp.start+comp.duration?fail('invalid','Time is outside the composition.'):s;
}
function checkSettings(s:CompSettings){
 if(s.width!==undefined&&(!Number.isInteger(s.width)||s.width<1||s.width>16384))fail('invalid','Width must be 1 to 16384.');
 if(s.height!==undefined&&(!Number.isInteger(s.height)||s.height<1||s.height>16384))fail('invalid','Height must be 1 to 16384.');
 if(s.fps&&!validRate(s.fps))fail('invalid','Frame rate must be a positive rational up to 240.');
 if(s.duration!==undefined&&(!Number.isInteger(s.duration)||s.duration<1))fail('invalid','Duration must be a positive number of ticks.');
 if(s.background!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(s.background))fail('invalid','Background must be a #rrggbb colour.');
}
const checkHandle=(h:readonly [number,number])=>Array.isArray(h)&&h.length===2&&h.every(Number.isFinite)&&h[0]>=0&&h[0]<=1;
/** Groups key refs by layer and property (times snapped to frames, existence checked), then applies `fn` per group. Locked layers fail. */
function foldGroups(doc:AnimationDocument,refs:readonly KeyRef[],fn:(d:AnimationDocument,layer:string,prop:TransformKey,times:Set<number>)=>AnimationDocument):AnimationDocument{
 if(!refs?.length)return fail('invalid','No keys selected.');
 const c=compOf(doc);const groups=new Map<string,{layer:string;prop:TransformKey;times:Set<number>}>();
 for(const r of refs){
  if(!TRANSFORM_KEYS.includes(r.prop))return fail('invalid','Unknown property.');
  const l=layerOf(doc,r.layer);const t=tickOf(c,r.t);
  if(!l.transform[r.prop].keys.some(k=>k.t===t))return fail('missing','A selected key no longer exists.');
  const id=`${r.layer}\u0000${r.prop}`;const g=groups.get(id)??{layer:r.layer,prop:r.prop,times:new Set<number>()};g.times.add(t);groups.set(id,g);
 }
 let cur=doc;for(const g of groups.values())cur=fn(cur,g.layer,g.prop,g.times);return cur;
}
/** Pure reducer. Returns a new document with revision+1, or throws EditError and leaves the input untouched. */
export function applyEdit(doc:AnimationDocument,e:Edit):AnimationDocument{
 const out=pruneAudio(reduce(doc,e));if(out===doc)return doc;const errors=validateDocument(out);if(errors.length)fail('invalid',errors.join('; '));return {...out,revision:doc.revision+1};
}
function reduce(doc:AnimationDocument,e:Edit):AnimationDocument{
 switch(e.type){
  case 'comp.add':{checkSettings(e.settings??{});const c=createComposition({name:`Composition ${doc.compositions.length+1}`,...e.settings},e.id);if(doc.compositions.some(x=>x.id===c.id))fail('invalid','Duplicate composition id.');return {...doc,compositions:[...doc.compositions,c],activeComp:c.id};}
  case 'comp.update':{const c=findComp(doc,e.comp??doc.activeComp)??fail('missing','Composition does not exist.');checkSettings(e.settings);
   const duration=e.settings.duration??c.duration;
   const clipped=c.layers.map(l=>l.outT>duration?{...l,outT:Math.max(l.inT+1,duration)}:l);
   return withComp(doc,{...c,...e.settings,duration,fps:e.settings.fps??c.fps,markers:c.markers?.filter(m=>m.t<duration+c.start),layers:clipped,workArea:{in:Math.min(c.workArea.in,duration-1),out:Math.min(c.workArea.out,duration)}});}
  case 'comp.select':if(!findComp(doc,e.comp))return fail('missing','Composition does not exist.');return e.comp===doc.activeComp?doc:{...doc,activeComp:e.comp};
  case 'comp.remove':{if(doc.compositions.length<2)return fail('invalid','A document needs at least one composition.');if(!findComp(doc,e.comp))return fail('missing','Composition does not exist.');const rest=doc.compositions.filter(c=>c.id!==e.comp);return {...doc,compositions:rest,activeComp:doc.activeComp===e.comp?rest[0].id:doc.activeComp};}
  case 'layer.stroke':{const l=layerOf(doc,e.layer);if(e.stroke===null){const {stroke:_s,...rest}=l;return setLayer(doc,rest);}return setLayer(doc,{...l,stroke:e.stroke});}
  case 'effect.colorKey':case 'effect.bypassKey':{const l=layerOf(doc,e.layer),t=tickOf(compOf(doc),e.t),effect=l.effects?.find(x=>x.id===e.effect)??fail('missing','Effect no longer exists.');
   if(e.type==='effect.colorKey'&&(effect.kind!=='tint'||!/^#[0-9a-fA-F]{6}$/.test(e.color)))fail('invalid','Only tint accepts colour keys.');
   const next=e.type==='effect.colorKey'?{...effect,colorKeys:[...(effect.colorKeys??[]).filter(k=>k.t!==t),{t,color:e.color}].sort((a,b)=>a.t-b.t)}:{...effect,bypassKeys:[...(effect.bypassKeys??[]).filter(k=>k.t!==t),{t,bypass:e.bypass}].sort((a,b)=>a.t-b.t)};
   return setLayer(doc,{...l,effects:l.effects!.map(x=>x.id===effect.id?next:x)});}
  case 'markers.set':{const c=compOf(doc);return withComp(doc,{...c,markers:[...e.markers].sort((a,b)=>a.t-b.t)});}
  case 'text.animators':{const l=layerOf(doc,e.layer);if(l.kind!=='text')fail('invalid','Text animators require a text layer.');return setLayer(doc,{...l,animators:e.animators.length?e.animators:undefined});}
  case 'layer.masks':{const l=layerOf(doc,e.layer);if(l.kind==='null'||l.kind==='audio')fail('invalid','Masks need a drawable layer.');return setLayer(doc,{...l,masks:e.masks.length?e.masks:undefined});}
  case 'layer.matte':{const l=layerOf(doc,e.layer);return setLayer(doc,{...l,matte:e.matte??undefined});}
  case 'layer.reveal':{const l=layerOf(doc,e.layer);if(l.kind!=='text')fail('invalid','Typewriter requires a text layer.');return setLayer(doc,{...l,textReveal:e.property});}
  case 'effect.amount':case 'effect.animate':case 'effect.key.remove':{const l=layerOf(doc,e.layer),c=compOf(doc),t=tickOf(c,e.t),effect=l.effects?.find(x=>x.id===e.effect)??fail('missing','Effect no longer exists.');let next=effect;
   const max=effect.kind==='blur'?64:1;
   if(e.type==='effect.amount'){if(!Number.isFinite(e.value)||e.value<0||e.value>max)fail('invalid','Effect strength is outside its supported range.');next=effect.animation?.keys.length?{...effect,animation:{...effect.animation,keys:upsertKey(effect.animation.keys,makeKey(t,e.value))}}:{...effect,amount:e.value};}
   else if(e.type==='effect.animate'){const sampled=effect.animation?evaluate(effect.animation,t) as number:effect.amount;next=e.on?{...effect,animation:effect.animation?.keys.length?effect.animation:{type:'scalar',value:sampled,keys:[makeKey(t,sampled)]}}:{...effect,amount:sampled,animation:undefined};}
   else {const p=effect.animation??fail('missing','Effect is not animated.');const keys=p.keys.filter(k=>k.t!==t);next=keys.length?{...effect,animation:{...p,keys}}:{...effect,amount:evaluate(p,t) as number,animation:undefined};}
   return setLayer(doc,{...l,effects:l.effects!.map(x=>x.id===effect.id?next:x)});}
  case 'easings.set':{const easings={version:1 as const,items:e.items};const p=validateEasingLib(easings);if(p.length)fail('invalid',p[0]);return {...doc,easings};}
  case 'motions.set':{const motions={version:1 as const,items:e.items};const p=validateMotionLib(motions);if(p.length)fail('invalid',p[0]);return {...doc,motions};}
  case 'textPresets.set':{const textPresets={version:1 as const,items:e.items};const p=validateTextPresetLib(textPresets);if(p.length)fail('invalid',p[0]);return {...doc,textPresets};}
  case 'asset.import':{const next={...doc,assets:doc.assets.some(a=>a.id===e.asset.id)?doc.assets:[...doc.assets,e.asset]};validateAnimationAssets(next);const c=compOf(doc);const l=createLayer('raster',c,{name:e.asset.sourceName,source:{assetId:e.asset.id,width:e.asset.width,height:e.asset.height}});return withLayers(next,ls=>[l,...ls]);}
  case 'audio.import':{
   const existing=doc.audioAssets??[];const next={...doc,audioAssets:existing.some(a=>a.id===e.asset.id)?existing:[...existing,e.asset]};validateAnimationAssets(next);
   const c=compOf(doc);const at=e.t===undefined?0:tickOf(c,e.t);
   const l=createLayer('audio',c,{name:e.asset.sourceName,inT:0,outT:e.asset.durationTicks,offset:at,audio:{assetId:e.asset.id,trimIn:0,volume:prop('scalar',100) as Property}},e.id);
   if(c.layers.some(x=>x.id===l.id))fail('invalid','Duplicate layer id.');
   return withLayers(next,ls=>[l,...ls]);}
  case 'audio.update':{
   const l=audioLayer(doc,e.layer);const asset=doc.audioAssets?.find(a=>a.id===l.audio!.assetId)??fail('missing','Audio file is missing.');
   const trimIn=e.trimIn??l.audio!.trimIn,length=e.length??(l.outT-l.inT),offset=e.offset??l.offset;
   if(![trimIn,length,offset].every(Number.isInteger))fail('invalid','Audio times must be whole ticks.');
   if(trimIn<0||trimIn>=asset.durationTicks)fail('invalid','Trim start must lie inside the audio file.');
   if(length<1||trimIn+length>asset.durationTicks)fail('invalid','Trim must stay inside the audio file.');
   if(Math.abs(offset)>3600*240000)fail('invalid','Offset must be within one hour.');
   return setLayer(doc,{...l,offset,inT:0,outT:length,audio:{...l.audio!,trimIn}});}
  case 'audio.volume.set':case 'audio.volume.animate':case 'audio.volume.key.remove':{
   const l=audioLayer(doc,e.layer),c=compOf(doc),t=tickOf(c,e.t),vol=l.audio!.volume;let next=vol;
   if(e.type==='audio.volume.set'){
    if(!Number.isFinite(e.value)||e.value<0||e.value>MAX_AUDIO_VOLUME)fail('invalid','Volume must be 0 to 200 percent.');
    next=vol.keys.length?{...vol,keys:upsertKey(vol.keys,makeKey(t,e.value))}:{...vol,value:e.value};}
   else if(e.type==='audio.volume.animate'){const sampled=evaluate(vol,t) as number;next=e.on?(vol.keys.length?vol:{...vol,keys:[makeKey(t,sampled)]}):{...vol,value:sampled,keys:[]};}
   else{if(!vol.keys.some(k=>k.t===t))fail('missing','No volume key at that time.');const keys=vol.keys.filter(k=>k.t!==t);next=keys.length?{...vol,keys}:{...vol,value:evaluate(vol,t) as number,keys:[]};}
   return setLayer(doc,{...l,audio:{...l.audio!,volume:next}});}
  case 'layer.effects':{if(!validEffects(e.effects))fail('invalid','Invalid effect stack.');return setLayer(doc,{...layerOf(doc,e.layer),effects:e.effects.map(x=>({...x}))});}
  case 'prop.pathMode':{if(!['parameter','arcLength'].includes(e.mode))fail('invalid','Invalid path mode.');return setProp(doc,e.layer,'position',p=>({...p,pathMode:e.mode}));}
  case 'layer.add':{const c=compOf(doc);const l=createLayer(e.kind,c,e.over,e.id);if(c.layers.some(x=>x.id===l.id))fail('invalid','Duplicate layer id.');if(l.parent&&!findLayer(c,l.parent))fail('missing','Parent layer does not exist.');return withLayers(doc,ls=>[l,...ls]);}
  case 'layer.remove':{const l=layerOf(doc,e.layer);return withLayers(doc,ls=>ls.filter(x=>x.id!==l.id).map(x=>{const y=x.parent===l.id?{...x,parent:null}:x;return y.matte?.source===l.id?{...y,matte:undefined}:y;}));}
  case 'layer.update':{
   const l=layerOf(doc,e.layer,e.locked===false&&e.name===undefined&&e.source===undefined);
   if(e.name!==undefined&&(typeof e.name!=='string'||!e.name.trim()||e.name.length>200))fail('invalid','Layer name must be 1 to 200 characters.');
   if(e.source&&!validSource({...l.source,...e.source}))fail('invalid','Invalid layer source.');
   if(e.source?.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(e.source.color))fail('invalid','Colour must be #rrggbb.');
   if(e.source?.size!==undefined&&!(e.source.size>0&&e.source.size<=2000))fail('invalid','Text size must be 1 to 2000.');
   if(e.source?.text!==undefined&&e.source.text.length>2000)fail('invalid','Text is too long.');
   return setLayer(doc,{...l,name:e.name?.trim()??l.name,visible:e.visible??l.visible,solo:e.solo??l.solo,locked:e.locked??l.locked,...(e.shy!==undefined?{shy:e.shy}:{}),source:{...l.source,...e.source}});}
  case 'layer.timing':{const c=compOf(doc);const l=layerOf(doc,e.layer);if(l.kind==='audio')fail('invalid','Use audio trim and offset for audio layers.');
   if(!Number.isInteger(e.inT)||!Number.isInteger(e.outT)||e.outT<=e.inT||e.inT<0||e.outT>c.duration)fail('invalid','Layer timing must be inside the composition with out after in.');return setLayer(doc,{...l,inT:e.inT,outT:e.outT});}
  case 'layer.parent':{const c=compOf(doc);const l=layerOf(doc,e.layer);
   if(e.parent!==null&&!findLayer(c,e.parent))fail('missing','Parent layer does not exist.');
   if(e.parent!==null&&wouldCycle(c,l.id,e.parent))fail('cycle','That parent would create a cycle.');
   if(!e.keepWorld)return setLayer(doc,{...l,parent:e.parent});
   const t=tickOf(c,e.t??0);
   if(l.transform.anchor.keys.length)fail('invalid','Keep-world needs a static anchor on the reparented layer.');
   const parent=e.parent?findLayer(c,e.parent)!:null,inv=parent?invertMatrix(worldMatrix(c,parent,t)):[1,0,0,1,0,0] as const;if(!inv)fail('invalid','Parent transform is singular.');
   const values=decomposeMatrix(multiplyMatrix(inv!,worldMatrix(c,l,t)),evaluate(l.transform.anchor,t) as Vec2);if(!values)fail('invalid','Keep-world needs shear or reflection, which this transform model cannot represent.');
   if(values!.scale.some(v=>v<0||v>10000))fail('invalid','Keep-world scale exceeds the supported range.');
   /* Animated hierarchies: the world pose is preserved exactly at t by rewriting the value at t into the new parent
      space (a key is inserted when none sits there); other keys keep their local motion, now read in the new space.
      Spatial tangents follow the exact linear map. Per-channel ease under a rotated map would lie, so it is refused. */
   const axisAligned=Math.abs(inv![1])<1e-9&&Math.abs(inv![2])<1e-9;
   const mapTangent=(v:Vec2):Vec2=>[inv![0]*v[0]+inv![2]*v[1],inv![1]*v[0]+inv![3]*v[1]];
   const writeProp=(p:Property,v:PropValue):Property=>{
    if(!p.keys.length)return {...p,value:v};
    const at=p.keys.find(k=>k.t===t);
    if(!at)return {...p,keys:upsertKey(p.keys,makeKey(t,v))};
    if((at.channelOut||at.channelIn)&&!axisAligned)fail('invalid','Keep-world with per-channel easing needs an axis-aligned parent transform.');
    const moved:Keyframe={...at,v,...(at.sIn?{sIn:mapTangent(at.sIn)}:{}),...(at.sOut?{sOut:mapTangent(at.sOut)}:{})};
    return {...p,keys:p.keys.map(k=>k.t===t?moved:k)};};
   return setLayer(doc,{...l,parent:e.parent,transform:{...l.transform,position:writeProp(l.transform.position,values!.position),scale:writeProp(l.transform.scale,values!.scale),rotation:writeProp(l.transform.rotation,values!.rotation)}});}
  case 'layer.reorder':{const l=layerOf(doc,e.layer);if(!Number.isInteger(e.index)||e.index<0)fail('invalid','Bad index.');
   return withLayers(doc,ls=>{const r=ls.filter(x=>x.id!==l.id);r.splice(Math.min(e.index,r.length),0,l);return r;});}
  case 'prop.set':{const c=compOf(doc);const v=checkValue(e.prop,e.value);
   return setProp(doc,e.layer,e.prop,p=>{if(!p.keys.length)return {...p,value:v};const t=tickOf(c,e.t);const at=p.keys.find(k=>k.t===t);
    return {...p,keys:upsertKey(p.keys,at?{...at,v}:makeKey(t,v))};});}
  case 'prop.animate':{const c=compOf(doc);const t=tickOf(c,e.t);
   return setProp(doc,e.layer,e.prop,p=>e.on?(p.keys.length?p:{...p,keys:[makeKey(t,p.value)]}):(p.keys.length?{...p,value:evaluate(p,t),keys:[]}:p));}
  case 'key.add':{const c=compOf(doc);const t=tickOf(c,e.t);return setProp(doc,e.layer,e.prop,p=>({...p,keys:upsertKey(p.keys,makeKey(t,evaluate(p,t)))}));}
  case 'key.remove':{const c=compOf(doc);const t=tickOf(c,e.t);
   return setProp(doc,e.layer,e.prop,p=>{if(!p.keys.some(k=>k.t===t))return fail('missing','No key at that time.');
    const keys=p.keys.filter(k=>k.t!==t);return keys.length?{...p,keys}:{...p,value:p.keys[0].v,keys:[]};});}
  case 'key.move':{const c=compOf(doc);const from=tickOf(c,e.from),to=tickOf(c,e.to);
   return setProp(doc,e.layer,e.prop,p=>{const k=p.keys.find(x=>x.t===from)??fail('missing','No key at the source time.');
    if(from===to)return p;
    if(p.keys.some(x=>x.t===to)&&!e.replace)return fail('collision','A key already exists at that time. Replace it explicitly.');
    return {...p,keys:upsertKey(p.keys.filter(x=>x.t!==from),{...k,t:to})};});}
  case 'key.interp':{const c=compOf(doc);const t=tickOf(c,e.t);
   const h=(a?:readonly [number,number])=>a&&(a.length!==2||!a.every(Number.isFinite)||a[0]<0||a[0]>1)?fail('invalid','Ease handle x must be within 0 and 1.'):a;
   const out=h(e.out),inn=h(e.in);
   return setProp(doc,e.layer,e.prop,p=>{if(!p.keys.some(k=>k.t===t))return fail('missing','No key at that time.');
    if(e.channel!==undefined){if(p.type!=='vec2'||![0,1].includes(e.channel))fail('invalid','Channel ease needs X or Y.');if(p.keys.some(k=>k.sIn||k.sOut))fail('invalid','Separate channel ease requires a straight path.');}
    return {...p,keys:p.keys.map(k=>{if(k.t!==t)return k;if(e.channel===undefined){const {channelOut:_o,channelIn:_i,...shared}=k;return {...shared,interp:e.interp,out:out??k.out,in:inn??k.in};}const outs=[...(k.channelOut??[k.out,k.out])] as [Vec2,Vec2],ins=[...(k.channelIn??[k.in,k.in])] as [Vec2,Vec2];outs[e.channel]=out??outs[e.channel];ins[e.channel]=inn??ins[e.channel];return {...k,interp:e.interp,channelOut:outs,channelIn:ins};})};});}
  case 'keys.move':{const c=compOf(doc);if(!Number.isFinite(e.delta))return fail('invalid','Delta must be a number.');
   const df=Math.round(e.delta*c.fps.num/(c.fps.den*240000));if(df===0)return doc;
   return foldGroups(doc,e.keys,(d,layer,prop,times)=>setProp(d,layer,prop,p=>{
    const moved=p.keys.filter(k=>times.has(k.t)).map(k=>({...k,t:frameToTick(tickToFrame(k.t,c.fps)+df,c.fps)}));
    if(new Set(moved.map(k=>k.t)).size!==moved.length)return fail('collision','Moved keys would overlap.');
    if(moved.some(k=>k.t<c.start||k.t>c.start+c.duration))return fail('invalid','Keys cannot move outside the composition.');
    const times2=new Set(moved.map(k=>k.t));const rest=p.keys.filter(k=>!times.has(k.t));
    if(!e.replace&&rest.some(k=>times2.has(k.t)))return fail('collision','A key already exists at that time. Replace it explicitly.');
    return {...p,keys:[...rest.filter(k=>!times2.has(k.t)),...moved].sort((a,b)=>a.t-b.t)};}));}
  case 'keys.remove':return foldGroups(doc,e.keys,(d,layer,prop,times)=>setProp(d,layer,prop,p=>{
   const keys=p.keys.filter(k=>!times.has(k.t));return keys.length?{...p,keys}:{...p,value:p.keys[0].v,keys:[]};}));
  case 'keys.paste':{const c=compOf(doc);layerOf(doc,e.layer);
   if(!e.items?.length)return fail('invalid','Nothing to paste.');
   let cur=doc;const base=tickOf(c,e.t);
   const byProp=new Map<TransformKey,Keyframe[]>();
   for(const it of e.items){
    if(!TRANSFORM_KEYS.includes(it.prop))return fail('invalid','Unknown property in clipboard.');
    const t=snapToFrame(base+it.dt,c.fps);if(t<c.start||t>c.start+c.duration)return fail('invalid','Pasted keys would end outside the composition.');
    const v=checkValue(it.prop,it.key.v);const isVec=PROP_META[it.prop].type==='vec2';
    const k:Keyframe={t,v,interp:it.key.interp,out:it.key.out,in:it.key.in,...(isVec&&it.key.sIn?{sIn:it.key.sIn}:{}),...(isVec&&it.key.sOut?{sOut:it.key.sOut}:{}),...(isVec&&it.key.channelOut?{channelOut:it.key.channelOut}:{}),...(isVec&&it.key.channelIn?{channelIn:it.key.channelIn}:{})};
    if(!['hold','linear','bezier'].includes(k.interp)||!checkHandle(k.out)||!checkHandle(k.in))return fail('invalid','Clipboard key has invalid easing.');
    byProp.set(it.prop,[...(byProp.get(it.prop)??[]),k]);
   }
   for(const [prop,ks] of byProp)cur=setProp(cur,e.layer,prop,p=>{
    const times=new Set(ks.map(k=>k.t));return {...p,keys:[...p.keys.filter(k=>!times.has(k.t)),...ks].sort((a,b)=>a.t-b.t)};});
   return cur;}
  case 'keys.interp':{
   if(e.interp===undefined&&!e.out&&!e.in)return fail('invalid','Nothing to change.');
   if((e.out&&!checkHandle(e.out))||(e.in&&!checkHandle(e.in)))return fail('invalid','Ease handle x must be within 0 and 1.');
   return foldGroups(doc,e.keys,(d,layer,prop,times)=>setProp(d,layer,prop,p=>({...p,keys:p.keys.map(k=>{if(!times.has(k.t))return k;const {channelOut:_o,channelIn:_i,...shared}=k;return {...shared,interp:e.interp??k.interp,out:e.out??k.out,in:e.in??k.in};})})));}
  case 'key.spatial':{const c=compOf(doc);const t=tickOf(c,e.t);
   if(e.prop!=='position')return fail('invalid','Spatial tangents apply to position only.');
   const position=layerOf(doc,e.layer).transform.position;if(position.keys.some(k=>k.channelIn||k.channelOut))fail('invalid','Relink channel easing with a shared preset before editing a spatial path.');
   const ok=(v?:Vec2)=>v===undefined||(Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6));
   if(!ok(e.sIn)||!ok(e.sOut))return fail('invalid','Tangents must be two finite numbers.');
   return setProp(doc,e.layer,e.prop,p=>{if(!p.keys.some(k=>k.t===t))return fail('missing','No key at that time.');
    return {...p,keys:p.keys.map(k=>k.t===t?{...k,...(e.sIn?{sIn:e.sIn}:{}),...(e.sOut?{sOut:e.sOut}:{})}:k)};});}
  case 'keys.spatial':return foldGroups(doc,e.keys,(d,layer,prop,times)=>{
   if(prop!=='position')return fail('invalid','Spatial tangents apply to position only.');
   if(e.mode==='smooth'&&layerOf(d,layer).transform.position.keys.some(k=>k.channelIn||k.channelOut))fail('invalid','Relink channel easing with a shared preset before smoothing a spatial path.');
   return setProp(d,layer,prop,p=>({...p,keys:p.keys.map((k,i)=>{
    if(!times.has(k.t))return k;
    const {sIn:_i,sOut:_o,...bare}=k;if(e.mode==='straight')return bare;
    const prev=p.keys[i-1]?.v as Vec2|undefined,next=p.keys[i+1]?.v as Vec2|undefined,cur=k.v as Vec2;
    let sOut:Vec2=[0,0],sIn:Vec2=[0,0];
    if(prev&&next){sOut=[(next[0]-prev[0])/6,(next[1]-prev[1])/6];sIn=[-sOut[0],-sOut[1]];}
    else if(next)sOut=[(next[0]-cur[0])/3,(next[1]-cur[1])/3];
    else if(prev)sIn=[(prev[0]-cur[0])/3,(prev[1]-cur[1])/3];
    return {...bare,sIn,sOut};})}));});
  case 'workarea.set':{const c=compOf(doc);num(e.in,'Work area in must be a number.');num(e.out,'Work area out must be a number.');
   const a=snapToFrame(e.in,c.fps),b=snapToFrame(e.out,c.fps);
   if(a<0||b>c.duration||b<=a)return fail('invalid','Work area must lie inside the composition with out after in.');
   if(a===c.workArea.in&&b===c.workArea.out)return doc;
   return withComp(doc,{...c,workArea:{in:a,out:b}});}
  case 'modifier.add':{
   const errs=validateModifiers([e.modifier]);if(errs.length)return fail('invalid',errs[0]);
   return checkLinks(setProp(doc,e.layer,e.prop,p=>({...p,modifiers:[...(p.modifiers??[]),e.modifier]})),e.modifier);}
  case 'modifier.set':{
   const errs=validateModifiers([e.modifier]);if(errs.length)return fail('invalid',errs[0]);
   return checkLinks(setProp(doc,e.layer,e.prop,p=>{const ms=[...(p.modifiers??[])];if(!Number.isInteger(e.index)||e.index<0||e.index>=ms.length)return fail('missing','No modifier at that index.');if(ms[e.index].type!==e.modifier.type)return fail('invalid','A modifier keeps its type.');ms[e.index]=e.modifier;return {...p,modifiers:ms};}),e.modifier);}
  case 'modifier.remove':
   return setProp(doc,e.layer,e.prop,p=>{const ms=[...(p.modifiers??[])];if(!Number.isInteger(e.index)||e.index<0||e.index>=ms.length)return fail('missing','No modifier at that index.');ms.splice(e.index,1);return {...p,modifiers:ms.length?ms:undefined};});
 }
}
/** Apply several edits as one atomic step. Any failure throws and nothing is applied. */
export function applyEdits(doc:AnimationDocument,edits:readonly Edit[]):AnimationDocument{
 let cur=doc;for(const e of edits)cur=applyEdit(cur,e);
 return cur===doc?doc:{...cur,revision:doc.revision+1};
}
/** Safety net used by recovery tests and import: an edit must never produce an invalid document. */
export const isConsistent=(doc:AnimationDocument)=>validateDocument(doc).length===0;
export {TRANSFORM_KEYS};
