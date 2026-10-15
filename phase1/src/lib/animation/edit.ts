import {duplicateLayers} from './layerDuplicate';
import {worldMatrix,invertMatrix,multiplyMatrix,decomposeMatrix} from './scene';
import {layerKeyTimes,shiftLayerKeys,stretchLayer,hasKeyCollision} from './layerShift';
import {validateEasingLib} from './easingModel';
import {validateMotionLib} from './motionModel';
import {validateTextPresetLib} from './textPresetModel';
import {validatePoseLib} from './poseModel';
import type {InterfaceAsset} from '../interface/schema';
import {validateAnimationAssets} from './assetsValidation';
import {MAX_AUDIO_VOLUME,type AudioAsset} from './audioCore';
import {validPathFx,validateLayerTemplates,type GradientStop,GRADIENT_RANGE,REPEATER_RANGE,validRepeater,STYLE_KINDS,OFFSET_KINDS,MAX_COLOR_KEYS,type ColorKey,type ColorEase,COLOR_EASES,validShutter,type Shutter,validatePrecomps,precompTransform,prop,createComposition,type TextAnimator,type LayerMask,type LayerMatte,type ClipItem,type KeyRef,type Vec2,createLayer,findComp,findLayer,PROP_META,wouldCycle,EASE_IN,EASE_OUT,TRANSFORM_KEYS,validateDocument,type AnimationDocument,type CompSettings,type Composition,type Interp,type Keyframe,type Layer,type LayerKind,type LayerSource,type LayerEffect,validSource,validEffects,type Property,type PropValue,type TransformKey} from './model';
import {setGradientStop} from './shapes';
import {parseGradientStopLane,parseGradientLane,parseGradientColorLane,type GradientKey,type RepeaterKey,type StyleLaneId} from './keyTypes';
import {evaluate} from './interpolate';
import {validGuides,MAX_GUIDES} from './guides';
import {templateLayers,templateLayersOf} from './layerTemplates';
import {REACTIVE_RANGE,MAX_REACTIVE_KEYS} from './audioReactive';
import {colorAt} from './colorKeys';
import {validateModifiers,linkProblems} from './modifiers';
import {snapToFrame,tickToFrame,frameToTick,validRate} from './time';
/** Typed `animation.*` edits. Every mutation goes through applyEdit so undo, recovery and AI share one path. */
export type Edit=
 |{type:'comp.add';settings?:CompSettings;id?:string}
 |{type:'comp.update';comp?:string;settings:CompSettings}
 |{type:'comp.select';comp:string}
 |{type:'comp.remove';comp:string}
 |{type:'comp.duplicate';comp:string;id:string}
 |{type:'layer.add';kind:LayerKind;over?:Partial<Layer>;id?:string}
 |{type:'layer.remove';layer:string}
 |{type:'layer.update';layer:string;name?:string;visible?:boolean;solo?:boolean;locked?:boolean;shy?:boolean;source?:Partial<LayerSource>}
 |{type:'layer.timing';layer:string;inT:number;outT:number}
 |{type:'layer.stretch';layer:string;percent:number}
 |{type:'layer.shift';layer:string;delta:number;mode:'slide'|'slip'}
 |{type:'layer.parent';layer:string;parent:string|null;keepWorld?:boolean;t?:number}
 |{type:'layer.reorder';layer:string;index:number}
 |{type:'layers.duplicate';layers:readonly string[];ids:readonly string[]}
 |{type:'prop.set';layer:string;prop:TransformKey;value:PropValue;t:number}
 |{type:'prop.animate';layer:string;prop:TransformKey;on:boolean;t:number}
 |{type:'key.add';layer:string;prop:TransformKey;t:number}
 |{type:'key.remove';layer:string;prop:TransformKey;t:number}
 |{type:'key.move';layer:string;prop:TransformKey;from:number;to:number;replace?:boolean}
 |{type:'key.interp';layer:string;prop:TransformKey;t:number;interp:Interp;channel?:0|1;out?:readonly [number,number];in?:readonly [number,number]}
 /** Move many keys by the same number of ticks (snapped to whole frames) as one step. */
 |{type:'keys.move';keys:readonly KeyRef[];delta:number;replace?:boolean}
 /** Gives keys exact new ticks in one step (each key its own target). */
 /** Adds a layer that shows another composition of the document. */
 |{type:'precomp.add';comp:string;id?:string}
 |{type:'layer.motionBlur';layers:readonly string[];enabled:boolean}
 |{type:'comp.shutter';comp?:string;shutter:Shutter|null}
 |{type:'precomp.make';layers:readonly string[];name?:string;id?:string;compId?:string}
 |{type:'keys.retime';moves:readonly {layer:string;prop:TransformKey;from:number;to:number}[]}
 |{type:'keys.remove';keys:readonly KeyRef[]}
 |{type:'keys.paste';layer:string;items:readonly ClipItem[];t:number}
 |{type:'keys.interp';keys:readonly KeyRef[];interp?:Interp;out?:readonly [number,number];in?:readonly [number,number]}
 /** Spatial tangents of a position key, as offsets from the key value. */
 |{type:'key.spatial';layer:string;prop:TransformKey;t:number;sIn?:Vec2;sOut?:Vec2}
 |{type:'keys.spatial';keys:readonly KeyRef[];mode:'smooth'|'straight'}
 |{type:'effect.colorKey';layer:string;effect:string;color:string;t:number}
 |{type:'effect.bypassKey';layer:string;effect:string;bypass:boolean;t:number}
 |{type:'layer.stroke';layer:string;stroke:NonNullable<Layer['stroke']>|null}
 |{type:'gradient.stop';layer:string;target:'fill'|'stroke';index:number;prop:'offset'|'color';op:'set'|'animate'|'remove'|'ease';value?:number;color?:string;ease?:ColorEase|null;on?:boolean;t:number}
 |{type:'gradient.color.ease';layer:string;target:'fill'|'stroke';which:'start'|'end';t:number;ease:ColorEase|null}
 |{type:'gradient.color';layer:string;target:'fill'|'stroke';which:'start'|'end';op:'set'|'animate'|'remove';color?:string;on?:boolean;t:number}
 |{type:'gradient.prop';layer:string;target:'fill'|'stroke';prop:GradientKey;op:'set'|'animate'|'remove';value?:number;on?:boolean;t:number}
 |{type:'gradient.angle';layer:string;target:'fill'|'stroke';op:'set'|'animate'|'remove';value?:number;on?:boolean;t:number}
 |{type:'repeater.prop';layer:string;prop:RepeaterKey;op:'set'|'animate'|'remove';value?:number;on?:boolean;t:number}
 |{type:'textpath.start';layer:string;op:'set'|'animate'|'remove';value?:number;on?:boolean;t:number}
 |{type:'pathfx.size';layer:string;op:'set'|'animate'|'remove';value?:number;on?:boolean;t:number}
 |{type:'layer.pathFx';layer:string;pathFx:NonNullable<Layer['pathFx']>|null}
 |{type:'layer.repeater';layer:string;repeater:NonNullable<Layer['repeater']>|null}
 |{type:'effect.style';layer:string;effect:string;blur?:number;distance?:number;angle?:number}
 |{type:'effect.amount';layer:string;effect:string;value:number;t:number}
 |{type:'effect.animate';layer:string;effect:string;on:boolean;t:number}
 |{type:'effect.key.remove';layer:string;effect:string;t:number}
 |{type:'text.animators';layer:string;animators:readonly TextAnimator[]}
 |{type:'layer.masks';layer:string;masks:readonly LayerMask[]}
 |{type:'layer.matte';layer:string;matte:LayerMatte|null}
 |{type:'layer.reveal';layer:string;property:Property}
 |{type:'audio.reactive';layer:string;prop:'scale'|'opacity'|'rotation';keys:readonly {t:number;v:number}[]}
 |{type:'guides.set';guides:readonly import('./guides').Guide[]}
 |{type:'markers.set';markers:readonly import('./model').Marker[]}
 |{type:'asset.import';asset:InterfaceAsset}
 /** Replace the document's saved motion presets (library edits compute the full list). */
 |{type:'easings.set';items:readonly import('./easingModel').EasingSet[]}
 |{type:'poses.set';items:readonly import('./poseModel').PoseSet[]}
 |{type:'motions.set';items:readonly import('./motionModel').MotionSet[]}
 |{type:'layerTemplates.set';items:readonly import('./model').LayerTemplate[]}
 |{type:'layerTemplate.insert';template:string;layer:string;at:number;/** Fresh ids for the further layers of a multi-layer template, in template order. */layers?:readonly string[]}
 |{type:'textPresets.set';items:readonly import('./textPresetModel').TextPresetSet[]}
 /** Embed a prepared audio asset and add an audio layer whose clip starts at `t` (default 0). */
 |{type:'audio.import';asset:AudioAsset;t?:number;id?:string}
 /** Trim and place an audio clip. All values in ticks; `length` is the played duration. */
 |{type:'audio.update';layer:string;trimIn?:number;length?:number;offset?:number}
 |{type:'audio.volume.set';layer:string;value:number;t:number}
 |{type:'audio.volume.animate';layer:string;on:boolean;t:number}
 |{type:'audio.volume.key.remove';layer:string;t:number}
 |{type:'color.ease';layer:string;prop:'fill'|'stroke';t:number;ease:ColorEase|null}
 |{type:'style.key.move';layer:string;lane:StyleLaneId;from:number;to:number}
 /** Pastes copied style keys (`items` keep their relative time `dt`) into a lane that already has keys on the layer. */
 |{type:'style.keys.paste';layer:string;lane:StyleLaneId;t:number;items:readonly {dt:number;key:object}[]}
 |{type:'color.prop';layer:string;prop:'fill'|'stroke';op:'set'|'animate'|'remove';color?:string;on?:boolean;t:number}
 |{type:'stroke.prop';layer:string;prop:'width'|'opacity';op:'set'|'animate'|'remove';value?:number;on?:boolean;t:number}
 |{type:'layer.gain.set';layer:string;value:number;t:number}
 |{type:'layer.gain.animate';layer:string;on:boolean;t:number}
 |{type:'layer.gain.key.remove';layer:string;t:number}
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
/** Applies `shift` to the key array of one style lane (fill, stroke, gradients, repeater, volume and more). Fails when the layer has no such lane. */
type LaneShift=<K extends {t:number}>(keys:readonly K[]|undefined)=>K[];
const MAX_STYLE_PASTE=200;
function applyLane(doc:AnimationDocument,layer:string,lane:StyleLaneId,shift:LaneShift,allowLocked=false):AnimationDocument{
   const l=layerOf(doc,layer,allowLocked);
   if(lane==='gain'){if(l.kind!=='comp'||!l.gain)fail('missing','No volume keys.');return setLayer(doc,{...l,gain:{...l.gain!,keys:shift(l.gain!.keys)}});}
   if(lane==='strokeWidth'||lane==='strokeOpacity'){const f=lane==='strokeWidth'?'widthAnim':'opacityAnim',a=l.stroke?.[f];if(!l.stroke||!a)fail('missing','No stroke keys.');return setLayer(doc,{...l,stroke:{...l.stroke!,[f]:{...a!,keys:shift(a!.keys)}}});}
   if(lane==='textPathStart'){const a=l.source.textPathStartAnim;if(!a)fail('missing','No text path keys.');return setLayer(doc,{...l,source:{...l.source,textPathStartAnim:{...a!,keys:shift(a!.keys)}}});}
   if(lane==='pathFxSize'){const a=l.pathFx?.sizeAnim;if(!l.pathFx||!a)fail('missing','No path effect keys.');return setLayer(doc,{...l,pathFx:{...l.pathFx!,sizeAnim:{...a!,keys:shift(a!.keys)}}});}
   const gs=parseGradientStopLane(lane);
   if(gs){const fill=gs.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient,st=g?.stops?.[gs.index];if(!g||!st||(gs.prop==='offset'?!st.offsetAnim:!st.colorKeys))fail('missing','No gradient stop keys.');
    const ns:GradientStop=gs.prop==='offset'?{...st!,offsetAnim:{...st!.offsetAnim!,keys:shift(st!.offsetAnim!.keys)}}:{...st!,colorKeys:shift(st!.colorKeys!)};
    const ng={...g!,stops:g!.stops!.map((x,i)=>i===gs.index?ns:x)};return setLayer(doc,fill?{...l,source:{...l.source,gradient:ng}}:{...l,stroke:{...l.stroke!,gradient:ng}});}
   const gc=parseGradientColorLane(lane);
   if(gc){const fill=gc.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient,a=g?.colorKeys?.[gc.key];if(!g||!a)fail('missing','No gradient colour keys.');const ng={...g!,colorKeys:{...g!.colorKeys,[gc.key]:shift(a!)}};return setLayer(doc,fill?{...l,source:{...l.source,gradient:ng}}:{...l,stroke:{...l.stroke!,gradient:ng}});}
   const gl=parseGradientLane(lane);
   if(gl){const fill=gl.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient,a=g?.anim?.[gl.key];if(!g||!a)fail('missing','No gradient keys.');const ng={...g!,anim:{...g!.anim,[gl.key]:{...a!,keys:shift(a!.keys)}}};return setLayer(doc,fill?{...l,source:{...l.source,gradient:ng}}:{...l,stroke:{...l.stroke!,gradient:ng}});}
   if(lane==='gradFillAngle'||lane==='gradStrokeAngle'){const fill=lane==='gradFillAngle',g=fill?l.source.gradient:l.stroke?.gradient,a=g?.angleAnim;if(!g||!a)fail('missing','No gradient angle keys.');const ng={...g!,angleAnim:{...a!,keys:shift(a!.keys)}};return setLayer(doc,fill?{...l,source:{...l.source,gradient:ng}}:{...l,stroke:{...l.stroke!,gradient:ng}});}
   if(lane.startsWith('rep')){const k=(lane[3].toLowerCase()+lane.slice(4)) as RepeaterKey,a=l.repeater?.anim?.[k];if(!l.repeater||!a)fail('missing','No repeater keys.');return setLayer(doc,{...l,repeater:{...l.repeater!,anim:{...l.repeater!.anim,[k]:{...a!,keys:shift(a!.keys)}}}});}
   const ck=l.colorKeys?.[lane as 'fill'|'stroke'];if(!ck)fail('missing','No colour keys.');return setLayer(doc,{...l,colorKeys:{...l.colorKeys,[lane]:shift(ck)}});
}

/** The keys of one style lane, for copying. Empty when the layer has no such lane. */
export const MAX_COMPS=50;
export function styleLaneKeys(doc:AnimationDocument,layer:string,lane:StyleLaneId):readonly object[]{
 let out:readonly object[]=[];
 try{applyLane(doc,layer,lane,keys=>{out=keys??[];return [...(keys??[])];},true);}catch(e){if(!(e instanceof EditError))throw e;}
 return out;
}
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
  case 'comp.duplicate':{const c=findComp(doc,e.comp)??fail('missing','Composition does not exist.');if(doc.compositions.length>=MAX_COMPS)return fail('invalid',`At most ${MAX_COMPS} compositions.`);if(doc.compositions.some(x=>x.id===e.id))return fail('invalid','Duplicate composition id.');const copy={...structuredClone(c),id:e.id,name:`${c.name} copy`.slice(0,200)};return {...doc,compositions:[...doc.compositions,copy],activeComp:copy.id};}
  case 'comp.remove':{if(doc.compositions.length<2)return fail('invalid','A document needs at least one composition.');if(!findComp(doc,e.comp))return fail('missing','Composition does not exist.');const user=doc.compositions.find(c=>c.id!==e.comp&&c.layers.some(l=>l.kind==='comp'&&l.source.compId===e.comp));if(user)return fail('invalid',`Composition is used as a layer in "${user.name}".`);const rest=doc.compositions.filter(c=>c.id!==e.comp);return {...doc,compositions:rest,activeComp:doc.activeComp===e.comp?rest[0].id:doc.activeComp};}
  case 'gradient.stop':{
   const l=layerOf(doc,e.layer),fill=e.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient;if(!g)fail('invalid','The layer has no gradient there.');
   const st=g!.stops?.[e.index];if(!st)fail('missing','No such gradient stop.');const stop=st!;
   const t=tickOf(compOf(doc),e.t),round=(n:number)=>Math.round(n*1e4)/1e4;
   const withG=(x:NonNullable<typeof g>):Layer=>fill?{...l,source:{...l.source,gradient:x}}:{...l,stroke:{...l.stroke!,gradient:x}};
   const replace=(next:GradientStop)=>withG({...g!,stops:g!.stops!.map((x,i)=>i===e.index?next:x)} as NonNullable<typeof g>);
   const clean=(x:GradientStop,k:'offsetAnim'|'colorKeys'):GradientStop=>{const y={...x};delete y[k];return y;};
   if(e.prop==='offset'){
    const anim=stop.offsetAnim;
    if(e.op==='ease')fail('invalid','Offset keys have no colour ease.');
    if(e.op==='set'){
     if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<0.01||e.value>0.99)fail('invalid','Stop offset must be 0.01 to 0.99.');
     if(anim?.keys.length)return setLayer(doc,replace({...stop,offsetAnim:{...anim,keys:upsertKey(anim.keys,makeKey(t,e.value as number))}}));
     return setLayer(doc,withG(setGradientStop(g!,e.index,{offset:e.value as number}) as NonNullable<typeof g>));}
    if(e.op==='animate'){
     if(e.on)return anim?.keys.length?doc:setLayer(doc,replace({...stop,offsetAnim:{...prop('scalar',stop.offset),keys:[makeKey(t,stop.offset)]}}));
     if(!anim?.keys.length)return doc;
     return setLayer(doc,withG(setGradientStop({...g!,stops:g!.stops!.map((x,i)=>i===e.index?clean(x,'offsetAnim'):x)} as NonNullable<typeof g>,e.index,{offset:round(evaluate(anim,t) as number)}) as NonNullable<typeof g>));}
    if(!anim||!anim.keys.some(x=>x.t===t))fail('missing','No stop offset key at that time.');
    const keys=anim!.keys.filter(x=>x.t!==t);
    if(keys.length)return setLayer(doc,replace({...stop,offsetAnim:{...anim!,keys}}));
    return setLayer(doc,withG(setGradientStop({...g!,stops:g!.stops!.map((x,i)=>i===e.index?clean(x,'offsetAnim'):x)} as NonNullable<typeof g>,e.index,{offset:round(evaluate(anim!,t) as number)}) as NonNullable<typeof g>));}
   const keys=stop.colorKeys,cur=stop.color;
   const putC=(c:string|undefined,ks:readonly ColorKey[]|undefined)=>{const base=clean(stop,'colorKeys');return setLayer(doc,replace({...base,...(c!==undefined?{color:c}:{}),...(ks?.length?{colorKeys:ks}:{})}));};
   if(e.op==='set'){
    if(typeof e.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(e.color))fail('invalid','Colour must be #rrggbb.');
    const c=(e.color as string).toLowerCase();
    if(keys?.length){const old=keys.find(k=>k.t===t),next=[...keys.filter(k=>k.t!==t),{t,color:c,...(old?.ease?{ease:old.ease}:{})}].sort((a,b)=>a.t-b.t);if(next.length>MAX_COLOR_KEYS)fail('invalid',`At most ${MAX_COLOR_KEYS} colour keys.`);return putC(undefined,next);}
    return putC(c,undefined);}
   if(e.op==='animate'){
    if(e.on)return keys?.length?doc:putC(undefined,[{t,color:cur}]);
    return keys?.length?putC(colorAt(keys,cur,t),undefined):doc;}
   if(e.op==='ease'){
    if(e.ease!==null&&e.ease!==undefined&&!(COLOR_EASES as readonly string[]).includes(e.ease))fail('invalid','Unknown ease.');
    if(!keys||!keys.some(k=>k.t===t))fail('missing','No stop colour key at that time.');
    return putC(undefined,keys!.map(k=>{if(k.t!==t)return k;const {ease:_o,...rest}=k;return e.ease==null||e.ease==='linear'?rest:{...rest,ease:e.ease as ColorEase};}));}
   if(!keys||!keys.some(k=>k.t===t))fail('missing','No stop colour key at that time.');
   const rest=keys!.filter(k=>k.t!==t);
   return rest.length?putC(undefined,rest):putC(colorAt(keys,cur,t),undefined);}
  case 'gradient.color.ease':{
   const l=layerOf(doc,e.layer),fill=e.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient;if(!g)fail('invalid','The layer has no gradient there.');
   const t=tickOf(compOf(doc),e.t),keys=g!.colorKeys?.[e.which];
   if(e.ease!==null&&!(COLOR_EASES as readonly string[]).includes(e.ease))fail('invalid','Unknown ease.');
   if(!keys||!keys.some(k=>k.t===t))fail('missing','No gradient colour key at that time.');
   const next=keys!.map(k=>{if(k.t!==t)return k;const {ease:_o,...rest}=k;return e.ease===null||e.ease==='linear'?rest:{...rest,ease:e.ease as ColorEase};});
   const ng={...g!,colorKeys:{...g!.colorKeys,[e.which]:next}};
   return setLayer(doc,fill?{...l,source:{...l.source,gradient:ng}}:{...l,stroke:{...l.stroke!,gradient:ng}});}
  case 'gradient.color':{
   const l=layerOf(doc,e.layer),fill=e.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient;if(!g)fail('invalid','The layer has no gradient there.');
   const w=e.which,t=tickOf(compOf(doc),e.t),keys=g!.colorKeys?.[w],cur=g![w];
   const withG=(x:NonNullable<typeof g>):Layer=>fill?{...l,source:{...l.source,gradient:x}}:{...l,stroke:{...l.stroke!,gradient:x}};
   const put=(st:string|undefined,ks:readonly ColorKey[]|undefined)=>{const {colorKeys:_c,...rest}=g!;const m={...(g!.colorKeys??{})} as Record<string,readonly ColorKey[]>;if(ks?.length)m[w]=ks;else delete m[w];return setLayer(doc,withG({...rest,...(st!==undefined?{[w]:st}:{}),...(Object.keys(m).length?{colorKeys:m}:{})} as NonNullable<typeof g>));};
   if(e.op==='set'){
    if(typeof e.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(e.color))fail('invalid','Colour must be #rrggbb.');
    const c=(e.color as string).toLowerCase();
    if(keys?.length){const old=keys.find(k=>k.t===t),next=[...keys.filter(k=>k.t!==t),{t,color:c,...(old?.ease?{ease:old.ease}:{})}].sort((a,b)=>a.t-b.t);if(next.length>MAX_COLOR_KEYS)fail('invalid',`At most ${MAX_COLOR_KEYS} colour keys.`);return put(undefined,next);}
    return put(c,undefined);}
   if(e.op==='animate'){
    if(e.on)return keys?.length?doc:put(undefined,[{t,color:cur}]);
    return keys?.length?put(colorAt(keys,cur,t),undefined):doc;}
   if(!keys||!keys.some(k=>k.t===t))fail('missing','No gradient colour key at that time.');
   const rest=keys!.filter(k=>k.t!==t);
   return rest.length?put(undefined,rest):put(colorAt(keys,cur,t),undefined);}
  case 'gradient.prop':{
   const l=layerOf(doc,e.layer),fill=e.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient;if(!g)fail('invalid','The layer has no gradient there.');
   const k=e.prop,[lo,hi]=GRADIENT_RANGE[k],t=tickOf(compOf(doc),e.t),anim=g!.anim?.[k],opac=k==='startOpacity'||k==='endOpacity',staticV:number=(g![k]??(opac?100:0.5)) as number,round=(n:number)=>Math.round(n*1e4)/1e4;
   const withG=(x:NonNullable<typeof g>):Layer=>fill?{...l,source:{...l.source,gradient:x}}:{...l,stroke:{...l.stroke!,gradient:x}};
   const put=(st:number|undefined,a:Property|undefined)=>{const {anim:_a,...rest}=g!;const m={...(g!.anim??{})} as Record<string,Property>;if(a)m[k]=a;else delete m[k];const base={...rest} as Record<string,unknown>;if(st!==undefined){if(opac&&st===100)delete base[k];else base[k]=st;}return setLayer(doc,withG({...base,...(Object.keys(m).length?{anim:m}:{})} as NonNullable<typeof g>));};
   if(e.op==='set'){
    if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<lo||e.value>hi)fail('invalid',`Gradient ${k} must be ${lo} to ${hi}.`);
    if(anim?.keys.length)return put(undefined,{...anim,keys:upsertKey(anim.keys,makeKey(t,e.value as number))});
    return put(e.value as number,undefined);}
   if(e.op==='animate'){
    if(e.on)return anim?.keys.length?doc:put(undefined,{...prop('scalar',staticV),keys:[makeKey(t,staticV)]});
    if(!anim?.keys.length)return doc;return put(round(evaluate(anim,t) as number),undefined);}
   if(!anim||!anim.keys.some(x=>x.t===t))fail('missing','No gradient key at that time.');
   const keys=anim!.keys.filter(x=>x.t!==t);
   if(keys.length)return put(undefined,{...anim!,keys});
   return put(round(evaluate(anim!,t) as number),undefined);}
  case 'gradient.angle':{
   const l=layerOf(doc,e.layer),fill=e.target==='fill',g=fill?l.source.gradient:l.stroke?.gradient;if(!g)fail('invalid','The layer has no gradient there.');
   const t=tickOf(compOf(doc),e.t),anim=g!.angleAnim,round=(n:number)=>Math.round(n*100)/100;
   const withG=(x:NonNullable<typeof g>):Layer=>fill?{...l,source:{...l.source,gradient:x}}:{...l,stroke:{...l.stroke!,gradient:x}};
   const noAnim=(x:NonNullable<typeof g>)=>{const {angleAnim:_a,...rest}=x;return rest as NonNullable<typeof g>;};
   if(e.op==='set'){
    if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<-3600||e.value>3600)fail('invalid','Gradient angle must be -3600 to 3600.');
    if(anim?.keys.length)return setLayer(doc,withG({...g!,angleAnim:{...anim,keys:upsertKey(anim.keys,makeKey(t,e.value as number))}}));
    return setLayer(doc,withG({...g!,angle:e.value as number}));}
   if(e.op==='animate'){
    if(e.on)return anim?.keys.length?doc:setLayer(doc,withG({...g!,angleAnim:{...prop('scalar',g!.angle),keys:[makeKey(t,g!.angle)]}}));
    if(!anim?.keys.length)return doc;return setLayer(doc,withG({...noAnim(g!),angle:round(evaluate(anim,t) as number)}));}
   if(!anim||!anim.keys.some(x=>x.t===t))fail('missing','No gradient angle key at that time.');
   const keys=anim!.keys.filter(x=>x.t!==t);
   if(keys.length)return setLayer(doc,withG({...g!,angleAnim:{...anim!,keys}}));
   return setLayer(doc,withG({...noAnim(g!),angle:round(evaluate(anim!,t) as number)}));}
  case 'repeater.prop':{
   const l=layerOf(doc,e.layer);if(!l.repeater)fail('invalid','The layer has no repeater.');const r=l.repeater!,k=e.prop,[lo,hi]=REPEATER_RANGE[k];
   const t=tickOf(compOf(doc),e.t),anim=r.anim?.[k],staticV:number=(r[k]??(k==='scale'||k==='opacity'?100:0)) as number,round=(n:number)=>Math.round(n*100)/100;
   const put=(x:Partial<NonNullable<Layer['repeater']>>,a:Property|undefined)=>{const {anim:_a,...rest}=r;const m={...(r.anim??{})} as Record<string,Property>;if(a)m[k]=a;else delete m[k];return setLayer(doc,{...l,repeater:{...rest,...x,...(Object.keys(m).length?{anim:m}:{})}});};
   if(e.op==='set'){
    if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<lo||e.value>hi)fail('invalid',`Repeater ${k} must be ${lo} to ${hi}.`);
    if(anim?.keys.length)return put({},{...anim,keys:upsertKey(anim.keys,makeKey(t,e.value as number))});
    return put({[k]:e.value as number},undefined);}
   if(e.op==='animate'){
    if(e.on)return anim?.keys.length?doc:put({},{...prop('scalar',staticV),keys:[makeKey(t,staticV)]});
    if(!anim?.keys.length)return doc;return put({[k]:round(evaluate(anim,t) as number)},undefined);}
   if(!anim||!anim.keys.some(x=>x.t===t))fail('missing','No repeater key at that time.');
   const keys=anim!.keys.filter(x=>x.t!==t);
   if(keys.length)return put({},{...anim!,keys});
   return put({[k]:round(evaluate(anim!,t) as number)},undefined);}
  case 'textpath.start':{
   const l=layerOf(doc,e.layer);if(l.kind!=='text'||!l.source.textPath)fail('invalid','The text is not on a path.');
   const t=tickOf(compOf(doc),e.t),anim=l.source.textPathStartAnim,round=(n:number)=>Math.round(n*100)/100;
   const put=(start:number|undefined,a:Property|undefined)=>{const {textPathStartAnim:_a,textPathStart:_s,...rest}=l.source;return setLayer(doc,{...l,source:{...rest,...(start!==undefined?{textPathStart:start}:{}),...(a?{textPathStartAnim:a}:{})}});};
   if(e.op==='set'){
    if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<-100||e.value>200)fail('invalid','Text path start must be -100 to 200 percent.');
    if(anim?.keys.length)return put(undefined,{...anim,keys:upsertKey(anim.keys,makeKey(t,round(e.value as number)))});
    if((e.value as number)<0)fail('invalid','Key the start to go below 0 percent.');
    return put(round(e.value as number),undefined);}
   const cur=l.source.textPathStart??0;
   if(e.op==='animate'){
    if(e.on)return anim?.keys.length?doc:put(undefined,{...prop('scalar',cur),keys:[makeKey(t,cur)]});
    if(!anim?.keys.length)return doc;const v=round(evaluate(anim,t) as number);return put(v>=0&&v<=100?v:Math.min(100,Math.max(0,v)),undefined);}
   if(!anim||!anim.keys.some(x=>x.t===t))fail('missing','No text path key at that time.');
   const keys=anim!.keys.filter(x=>x.t!==t);
   if(keys.length)return put(undefined,{...anim!,keys});
   const v=round(evaluate(anim!,t) as number);return put(Math.min(100,Math.max(0,v)),undefined);}
  case 'pathfx.size':{
   const l=layerOf(doc,e.layer),fx=l.pathFx;if(!fx)fail('invalid','The layer has no path effect.');
   const t=tickOf(compOf(doc),e.t),anim=fx!.sizeAnim,round=(n:number)=>Math.round(n*100)/100;
   const put=(size:number|undefined,a:Property|undefined)=>{const {sizeAnim:_s,...rest}=fx!;return setLayer(doc,{...l,pathFx:{...rest,...(size!==undefined?{size}:{}),...(a?{sizeAnim:a}:{})}});};
   if(e.op==='set'){
    if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<-200||e.value>200)fail('invalid','Path effect size must be -200 to 200.');
    if(anim?.keys.length)return put(undefined,{...anim,keys:upsertKey(anim.keys,makeKey(t,e.value as number))});
    return put(e.value as number,undefined);}
   if(e.op==='animate'){
    if(e.on)return anim?.keys.length?doc:put(undefined,{...prop('scalar',fx!.size),keys:[makeKey(t,fx!.size)]});
    if(!anim?.keys.length)return doc;return put(round(evaluate(anim,t) as number),undefined);}
   if(!anim||!anim.keys.some(x=>x.t===t))fail('missing','No path effect key at that time.');
   const keys=anim!.keys.filter(x=>x.t!==t);
   if(keys.length)return put(undefined,{...anim!,keys});
   return put(round(evaluate(anim!,t) as number),undefined);}
  case 'layer.pathFx':{const l=layerOf(doc,e.layer);if(e.pathFx===null){const {pathFx:_p,...rest}=l;return setLayer(doc,rest);}if(l.kind!=='shape'||l.source.shape!=='path')fail('invalid','Path effects need a path shape layer.');if(!validPathFx(e.pathFx))fail('invalid','Path effect: size -200 to 200, 1 to 20 ridges.');return setLayer(doc,{...l,pathFx:e.pathFx});}
  case 'layer.repeater':{const l=layerOf(doc,e.layer);if(e.repeater===null){const {repeater:_r,...rest}=l;return setLayer(doc,rest);}if(!validRepeater(e.repeater))fail('invalid','Repeater: 2 to 20 copies, offset up to 4096 px, rotation up to 3600 degrees, scale 1 to 400 percent, opacity 0 to 100 percent.');return setLayer(doc,{...l,repeater:e.repeater});}
  case 'layer.stroke':{const l=layerOf(doc,e.layer);if(e.stroke===null){const {stroke:_s,...rest}=l;return setLayer(doc,rest);}return setLayer(doc,{...l,stroke:e.stroke});}
  case 'effect.colorKey':case 'effect.bypassKey':{const l=layerOf(doc,e.layer),t=tickOf(compOf(doc),e.t),effect=l.effects?.find(x=>x.id===e.effect)??fail('missing','Effect no longer exists.');
   if(e.type==='effect.colorKey'&&(effect.kind==='blur'||!/^#[0-9a-fA-F]{6}$/.test(e.color)))fail('invalid','Blur has no colour.');
   const next=e.type==='effect.colorKey'?{...effect,colorKeys:[...(effect.colorKeys??[]).filter(k=>k.t!==t),{t,color:e.color}].sort((a,b)=>a.t-b.t)}:{...effect,bypassKeys:[...(effect.bypassKeys??[]).filter(k=>k.t!==t),{t,bypass:e.bypass}].sort((a,b)=>a.t-b.t)};
   return setLayer(doc,{...l,effects:l.effects!.map(x=>x.id===effect.id?next:x)});}
  case 'guides.set':{const c=compOf(doc);if(e.guides.length&&!validGuides(e.guides,c.width,c.height))fail('invalid',`Guides must be unique, inside the composition and at most ${MAX_GUIDES}.`);return withComp(doc,{...c,guides:e.guides.length?e.guides:undefined});}
  case 'markers.set':{const c=compOf(doc);return withComp(doc,{...c,markers:[...e.markers].sort((a,b)=>a.t-b.t)});}
  case 'text.animators':{const l=layerOf(doc,e.layer);if(l.kind!=='text')fail('invalid','Text animators require a text layer.');return setLayer(doc,{...l,animators:e.animators.length?e.animators:undefined});}
  case 'layer.masks':{const l=layerOf(doc,e.layer);if(l.kind==='null'||l.kind==='audio')fail('invalid','Masks need a drawable layer.');return setLayer(doc,{...l,masks:e.masks.length?e.masks:undefined});}
  case 'layer.matte':{const l=layerOf(doc,e.layer);return setLayer(doc,{...l,matte:e.matte??undefined});}
  case 'layer.reveal':{const l=layerOf(doc,e.layer);if(l.kind!=='text')fail('invalid','Typewriter requires a text layer.');return setLayer(doc,{...l,textReveal:e.property});}
  case 'effect.style':{const l=layerOf(doc,e.layer),effect=l.effects?.find(x=>x.id===e.effect)??fail('missing','Effect no longer exists.');
   if(!(STYLE_KINDS as readonly string[]).includes(effect.kind))return fail('invalid','Only shadow and glow styles have these settings.');
   if(e.distance!==undefined&&!(OFFSET_KINDS as readonly string[]).includes(effect.kind))return fail('invalid','Only a shadow has a distance.');if(e.angle!==undefined&&!(OFFSET_KINDS as readonly string[]).includes(effect.kind))return fail('invalid','Only a shadow has an angle.');
   if(e.blur===undefined&&e.distance===undefined&&e.angle===undefined)return fail('invalid','Nothing to change.');
   const next={...effect,...(e.blur!==undefined?{blur:e.blur}:{}),...(e.distance!==undefined?{distance:e.distance}:{}),...(e.angle!==undefined?{angle:e.angle}:{})};
   if(!validEffects([next]))return fail('invalid','Blur must be 0 to 64, distance 0 to 500, angle -360 to 360.');
   return setLayer(doc,{...l,effects:l.effects!.map(x=>x.id===effect.id?next:x)});}
  case 'effect.amount':case 'effect.animate':case 'effect.key.remove':{const l=layerOf(doc,e.layer),c=compOf(doc),t=tickOf(c,e.t),effect=l.effects?.find(x=>x.id===e.effect)??fail('missing','Effect no longer exists.');let next=effect;
   const max=effect.kind==='blur'?64:1;
   if(e.type==='effect.amount'){if(!Number.isFinite(e.value)||e.value<0||e.value>max)fail('invalid','Effect strength is outside its supported range.');next=effect.animation?.keys.length?{...effect,animation:{...effect.animation,keys:upsertKey(effect.animation.keys,makeKey(t,e.value))}}:{...effect,amount:e.value};}
   else if(e.type==='effect.animate'){const sampled=effect.animation?evaluate(effect.animation,t) as number:effect.amount;next=e.on?{...effect,animation:effect.animation?.keys.length?effect.animation:{type:'scalar',value:sampled,keys:[makeKey(t,sampled)]}}:{...effect,amount:sampled,animation:undefined};}
   else {const p=effect.animation??fail('missing','Effect is not animated.');const keys=p.keys.filter(k=>k.t!==t);next=keys.length?{...effect,animation:{...p,keys}}:{...effect,amount:evaluate(p,t) as number,animation:undefined};}
   return setLayer(doc,{...l,effects:l.effects!.map(x=>x.id===effect.id?next:x)});}
  case 'easings.set':{const easings={version:1 as const,items:e.items};const p=validateEasingLib(easings);if(p.length)fail('invalid',p[0]);return {...doc,easings};}
  case 'poses.set':{const poses={version:1 as const,items:e.items};const p=validatePoseLib(poses);if(p.length)fail('invalid',p[0]);return {...doc,poses};}
  case 'motions.set':{const motions={version:1 as const,items:e.items};const p=validateMotionLib(motions);if(p.length)fail('invalid',p[0]);return {...doc,motions};}
  case 'layerTemplates.set':{const layerTemplates={version:1 as const,items:e.items};const p=validateLayerTemplates({...doc,layerTemplates});if(p.length)fail('invalid',p[0]);return {...doc,layerTemplates:e.items.length?layerTemplates:undefined};}
  case 'layerTemplate.insert':{
   const c=compOf(doc),t=doc.layerTemplates?.items.find(x=>x.id===e.template);if(!t)fail('missing','That template no longer exists.');
   const ids=[e.layer,...(e.layers??[])];if(ids.some(x=>c.layers.some(y=>y.id===x))||new Set(ids).size!==ids.length)fail('invalid','Duplicate layer id.');
   if(ids.length!==templateLayersOf(t!).length)fail('invalid','One new id per template layer is needed.');
   if(!Number.isInteger(e.at)||e.at<0)fail('invalid','Insert time must be a whole tick.');
   let l:Layer[];try{l=templateLayers(t!,ids,e.at,c.start+c.duration);}catch(x){return fail('invalid',(x as Error).message);}
   return withLayers(doc,ls=>[...l,...ls]);}
  case 'textPresets.set':{const textPresets={version:1 as const,items:e.items};const p=validateTextPresetLib(textPresets);if(p.length)fail('invalid',p[0]);return {...doc,textPresets};}
  case 'asset.import':{const next={...doc,assets:doc.assets.some(a=>a.id===e.asset.id)?doc.assets:[...doc.assets,e.asset]};validateAnimationAssets(next);const c=compOf(doc);const l=createLayer('raster',c,{name:e.asset.sourceName,source:{assetId:e.asset.id,width:e.asset.width,height:e.asset.height}});return withLayers(next,ls=>[l,...ls]);}
  case 'audio.import':{
   const existing=doc.audioAssets??[];const next={...doc,audioAssets:existing.some(a=>a.id===e.asset.id)?existing:[...existing,e.asset]};validateAnimationAssets(next);
   const c=compOf(doc);const at=e.t===undefined?0:tickOf(c,e.t);
   const l=createLayer('audio',c,{name:e.asset.sourceName,inT:0,outT:e.asset.durationTicks,offset:at,audio:{assetId:e.asset.id,trimIn:0,volume:prop('scalar',100) as Property}},e.id);
   if(c.layers.some(x=>x.id===l.id))fail('invalid','Duplicate layer id.');
   return withLayers(next,ls=>[l,...ls]);}
  case 'audio.reactive':{
   const l=layerOf(doc,e.layer);if(l.locked)fail('invalid','Layer is locked.');if(l.kind==='audio')fail('invalid','Pick a layer that can be animated, not an audio layer.');
   const rg=REACTIVE_RANGE[e.prop];if(!rg)fail('invalid','Unknown property.');
   if(!Array.isArray(e.keys)||e.keys.length<2||e.keys.length>MAX_REACTIVE_KEYS)fail('invalid',`Audio keys need 2 to ${MAX_REACTIVE_KEYS} points.`);
   if(!e.keys.every((k,i)=>Number.isInteger(k.t)&&k.t>=0&&(i===0||k.t>e.keys[i-1].t)&&Number.isFinite(k.v)&&k.v>=rg.min&&k.v<=rg.max))fail('invalid','Audio keys must rise in time and stay in range.');
   const p=l.transform[e.prop],keys=e.keys.map(k=>makeKey(k.t,e.prop==='scale'?[k.v,k.v]:k.v,'linear'));
   return setLayer(doc,{...l,transform:{...l.transform,[e.prop]:{...p,keys}}});}
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
  case 'color.ease':{
   const l=layerOf(doc,e.layer),t=tickOf(compOf(doc),e.t),keys=l.colorKeys?.[e.prop];
   if(e.ease!==null&&!(COLOR_EASES as readonly string[]).includes(e.ease))fail('invalid','Unknown ease.');
   if(!keys||!keys.some(k=>k.t===t))fail('missing','No colour key at that time.');
   const next=keys!.map(k=>{if(k.t!==t)return k;const {ease:_o,...rest}=k;return e.ease===null||e.ease==='linear'?rest:{...rest,ease:e.ease as ColorEase};});
   return setLayer(doc,{...l,colorKeys:{...l.colorKeys,[e.prop]:next}});}
  case 'style.key.move':{
   const to=tickOf(compOf(doc),e.to);
   const move:LaneShift=keys=>{
    if(!keys?.some(k=>k.t===e.from))fail('missing','No key at that time.');
    if(to!==e.from&&keys!.some(k=>k.t===to))fail('invalid','There is already a key at that time.');
    return keys!.map(k=>k.t===e.from?{...k,t:to}:k).sort((a,b)=>a.t-b.t);};
   return applyLane(doc,e.layer,e.lane,move);}
  case 'style.keys.paste':{
   const c=compOf(doc);if(!e.items.length||e.items.length>MAX_STYLE_PASTE)fail('invalid','Nothing to paste.');
   const base=tickOf(c,e.t),times=e.items.map(i=>snapToFrame(base+i.dt,c.fps));
   if(times.some(t=>t<c.start||t>c.start+c.duration))fail('invalid','Pasted keys would end outside the composition.');
   const put:LaneShift=keys=>{
    if(!keys?.length)fail('missing','The target layer has no keys in that lane.');
    const incoming=e.items.map((i,n)=>({...(i.key as object),t:times[n]})) as unknown as typeof keys;
    return [...keys!.filter(k=>!times.includes(k.t)),...incoming!].sort((a,b)=>a.t-b.t);};
   return applyLane(doc,e.layer,e.lane,put);}
  case 'color.prop':{
   const l=layerOf(doc,e.layer),fillOk=['solid','shape','text'].includes(l.kind);
   if(e.prop==='fill'?!fillOk:(l.kind!=='shape'||!l.stroke))fail('invalid',e.prop==='fill'?'This layer has no fill colour.':'The layer has no stroke.');
   const t=tickOf(compOf(doc),e.t),f=e.prop==='fill',keys=l.colorKeys?.[e.prop],cur=f?(l.source.color??'#000000'):l.stroke!.color;
   const withStatic=(x:Layer,c:string):Layer=>f?{...x,source:{...x.source,color:c}}:{...x,stroke:{...x.stroke!,color:c}};
   const withKeys=(x:Layer,ks:readonly ColorKey[]|undefined):Layer=>{const {colorKeys:_c,...rest}=x;const next={...(x.colorKeys??{}),[e.prop]:ks};if(!ks?.length)delete (next as Record<string,unknown>)[e.prop];return Object.keys(next).length?{...rest,colorKeys:next}:rest as Layer;};
   if(e.op==='set'){
    if(typeof e.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(e.color))fail('invalid','Colour must be #rrggbb.');
    const c=(e.color as string).toLowerCase();
    if(keys?.length){const old=keys.find(k=>k.t===t),next=[...keys.filter(k=>k.t!==t),{t,color:c,...(old?.ease?{ease:old.ease}:{})}].sort((a,b)=>a.t-b.t);if(next.length>MAX_COLOR_KEYS)fail('invalid',`At most ${MAX_COLOR_KEYS} colour keys.`);return setLayer(doc,withKeys(l,next));}
    return setLayer(doc,withStatic(l,c));}
   if(e.op==='animate'){
    if(e.on)return keys?.length?doc:setLayer(doc,withKeys(l,[{t,color:cur}]));
    return keys?.length?setLayer(doc,withStatic(withKeys(l,undefined),colorAt(keys,cur,t))):doc;}
   if(!keys||!keys.some(k=>k.t===t))fail('missing','No colour key at that time.');
   const rest=keys!.filter(k=>k.t!==t);
   return setLayer(doc,rest.length?withKeys(l,rest):withStatic(withKeys(l,undefined),colorAt(keys,cur,t)));}
  case 'stroke.prop':{
   const l=layerOf(doc,e.layer);if(l.kind!=='shape'||!l.stroke)fail('invalid','The layer has no stroke.');const st=l.stroke as NonNullable<Layer['stroke']>;
   const t=tickOf(compOf(doc),e.t),w=e.prop==='width',max=w?256:100,anim=(w?st.widthAnim:st.opacityAnim),staticV:number=w?st.width:st.opacity??100;
   const put=(x:NonNullable<Layer['stroke']>)=>setLayer(doc,{...l,stroke:x});
   const drop=(x:NonNullable<Layer['stroke']>)=>{const {widthAnim:a,opacityAnim:b,...rest}=x;return {...rest,...(w?(b?{opacityAnim:b}:{}):(a?{widthAnim:a}:{}))} as NonNullable<Layer['stroke']>;};
   const round=(n:number)=>Math.round(n*100)/100;
   if(e.op==='set'){
    if(typeof e.value!=='number'||!Number.isFinite(e.value)||e.value<0||e.value>max)fail('invalid',`Stroke ${e.prop} must be 0 to ${max}.`);
    if(anim?.keys.length)return put({...st,[w?'widthAnim':'opacityAnim']:{...anim,keys:upsertKey(anim.keys,makeKey(t,e.value as number))}});
    return put(w?{...st,width:e.value as number}:{...st,opacity:e.value as number});}
   if(e.op==='animate'){
    if(e.on)return anim?.keys.length?doc:put({...st,[w?'widthAnim':'opacityAnim']:{...prop('scalar',staticV),keys:[makeKey(t,staticV)]}});
    if(!anim?.keys.length)return doc;const v=round(evaluate(anim,t) as number);return put(w?{...drop(st),width:v}:{...drop(st),opacity:v});}
   if(!anim||!anim.keys.some(k=>k.t===t))fail('missing','No stroke key at that time.');
   const keys=anim!.keys.filter(k=>k.t!==t);
   if(keys.length)return put({...st,[w?'widthAnim':'opacityAnim']:{...anim!,keys}});
   const v=round(evaluate(anim!,t) as number);return put(w?{...drop(st),width:v}:{...drop(st),opacity:v});}
  case 'layer.gain.set':case 'layer.gain.animate':case 'layer.gain.key.remove':{
   const l=layerOf(doc,e.layer);if(l.kind!=='comp')fail('invalid','Select a comp layer.');const t=tickOf(compOf(doc),e.t),g=l.gain,staticV=l.source.volume??100;
   const strip=(x:Layer):Layer=>{const {gain:_g,...rest}=x;return rest as Layer;};
   if(e.type==='layer.gain.set'){
    if(!Number.isFinite(e.value)||e.value<0||e.value>MAX_AUDIO_VOLUME)fail('invalid','Volume must be 0 to 200 percent.');
    if(g?.keys.length)return setLayer(doc,{...l,gain:{...g,keys:upsertKey(g.keys,makeKey(t,e.value))}});
    return setLayer(doc,{...l,source:{...l.source,volume:e.value}});}
   if(e.type==='layer.gain.animate'){
    if(e.on)return g?.keys.length?doc:setLayer(doc,{...l,gain:{...prop('scalar',staticV),keys:[makeKey(t,staticV)]}});
    return g?.keys.length?setLayer(doc,{...strip(l),source:{...l.source,volume:Math.round(evaluate(g,t) as number)}}):doc;}
   if(!g||!g.keys.some(k=>k.t===t))fail('missing','No volume key at that time.');
   const keys=g!.keys.filter(k=>k.t!==t);
   return keys.length?setLayer(doc,{...l,gain:{...g!,keys}}):setLayer(doc,{...strip(l),source:{...l.source,volume:Math.round(evaluate(g!,t) as number)}});}
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
  case 'layer.stretch':{const c=compOf(doc);const l=layerOf(doc,e.layer);
   if(l.kind==='audio')fail('invalid','Use audio trim and offset for audio layers.');
   if(!Number.isInteger(e.percent)||e.percent<10||e.percent>1000||e.percent===100)fail('invalid','Stretch is a whole percent from 10 to 1000, other than 100.');
   const m=stretchLayer(l,e.percent,t=>snapToFrame(t,c.fps)),lo=c.start,hi=c.start+c.duration;
   if(m.outT>c.duration||m.outT<=m.inT)fail('invalid','The stretched layer would leave the composition or vanish.');
   if(layerKeyTimes(m).some(t=>t<lo||t>hi))fail('invalid','Keys would leave the composition.');
   if(hasKeyCollision(m))fail('collision','Two keys would land on the same frame. Stretch less.');
   return setLayer(doc,m);}
  case 'layer.shift':{const c=compOf(doc);const l=layerOf(doc,e.layer);
   if(l.kind==='audio')fail('invalid','Use audio trim and offset for audio layers.');
   if(!Number.isInteger(e.delta)||e.delta===0||Math.abs(e.delta)>c.duration)fail('invalid','Shift must be a non-zero whole number of ticks inside the composition length.');
   if(e.mode!=='slide'&&e.mode!=='slip')fail('invalid','Unknown shift mode.');
   const lo=c.start,hi=c.start+c.duration;
   if(layerKeyTimes(l).some(t=>t+e.delta<lo||t+e.delta>hi))fail('invalid','Keys would leave the composition.');
   const moved=shiftLayerKeys(l,e.delta);
   if(e.mode==='slip')return setLayer(doc,moved);
   const inT=l.inT+e.delta,outT=l.outT+e.delta;if(inT<0||outT>c.duration)fail('invalid','The layer would leave the composition.');
   return setLayer(doc,{...moved,inT,outT});}
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
  case 'layers.duplicate':{const c=compOf(doc);for(const id of e.layers)layerOf(doc,id);
   if(e.ids.some(x=>typeof x!=='string'||!x||c.layers.some(y=>y.id===x)))fail('invalid','Duplicate layer id.');
   try{return withLayers(doc,ls=>duplicateLayers(ls,e.layers,e.ids));}catch(x){return fail('invalid',(x as Error).message);}}
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
  case 'precomp.make':{const c=compOf(doc);const ids=[...new Set(e.layers??[])];
   if(!ids.length||ids.length>200)return fail('invalid','Select 1 to 200 layers.');
   const sel=ids.map(id=>layerOf(doc,id));if(sel.some(l=>l.kind==='audio'))return fail('invalid','Audio layers cannot be precomposed.');
   if(e.name!==undefined&&(typeof e.name!=='string'||!e.name.trim()||e.name.length>200))return fail('invalid','Name must be 1 to 200 characters.');
   const set=new Set(ids);
   for(const l of c.layers){const inside=set.has(l.id);
    if(inside&&((l.parent&&!set.has(l.parent))||(l.matte&&!set.has(l.matte.source))))return fail('invalid',`"${l.name}" is linked to a layer outside the selection. Select that layer too.`);
    if(!inside&&((l.parent&&set.has(l.parent))||(l.matte&&set.has(l.matte.source))))return fail('invalid',`"${l.name}" is linked to a selected layer. Select it too.`);}
   const base=createComposition({name:e.name?.trim()||`Precomp ${doc.compositions.length}`,width:c.width,height:c.height,fps:c.fps,duration:c.duration},e.compId);
   if(doc.compositions.some(x=>x.id===base.id))return fail('invalid','Duplicate composition id.');
   const inner=c.layers.filter(l=>set.has(l.id));const top=c.layers.findIndex(l=>set.has(l.id));
   const child={...base,start:c.start,background:c.background,workArea:{...c.workArea},layers:inner};
   const pl=createLayer('comp',c,{name:child.name,source:{compId:child.id,width:c.width,height:c.height},transform:precompTransform(c.width,c.height,c.width,c.height),inT:c.start,outT:c.start+c.duration},e.id);
   if(c.layers.some(x=>!set.has(x.id)&&x.id===pl.id))return fail('invalid','Duplicate layer id.');
   const rest=c.layers.filter(l=>!set.has(l.id));const at=c.layers.slice(0,top).filter(l=>!set.has(l.id)).length;
   const next:AnimationDocument={...doc,compositions:[...doc.compositions.map(x=>x.id===c.id?{...c,layers:[...rest.slice(0,at),pl,...rest.slice(at)]}:x),child]};
   const probs=validatePrecomps(next);if(probs.length)return fail('invalid',probs[0].replace(/^[^:]*: /,'').replace(/^./,m=>m.toUpperCase())+'.');return next;}
  case 'layer.motionBlur':{const ids=[...new Set(e.layers??[])];if(!ids.length||ids.length>200)return fail('invalid','Select 1 to 200 layers.');if(typeof e.enabled!=='boolean')return fail('invalid','Motion blur must be on or off.');
   const ls=ids.map(id=>layerOf(doc,id));if(ls.some(l=>l.kind==='audio'))return fail('invalid','Audio layers have no motion blur.');
   const set=new Set(ids);return withLayers(doc,all=>all.map(l=>set.has(l.id)?(e.enabled?{...l,motionBlur:true}:Object.fromEntries(Object.entries(l).filter(([k])=>k!=='motionBlur')) as unknown as Layer):l));}
  case 'comp.shutter':{const c=findComp(doc,e.comp??doc.activeComp)??fail('missing','Composition does not exist.');
   if(e.shutter!==null&&!(validShutter(e.shutter)&&e.shutter!==undefined))return fail('invalid','Shutter angle must be 1 to 720 degrees and samples 2 to 16.');
   const {shutter:_old,...rest}=c;return withComp(doc,e.shutter===null?rest as Composition:{...rest,shutter:{angle:e.shutter.angle,samples:e.shutter.samples}} as Composition);}
  case 'precomp.add':{const c=compOf(doc);const child=doc.compositions.find(x=>x.id===e.comp);if(!child)return fail('missing','That composition no longer exists.');
   if(child.id===c.id)return fail('invalid','A composition cannot contain itself.');
   const l=createLayer('comp',c,{name:child.name,source:{compId:child.id,width:child.width,height:child.height},transform:precompTransform(child.width,child.height,c.width,c.height),outT:Math.max(1,Math.min(c.duration,child.duration))},e.id);
   if(c.layers.some(x=>x.id===l.id))return fail('invalid','Duplicate layer id.');
   const next=withLayers(doc,ls=>[l,...ls]);const probs=validatePrecomps(next);if(probs.length)return fail('invalid',probs[0].replace(/^[^:]*: /,'').replace(/^./,m=>m.toUpperCase())+'.');return next;}
  case 'keys.retime':{const c=compOf(doc);if(!e.moves?.length||e.moves.length>2000)return fail('invalid','Nothing to move.');
   const groups=new Map<string,{layer:string;prop:TransformKey;m:Map<number,number>}>();
   for(const mv of e.moves){if(!TRANSFORM_KEYS.includes(mv.prop))return fail('invalid','Unknown property.');layerOf(doc,mv.layer);
    const from=tickOf(c,mv.from),to=tickOf(c,mv.to);if(to<c.start||to>c.start+c.duration)return fail('invalid','Keys cannot move outside the composition.');
    const id=`${mv.layer}\0${mv.prop}`;const g=groups.get(id)??{layer:mv.layer,prop:mv.prop,m:new Map<number,number>()};g.m.set(from,to);groups.set(id,g);}
   let next=doc;
   for(const g of groups.values())next=setProp(next,g.layer,g.prop,p=>{
    for(const f of g.m.keys())if(!p.keys.some(k=>k.t===f))return fail('missing','A selected key no longer exists.');
    const moved=p.keys.filter(k=>g.m.has(k.t)).map(k=>({...k,t:g.m.get(k.t)!}));const rest=p.keys.filter(k=>!g.m.has(k.t));
    const ts=new Set(moved.map(k=>k.t));if(ts.size!==moved.length||rest.some(k=>ts.has(k.t)))return fail('collision','Moved keys would overlap.');
    return {...p,keys:[...rest,...moved].sort((a,b)=>a.t-b.t)};});
   return next;}
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

/** Edits that delete the given style-lane keys; a lane that loses its last key becomes static at the sampled value (same as the single-key remove). */
export function styleKeyDeleteEdits(layer:string,picks:readonly {lane:StyleLaneId;t:number}[]):Edit[]{
 return picks.map((p):Edit=>p.lane==='gain'?{type:'layer.gain.key.remove',layer,t:p.t}
  :p.lane==='strokeWidth'||p.lane==='strokeOpacity'?{type:'stroke.prop',layer,prop:p.lane==='strokeWidth'?'width':'opacity',op:'remove',t:p.t}
  :p.lane==='textPathStart'?{type:'textpath.start',layer,op:'remove',t:p.t}
  :p.lane==='pathFxSize'?{type:'pathfx.size',layer,op:'remove',t:p.t}
  :parseGradientStopLane(p.lane)?{type:'gradient.stop',layer,target:parseGradientStopLane(p.lane)!.target,index:parseGradientStopLane(p.lane)!.index,prop:parseGradientStopLane(p.lane)!.prop,op:'remove',t:p.t}
  :parseGradientColorLane(p.lane)?{type:'gradient.color',layer,target:parseGradientColorLane(p.lane)!.target,which:parseGradientColorLane(p.lane)!.key,op:'remove',t:p.t}
  :parseGradientLane(p.lane)?{type:'gradient.prop',layer,target:parseGradientLane(p.lane)!.target,prop:parseGradientLane(p.lane)!.key,op:'remove',t:p.t}
  :p.lane==='gradFillAngle'||p.lane==='gradStrokeAngle'?{type:'gradient.angle',layer,target:p.lane==='gradFillAngle'?'fill':'stroke',op:'remove',t:p.t}
  :p.lane.startsWith('rep')?{type:'repeater.prop',layer,prop:(p.lane[3].toLowerCase()+p.lane.slice(4)) as RepeaterKey,op:'remove',t:p.t}
  :{type:'color.prop',layer,prop:p.lane as 'fill'|'stroke',op:'remove',t:p.t});
}
/** Edits that shift the given style-lane keys by `delta` ticks. Ordered so keys of one lane never pass through each other; a collision with an unselected key makes the whole step fail. */
export function styleKeyShiftEdits(layer:string,picks:readonly {lane:StyleLaneId;t:number}[],delta:number):Edit[]{
 const order=[...picks].sort((a,b)=>delta>0?b.t-a.t:a.t-b.t);
 return order.map((p):Edit=>({type:'style.key.move',layer,lane:p.lane,from:p.t,to:p.t+delta}));
}
