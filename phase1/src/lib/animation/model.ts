import type {InterfaceAsset} from '../interface/schema';
import {validateAnimationAssets} from './assetsValidation';
import type {AudioAsset} from './audioCore';
import {frameToTick,validRate,type Rational,TICKS_PER_SECOND} from './time';
import {TRANSFORM_KEYS} from './keyTypes';
import type {Vec2,PropValue,Interp,TransformKey} from './keyTypes';
export {TRANSFORM_KEYS} from './keyTypes';
export type {Vec2,PropValue,Interp,TransformKey} from './keyTypes';
/** Authoritative, serialisable, versioned composition document (concept section 4). View state lives elsewhere. */
export const SCHEMA_VERSION=1;
export const ENGINE_VERSION='p5-shapes';
export type PropType='scalar'|'vec2';
/** Temporal ease handles in CSS cubic-bezier form: `out` belongs to this key, `in` to the next key of the segment. */
/** `sIn`/`sOut` are spatial tangents (offsets from the key value, vec2 properties only). Absent or [0,0] means a straight spatial segment. */
export interface Keyframe{t:number;v:PropValue;interp:Interp;out:readonly [number,number];in:readonly [number,number];sIn?:Vec2;sOut?:Vec2;channelOut?:readonly [Vec2,Vec2];channelIn?:readonly [Vec2,Vec2]}
export interface KeyRef{layer:string;prop:TransformKey;t:number}
export interface Property{type:PropType;value:PropValue;keys:readonly Keyframe[];/** Inert text only; never evaluated in P0. */expression?:string;pathMode?:'parameter'|'arcLength';modifiers?:readonly import('./modifiers').Modifier[]}
export type LayerKind='solid'|'text'|'shape'|'null'|'raster'|'audio'|'comp';
/** A comp layer shows another composition of the document. Nesting deeper than this is refused so one frame stays cheap. */
export const MAX_PRECOMP_DEPTH=3,MAX_PRECOMP_LAYERS=600;
/** Safe system font stacks for text layers. Nothing is bundled or downloaded: every entry is a CSS family stack the host already has. The snapshot stores the id, never the stack. */
export const TEXT_FONTS={
 system:{name:'System UI',stack:'system-ui, sans-serif'},
 sans:{name:'Arial',stack:'Arial, Helvetica, sans-serif'},
 helvetica:{name:'Helvetica',stack:"'Helvetica Neue', Helvetica, Arial, sans-serif"},
 serif:{name:'Georgia',stack:"Georgia, 'Times New Roman', serif"},
 times:{name:'Times New Roman',stack:"'Times New Roman', Times, serif"},
 mono:{name:'Courier New',stack:"'Courier New', ui-monospace, monospace"},
 verdana:{name:'Verdana',stack:'Verdana, Geneva, sans-serif'},
 trebuchet:{name:'Trebuchet MS',stack:"'Trebuchet MS', sans-serif"},
} as const;
export type TextFont=keyof typeof TEXT_FONTS;
/** CSS family stack of a stored font id; unknown or absent ids fall back to the system stack. */
export const textFontStack=(font:TextFont|undefined):string=>TEXT_FONTS[font&&font in TEXT_FONTS?font:'system'].stack;
/** Audio layer parameters. The clip plays file time `trimIn + (t - (inT + offset))` for comp time t inside [inT+offset, outT+offset). `volume` is a percent (0..200) keyed in composition time. */
export interface AudioParams{assetId:string;trimIn:number;volume:Property;/** Only on mapped copies of nested audio: file playback rate. Never stored on a real layer. */rate?:number;/** Only on mapped copies of nested audio: keyed gain (percent) of every comp layer on the way up, already in this composition's time. */gains?:readonly Property[]}
export interface Transform{anchor:Property;position:Property;scale:Property;rotation:Property;opacity:Property}
export interface LayerSource{color?:string;width?:number;height?:number;text?:string;size?:number;font?:TextFont;shape?:'rect'|'ellipse'|'path'|'roundedRect'|'star'|'polygon';radius?:number;sides?:number;innerRatio?:number;gradient?:{start:string;end:string;angle:number;/** Absent means linear. Radial ignores the angle. */kind?:'linear'|'radial';/** Opacity of the start and end colour, percent 0..100 (absent means 100). */startOpacity?:number;endOpacity?:number;/** Radial only: centre (0..1 of the box, default 0.5) and radius (0.05..1.5, default 0.5). */cx?:number;cy?:number;radius?:number;/** Extra colour stops between start (0) and end (1): strictly increasing offsets in 0.01..0.99, at most MAX_GRADIENT_STOPS. */stops?:readonly {offset:number;color:string;opacity?:number}[]};path?:{points:readonly {x:number;y:number;inX?:number;inY?:number;outX?:number;outY?:number}[];closed:boolean};/** Morph keys of a path shape (same point count and closed flag as `path`; points normalized to the layer box). */pathKeys?:readonly MaskShapeKey[];/** Compound paths: further subpaths drawn together with `path` (even-odd fill, so inner ones cut holes). Static only: not combined with `pathKeys`. */subpaths?:readonly {points:readonly {x:number;y:number;inX?:number;inY?:number;outX?:number;outY?:number}[];closed:boolean}[];assetId?:string;/** Composition shown by a comp layer. */compId?:string;/** Comp layers: playback speed in percent (10..1000, default 100). */speed?:number;/** Comp layers: volume of the audio inside, percent 0..200 (default 100), multiplied with the volume of every nested clip. */volume?:number;/** Comp layers: wrap the child time instead of running past its end. */loop?:boolean;/** Comp layers: child time in ticks at the layer's start (0..86400000). */timeOffset?:number;/** Text layers: the baseline follows this path (points in layer pixels, handles in pixels). Absent means the straight baseline. */textPath?:{points:readonly {x:number;y:number;inX?:number;inY?:number;outX?:number;outY?:number}[];closed:boolean};/** Where the text starts on `textPath`, percent of its length 0..100. */textPathStart?:number}
/** Effects with a radius, and the ones that also have an offset. */
export const STYLE_KINDS=['shadow','glow','innerShadow','innerGlow'] as const,OFFSET_KINDS=['shadow','innerShadow'] as const;
export interface LayerEffect{id:string;kind:'blur'|'tint'|'shadow'|'glow'|'innerShadow'|'innerGlow';enabled:boolean;/** Blur: radius 0..64. Tint, shadow, glow: strength 0..1. */amount:number;color:string;/** Shadow and glow: blur radius 0..64 (default 8). */blur?:number;/** Shadow: offset in px 0..500 (default 12). */distance?:number;/** Shadow: direction in degrees, 0 = right, 90 = down (default 45). */angle?:number;animation?:Property;colorKeys?:readonly {t:number;color:string}[];bypassKeys?:readonly {t:number;bypass:boolean}[]}
export const STROKE_JOINS=['miter','round','bevel'] as const;
export const STROKE_CAPS=['butt','round','square'] as const;
export type StrokeJoin=typeof STROKE_JOINS[number];
export type StrokeCap=typeof STROKE_CAPS[number];
/** Ease of a colour key, applied to the segment up to the next key. The names match `EASE_PRESETS`. */
export const COLOR_EASES=['linear','hold','ease','easeIn','easeOut','overshoot','anticipate','spring','smooth','snappy','back','expo'] as const;
export type ColorEase=typeof COLOR_EASES[number];
export interface ColorKey{t:number;color:string;ease?:ColorEase}
export interface LayerColorKeys{fill?:readonly ColorKey[];stroke?:readonly ColorKey[]}
export const MAX_COLOR_KEYS=64;
export interface Layer{id:string;name:string;kind:LayerKind;source:LayerSource;inT:number;outT:number;offset:number;parent:string|null;transform:Transform;visible:boolean;solo:boolean;locked:boolean;/** Hidden from the timeline list when shy layers are hidden. Never affects rendering. */shy?:boolean;/** Motion blur switch. Only draws when the composition has a shutter. */motionBlur?:boolean;effects?:readonly LayerEffect[];audio?:AudioParams;/** Colour keys (linear RGB mix, held outside the first and last key). `fill` replaces `source.color` of solid, shape and text layers; `stroke` replaces `stroke.color`. */colorKeys?:LayerColorKeys;/** Repeater: copies 2..20, offset per copy (px), rotation (deg), scale and opacity (percent) applied per copy step. */repeater?:{copies:number;x:number;y:number;rotation:number;scale:number;opacity:number;hue?:number};/** Comp layers: keyed audio volume (percent 0..200, composition time). With keys it replaces `source.volume`. */gain?:Property;textReveal?:Property;animators?:readonly TextAnimator[];masks?:readonly LayerMask[];matte?:LayerMatte;stroke?:{color:string;width:number;trim?:Property;dash?:Property;/** Absent means miter (SVG default). */join?:StrokeJoin;/** Absent means butt (SVG default). */cap?:StrokeCap;/** Percent 0..100, absent means 100. */opacity?:number;/** Dash and gap length as percent of the path length (1..100); absent means 8 and 4. Setting either gives a static dashed stroke. */dashLen?:number;dashGap?:number;/** Miter limit 1..20 for miter joins; absent means 4 (SVG default). */miter?:number;/** Keyed stroke width (0..256). With keys it replaces `width`. */widthAnim?:Property;/** Where the stroke sits relative to the outline; absent means centred. Needs a closed shape to take effect. */align?:'inside'|'outside';/** Keyed stroke opacity (0..100 percent). With keys it replaces `opacity`. */opacityAnim?:Property;/** Linear gradient for the stroke (same shape as the fill gradient). It replaces `color` when drawing; colour keys of the stroke are ignored while it is set. */gradient?:{start:string;end:string;angle:number;/** Absent means linear. Radial ignores the angle. */kind?:'linear'|'radial';/** Opacity of the start and end colour, percent 0..100 (absent means 100). */startOpacity?:number;endOpacity?:number;/** Radial only: centre (0..1 of the box, default 0.5) and radius (0.05..1.5, default 0.5). */cx?:number;cy?:number;radius?:number;/** Extra colour stops between start (0) and end (1): strictly increasing offsets in 0.01..0.99, at most MAX_GRADIENT_STOPS. */stops?:readonly {offset:number;color:string;opacity?:number}[]}}}
/** Per-character text animator. The selector covers `start`..`end` percent of the characters, shifted by the keyed `offset` percent, with a linear `softness` ramp at both edges. Characters inside get the full `position` shift, `scale` percent and `opacity` percent; the others keep the neutral values. */
export const TEXT_EASES=['linear','smooth','in','out'] as const;
export type TextEase=typeof TEXT_EASES[number];
export interface TextAnimator{id:string;enabled:boolean;start:number;end:number;softness:number;offset:Property;position:Vec2;scale:number;opacity:number;/** Degrees at full weight, -3600..3600. Absent means 0. */rotation?:number;/** What the range selector counts: single characters (default) or whole words. */unit?:'char'|'word';/** Target colour at full weight, mixed from the layer colour. Absent means unchanged. */color?:string;/** Extra spacing in px after each character at full weight, -200..200. Absent means 0. */tracking?:number;/** Shape of the softness ramp. Absent means linear. */ease?:TextEase}
/** Bounded layer mask in layer space. `add` paints the shape in, `subtract` cuts it out; `invert` uses everything outside the shape; `feather` is a blur in px. */
export interface MaskPoint{x:number;y:number;/** Bezier handles as offsets from the point; absent means a corner. */inX?:number;inY?:number;outX?:number;outY?:number}
export interface MaskPath{points:readonly MaskPoint[];closed:boolean}
export type MaskProp='position'|'size'|'feather'|'opacity';
/** Keyframed overrides of the static mask values. A property with keys wins over the static field. */
export interface MaskAnim{position?:Property;size?:Property;feather?:Property;opacity?:Property}
export const MAX_MASK_POINTS=32;
export const SHAPE_EASES=['linear','hold','ease','easeIn','easeOut'] as const;
export interface MaskShapeKey{t:number;path:MaskPath;/** Easing of the segment that starts at this key; absent means linear. */ease?:typeof SHAPE_EASES[number]}
export interface LayerMask{id:string;shape:'rect'|'ellipse'|'path';mode:'add'|'subtract';x:number;y:number;width:number;height:number;feather:number;invert:boolean;/** Percent 0..100, absent means 100. */opacity?:number;/** Path masks: points are in mask space and moved by x/y; width and height are ignored. */path?:MaskPath;/** Path morph: whole-path keys (same point count and closed flag as `path`), linear between keys. */shapeKeys?:readonly MaskShapeKey[];anim?:MaskAnim}
/** Track matte: another layer of the composition drives this layer's visibility by its alpha or luminance. The source layer is not drawn on its own. */
export interface LayerMatte{source:string;mode:'alpha'|'luma';invert:boolean}
export const MAX_LAYER_MASKS=4;
export const MAX_TEXT_ANIMATORS=4;
/** Animated text stays small enough to render one span per character. */
export const MAX_ANIMATED_CHARS=1000;
export interface Marker{id:string;t:number;label:string}
/** Composition motion blur: shutter angle in degrees (1..720) and sample count (2..16). Absent means off. */
export interface Shutter{angle:number;samples:number}
export const SHUTTER_MAX_SAMPLES=16,SHUTTER_MAX_ANGLE=720;
export const validShutter=(s:Shutter|undefined)=>s===undefined||(!!s&&typeof s==='object'&&isNum(s.angle)&&s.angle>=1&&s.angle<=SHUTTER_MAX_ANGLE&&Number.isInteger(s.samples)&&s.samples>=2&&s.samples<=SHUTTER_MAX_SAMPLES);
export interface Composition{shutter?:Shutter;id:string;name:string;width:number;height:number;fps:Rational;duration:number;start:number;background:string;workArea:{in:number;out:number};layers:readonly Layer[];markers?:readonly Marker[]}
export interface AnimationDocument{schema:number;engine:string;id:string;name:string;revision:number;activeComp:string;compositions:readonly Composition[];assets:readonly InterfaceAsset[];audioAssets?:readonly AudioAsset[];motions?:MotionLib;textPresets?:import('./textPresetModel').TextPresetLib;easings?:import('./easingModel').EasingLib}
/** One copied key, with its time relative to the earliest copied key. */
export interface ClipItem{prop:TransformKey;dt:number;key:Keyframe}
export interface PropertyRef{layer:string;prop:TransformKey}
export const PROP_META:Record<TransformKey,{type:PropType;min?:number;max?:number}>={
 anchor:{type:'vec2'},position:{type:'vec2'},scale:{type:'vec2',min:0,max:10000},rotation:{type:'scalar',min:-36000,max:36000},opacity:{type:'scalar',min:0,max:100}};
export const EASE_OUT:readonly [number,number]=[0.33,0];
export const EASE_IN:readonly [number,number]=[0.67,1];
export const prop=(type:PropType,value:PropValue):Property=>({type,value,keys:[]});
export function makeTransform(width:number,height:number):Transform{
 return {anchor:prop('vec2',[0,0]),position:prop('vec2',[width/2,height/2]),scale:prop('vec2',[100,100]),rotation:prop('scalar',0),opacity:prop('scalar',100)};
}
let counter=0;
export function newId(prefix:string):string{
 counter=(counter+1)%1e6;
 const rnd=typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID().slice(0,8):Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,'0');
 return `${prefix}_${rnd}${counter.toString(36)}`;
}
export interface CompSettings{name?:string;width?:number;height?:number;fps?:Rational;duration?:number;background?:string}
export function createComposition(s:CompSettings={},id=newId('comp')):Composition{
 const fps=s.fps??{num:30,den:1};const duration=s.duration??5*TICKS_PER_SECOND;
 return {id,name:s.name??'Composition 1',width:s.width??1920,height:s.height??1080,fps,duration,start:0,background:s.background??'#1b1b1f',workArea:{in:0,out:duration},layers:[]};
}
export function createDocument(name='Untitled animation',comp:Composition=createComposition(),id=newId('anim')):AnimationDocument{
 return {schema:SCHEMA_VERSION,engine:ENGINE_VERSION,id,name,revision:0,activeComp:comp.id,compositions:[comp],assets:[]};
}
export function createLayer(kind:LayerKind,comp:Composition,over:Partial<Layer>={},id=newId('layer')):Layer{
 const base:Record<LayerKind,{name:string;source:LayerSource}>={
  solid:{name:'Solid',source:{color:'#7c5cff',width:comp.width,height:comp.height}},
  text:{name:'Text',source:{text:'Lower third',size:96,color:'#ffffff'}},
  shape:{name:'Shape',source:{shape:'rect',width:400,height:240,color:'#ff7a59'}},
  raster:{name:'Image',source:{}},
  audio:{name:'Audio',source:{}},
  comp:{name:'Precomp',source:{}},
  null:{name:'Null',source:{width:100,height:100}}};
 const n=comp.layers.filter(l=>l.kind===kind).length+1;
 return {id,name:`${base[kind].name} ${n}`,kind,source:{...base[kind].source},inT:0,outT:comp.duration,offset:0,parent:null,transform:makeTransform(comp.width,comp.height),visible:true,solo:false,locked:false,...over};
}
export const findComp=(doc:AnimationDocument,id=doc.activeComp)=>doc.compositions.find(c=>c.id===id);
export const findLayer=(comp:Composition|undefined,id:string)=>comp?.layers.find(l=>l.id===id);
/** True when making `parent` the parent of `child` would create a cycle. */
export function wouldCycle(comp:Composition,child:string,parent:string|null):boolean{
 const seen=new Set<string>();let cur:string|null=parent;
 while(cur){if(cur===child||seen.has(cur))return true;seen.add(cur);cur=findLayer(comp,cur)?.parent??null;}
 return false;
}
const isNum=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const isVec=(v:unknown):v is Vec2=>Array.isArray(v)&&v.length===2&&v.every(isNum);
const okValue=(type:PropType,v:unknown)=>type==='scalar'?isNum(v):isVec(v);
/** Strict structural validation used for recovery and import. Returns a list of problems; empty means valid. */
import {validateModifiers,linkProblems} from './modifierModel';
import {validateMotionLib,type MotionLib} from './motionModel';
import {validateTextPresetLib} from './textPresetModel';
import {validateEasingLib} from './easingModel';
export function validateDocument(raw:unknown):string[]{
 const errs:string[]=[];const bad=(m:string)=>{if(errs.length<20)errs.push(m);};
 const d=raw as Partial<AnimationDocument>|null;
 if(!d||typeof d!=='object')return ['document is not an object'];
 if(d.schema!==SCHEMA_VERSION)bad(`unsupported schema ${String(d.schema)}`);
 if(typeof d.id!=='string'||!d.id)bad('missing id');
 if(typeof d.name!=='string')bad('missing name');
 if(!Number.isInteger(d.revision))bad('bad revision');
 try{validateAnimationAssets(d as AnimationDocument);}catch(e){bad((e as Error).message);}
 for(const p of validatePrecomps(d as AnimationDocument))bad(p);
 for(const p of validateMotionLib(d.motions))bad(p);
 for(const p of validateTextPresetLib(d.textPresets))bad(p);
 for(const p of validateEasingLib(d.easings))bad(p);
 if(!Array.isArray(d.compositions)||!d.compositions.length)return [...errs,'no compositions'];
 const compIds=new Set<string>();
 for(const c of d.compositions){
  if(!c||typeof c.id!=='string'){bad('composition without id');continue;}
  if(compIds.has(c.id))bad(`duplicate composition ${c.id}`);compIds.add(c.id);
  if(!Number.isInteger(c.width)||!Number.isInteger(c.height)||c.width<1||c.height<1||c.width>16384||c.height>16384)bad(`${c.id}: bad size`);
  if(!validRate(c.fps))bad(`${c.id}: bad frame rate`);
  if(!Number.isInteger(c.duration)||c.duration<1)bad(`${c.id}: bad duration`);
  if(!validShutter(c.shutter))bad(`${c.id}: bad shutter`);
  const wa=c.workArea;
  if(!wa||!Number.isInteger(wa.in)||!Number.isInteger(wa.out)||wa.in<0||wa.out>c.duration||wa.out<=wa.in)bad(`${c.id}: bad work area`);
  if(c.markers!==undefined&&(!Array.isArray(c.markers)||c.markers.length>200||new Set(c.markers.map((m:Marker)=>m?.id)).size!==c.markers.length||!c.markers.every((m:Marker)=>m&&typeof m.id==='string'&&typeof m.label==='string'&&m.label.length<=100&&Number.isInteger(m.t)&&m.t>=c.start&&m.t<c.start+c.duration)))bad(`${c.id}: invalid markers`);
  if(!Array.isArray(c.layers)){bad(`${c.id}: layers missing`);continue;}
  for(const m of linkProblems(c.layers as never))bad(`${c.id}: ${m}`);
  const ids=new Set<string>();
  for(const l of c.layers){
   if(!l||typeof l.id!=='string'){bad(`${c.id}: layer without id`);continue;}
   if(ids.has(l.id))bad(`${c.id}: duplicate layer ${l.id}`);ids.add(l.id);
   if(l.motionBlur!==undefined&&typeof l.motionBlur!=='boolean')bad(`${c.id}: layer ${l.id} has a bad motion blur flag`);
   if(!['solid','text','shape','null','raster','audio','comp'].includes(l.kind))bad(`${l.id}: unknown kind`);
   if(!validRepeater(l.repeater))bad(`${l.id}: invalid repeater`);
   if(l.stroke!==undefined&&(l.kind!=='shape'||!/^#[0-9a-fA-F]{6}$/.test(l.stroke.color)||!isNum(l.stroke.width)||l.stroke.width<0||l.stroke.width>256||(l.stroke.trim!==undefined&&!validScalarProperty(l.stroke.trim,0,100))||(l.stroke.dash!==undefined&&!validScalarProperty(l.stroke.dash,-1000,1000))||(l.stroke.join!==undefined&&!(STROKE_JOINS as readonly string[]).includes(l.stroke.join))||(l.stroke.cap!==undefined&&!(STROKE_CAPS as readonly string[]).includes(l.stroke.cap))||(l.stroke.widthAnim!==undefined&&(!l.stroke.widthAnim.keys.length||!validScalarProperty(l.stroke.widthAnim,0,256)))||(l.stroke.opacityAnim!==undefined&&(!l.stroke.opacityAnim.keys.length||!validScalarProperty(l.stroke.opacityAnim,0,100)))||(l.stroke.miter!==undefined&&!(isNum(l.stroke.miter)&&l.stroke.miter>=1&&l.stroke.miter<=20))||(l.stroke.gradient!==undefined&&!(typeof l.stroke.gradient==='object'&&l.stroke.gradient!==null&&/^#[0-9a-fA-F]{6}$/.test(l.stroke.gradient.start)&&/^#[0-9a-fA-F]{6}$/.test(l.stroke.gradient.end)&&isNum(l.stroke.gradient.angle)&&l.stroke.gradient.angle>=0&&l.stroke.gradient.angle<=360&&(l.stroke.gradient.kind===undefined||l.stroke.gradient.kind==='linear'||l.stroke.gradient.kind==='radial')&&validGradientStops(l.stroke.gradient.stops)&&validGradientOpacities(l.stroke.gradient)))||(l.stroke.align!==undefined&&l.stroke.align!=='inside'&&l.stroke.align!=='outside')||(l.stroke.align!==undefined&&l.stroke.align!=='inside'&&l.stroke.align!=='outside')||[l.stroke.opacity,l.stroke.dashLen,l.stroke.dashGap].some((n,i)=>n!==undefined&&!(isNum(n)&&n>=(i?1:0)&&n<=100))))bad(`${l.id}: invalid stroke`);
   if(!validAudio(l,d as AnimationDocument))bad(`${l.id}: invalid audio`);
   if(l.gain!==undefined&&(l.kind!=='comp'||!l.gain.keys.length||!validScalarProperty(l.gain,0,200)))bad(`${l.id}: invalid comp layer volume`);
   if(l.colorKeys!==undefined){const ck=l.colorKeys as LayerColorKeys,okKeys=(ks:readonly ColorKey[]|undefined,allowed:boolean)=>ks===undefined||(allowed&&Array.isArray(ks)&&ks.length>=1&&ks.length<=MAX_COLOR_KEYS&&ks.every((k,i)=>Number.isInteger(k.t)&&/^#[0-9a-fA-F]{6}$/.test(k.color)&&(k.ease===undefined||(COLOR_EASES as readonly string[]).includes(k.ease))&&(i===0||k.t>ks[i-1].t)));
    if(typeof ck!=='object'||ck===null||Object.keys(ck).some(x=>x!=='fill'&&x!=='stroke')||!okKeys(ck.fill,['solid','shape','text'].includes(l.kind))||!okKeys(ck.stroke,l.kind==='shape'&&!!l.stroke))bad(`${l.id}: invalid colour keys`);}
   if(l.textReveal!==undefined&&(l.kind!=='text'||!validScalarProperty(l.textReveal,0,100)))bad(`${l.id}: invalid text reveal`);
   if(!validMasks(l))bad(`${l.id}: invalid masks`);
   if(!validAnimators(l))bad(`${l.id}: invalid text animators`);
   if((l.source?.textPath!==undefined||l.source?.textPathStart!==undefined)&&l.kind!=='text')bad(`${l.id}: text path on a non-text layer`);
   if(!validSource(l.source)||!validEffects(l.effects))bad(`${l.id}: invalid source/effects`);
   if(!Number.isInteger(l.inT)||!Number.isInteger(l.outT)||l.outT<=l.inT)bad(`${l.id}: bad timing`);
   for(const k of TRANSFORM_KEYS){
    const p=l.transform?.[k];const meta=PROP_META[k];
    if(!p||p.type!==meta.type||!okValue(meta.type,p.value)){bad(`${l.id}.${k}: bad property`);continue;}
    if(p.pathMode!==undefined&&!['parameter','arcLength'].includes(p.pathMode))bad(`${l.id}.${k}: bad path mode`);
    if(!Array.isArray(p.keys)){bad(`${l.id}.${k}: keys missing`);continue;}
    for(const m of validateModifiers(p.modifiers as never))bad(`${l.id}.${k}: ${m}`);
    let prev=-Infinity;
    for(const key of p.keys){
     if(!Number.isInteger(key.t)||key.t<=prev)bad(`${l.id}.${k}: keys must be strictly ascending integers`);prev=key.t;
     if(!okValue(meta.type,key.v))bad(`${l.id}.${k}: bad key value`);
     if(!['hold','linear','bezier'].includes(key.interp))bad(`${l.id}.${k}: bad interpolation`);
     if(!Array.isArray(key.out)||!Array.isArray(key.in)||![...key.out,...key.in].every(isNum)||key.out[0]<0||key.out[0]>1||key.in[0]<0||key.in[0]>1)bad(`${l.id}.${k}: bad ease handles`);
     for(const h of [key.channelOut,key.channelIn])if(h!==undefined&&(meta.type!=='vec2'||!Array.isArray(h)||h.length!==2||!h.every(v=>isVec(v)&&v[0]>=0&&v[0]<=1&&v[1]>=-2&&v[1]<=3)))bad(`${l.id}.${k}: invalid channel ease`);
     for(const s of [key.sIn,key.sOut])if(s!==undefined&&(meta.type!=='vec2'||!isVec(s)))bad(`${l.id}.${k}: bad spatial tangent`);
    }
   }
  }
  for(const l of c.layers){
   if(l?.matte&&!validMatte(l,c.layers))bad(`${l.id}: invalid track matte`);
   if(l?.parent&&!ids.has(l.parent))bad(`${l.id}: missing parent`);
   else if(l&&l.parent&&wouldCycle({layers:c.layers} as Composition,l.id,l.parent))bad(`${l.id}: parent cycle`);
  }
 }
 if(!compIds.has(d.activeComp as string))bad('activeComp not found');
 return errs;
}
export {frameToTick};

export const MAX_REPEATER_COPIES=20;
export function validRepeater(r:unknown):boolean{
 if(r===undefined)return true;if(!r||typeof r!=='object')return false;
 const v=r as Record<string,unknown>,ok=(n:unknown,lo:number,hi:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
 return Number.isInteger(v.copies)&&ok(v.copies,2,MAX_REPEATER_COPIES)&&ok(v.x,-4096,4096)&&ok(v.y,-4096,4096)&&ok(v.rotation,-3600,3600)&&ok(v.scale,1,400)&&ok(v.opacity,0,100)&&(v.hue===undefined||ok(v.hue,-360,360))&&Object.keys(v).every(k=>['copies','x','y','rotation','scale','opacity','hue'].includes(k));
}
export const MAX_GRADIENT_STOPS=6;
const validOpacityPct=(v:unknown)=>v===undefined||(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100);
/** Start and end opacity of a gradient (percent, optional). */
export const validGradientOpacities=(g:{startOpacity?:unknown;endOpacity?:unknown;cx?:unknown;cy?:unknown;radius?:unknown})=>validOpacityPct(g.startOpacity)&&validOpacityPct(g.endOpacity)&&[[g.cx,0,1],[g.cy,0,1],[g.radius,0.05,1.5]].every(([v,lo,hi])=>v===undefined||(typeof v==='number'&&Number.isFinite(v)&&v>=(lo as number)&&v<=(hi as number)));
/** Shared check for the optional extra stops of a gradient. */
export function validGradientStops(st:unknown):boolean{
 if(st===undefined)return true;if(!Array.isArray(st)||st.length>MAX_GRADIENT_STOPS)return false;
 let last=0;for(const x of st as {offset:unknown;color:unknown}[]){if(!x||typeof x!=='object'||typeof x.offset!=='number'||!Number.isFinite(x.offset)||x.offset<0.01||x.offset>0.99||x.offset<=last||typeof x.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(x.color)||!validOpacityPct((x as {opacity?:unknown}).opacity))return false;last=x.offset;}
 return true;}
export function validSource(s:LayerSource):boolean{return !!s&&typeof s==='object'&&(s.color===undefined||/^#[0-9a-fA-F]{6}$/.test(s.color))&&[s.width,s.height,s.size].every(n=>n===undefined||(isNum(n)&&n>=1&&n<=16384))&&(s.text===undefined||(typeof s.text==='string'&&s.text.length<=2000))&&(s.compId===undefined||(typeof s.compId==='string'&&s.compId.length>0&&s.compId.length<=64)&&(s.speed===undefined||(isNum(s.speed)&&s.speed>=10&&s.speed<=1000))&&(s.loop===undefined||typeof s.loop==='boolean')&&(s.timeOffset===undefined||(isNum(s.timeOffset)&&Number.isInteger(s.timeOffset)&&s.timeOffset>=0&&s.timeOffset<=86400000)))&&(s.volume===undefined||(isNum(s.volume)&&s.volume>=0&&s.volume<=200))&&(s.font===undefined||s.font in TEXT_FONTS)&&(s.shape===undefined||['rect','ellipse','path','roundedRect','star','polygon'].includes(s.shape))&&(s.radius===undefined||(isNum(s.radius)&&s.radius>=0&&s.radius<=8192))&&(s.sides===undefined||(Number.isInteger(s.sides)&&s.sides>=3&&s.sides<=64))&&(s.innerRatio===undefined||(isNum(s.innerRatio)&&s.innerRatio>=0.05&&s.innerRatio<=0.95))&&(s.gradient===undefined||(!!s.gradient&&/^#[0-9a-fA-F]{6}$/.test(s.gradient.start)&&/^#[0-9a-fA-F]{6}$/.test(s.gradient.end)&&isNum(s.gradient.angle)&&s.gradient.angle>=0&&s.gradient.angle<=360&&(s.gradient.kind===undefined||s.gradient.kind==='linear'||s.gradient.kind==='radial')&&validGradientStops(s.gradient.stops)&&validGradientOpacities(s.gradient)))&&(s.shape!=='path'||!!s.path)&&(s.path===undefined||validNormPath(s.path,256,1))&&validPathKeys(s)&&validSubpaths(s)&&validTextPath(s);}
export const MAX_TEXT_PATH_POINTS=64;
function validTextPath(s:LayerSource):boolean{
 if(s.textPathStart!==undefined&&!(isNum(s.textPathStart)&&s.textPathStart>=0&&s.textPathStart<=100))return false;
 if(s.textPath===undefined)return s.textPathStart===undefined;
 const p=s.textPath;return !!p&&Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=MAX_TEXT_PATH_POINTS&&typeof p.closed==='boolean'&&validMaskPath(p as MaskPath);
}
const okNorm=(p:{x:number;y:number;inX?:number;inY?:number;outX?:number;outY?:number})=>!!p&&isNum(p.x)&&isNum(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&[p.inX,p.inY,p.outX,p.outY].every(h=>h===undefined||(isNum(h)&&Math.abs(h)<=2));
const validNormPath=(p:{points:readonly {x:number;y:number}[];closed:boolean},max:number,min=2)=>!!p&&Array.isArray(p.points)&&p.points.length>=min&&p.points.length<=max&&typeof p.closed==='boolean'&&p.points.every(okNorm);
export const MAX_SUBPATHS=8;export const MAX_COMPOUND_POINTS=512;
/** Further subpaths: path shapes only, 1 to 7 of them (8 with the main path), every one a valid normalized path, at most 512 points in total, never together with morph keys. */
function validSubpaths(s:LayerSource):boolean{
 const k=s.subpaths;if(k===undefined)return true;
 if(s.shape!=='path'||!s.path||s.pathKeys!==undefined||!Array.isArray(k)||!k.length||k.length>=MAX_SUBPATHS)return false;
 return k.every(p=>validNormPath(p,256,1))&&s.path.points.length+k.reduce((n,p)=>n+p.points.length,0)<=MAX_COMPOUND_POINTS;
}
/** Morph keys need a path source of at most 32 points; every key keeps the point count and closed flag, times ascend, at most MAX_SHAPE_KEYS. */
function validPathKeys(s:LayerSource):boolean{
 const k=s.pathKeys;if(k===undefined)return true;
 if(s.shape!=='path'||!s.path||s.path.points.length<2||s.path.points.length>MAX_MASK_POINTS||!Array.isArray(k)||!k.length||k.length>MAX_SHAPE_KEYS)return false;
 let prev=-1;return k.every(x=>!!x&&Number.isInteger(x.t)&&x.t>prev&&((prev=x.t),true)&&(x.ease===undefined||SHAPE_EASES.includes(x.ease))&&validNormPath(x.path,MAX_MASK_POINTS)&&x.path.points.length===s.path!.points.length&&x.path.closed===s.path!.closed);
}
export function validEffects(e:readonly LayerEffect[]|undefined):boolean{return e===undefined||(Array.isArray(e)&&e.length<=8&&new Set(e.map(x=>x?.id)).size===e.length&&e.every(x=>!!x&&typeof x.id==='string'&&['blur','tint',...STYLE_KINDS].includes(x.kind)&&(x.blur===undefined||((STYLE_KINDS as readonly string[]).includes(x.kind)&&isNum(x.blur)&&x.blur>=0&&x.blur<=64))&&(x.distance===undefined||((OFFSET_KINDS as readonly string[]).includes(x.kind)&&isNum(x.distance)&&x.distance>=0&&x.distance<=500))&&(x.angle===undefined||((OFFSET_KINDS as readonly string[]).includes(x.kind)&&isNum(x.angle)&&x.angle>=-360&&x.angle<=360))&&typeof x.enabled==='boolean'&&isNum(x.amount)&&x.amount>=0&&x.amount<=(x.kind==='blur'?64:1)&&/^#[0-9a-fA-F]{6}$/.test(x.color)&&(x.animation===undefined||validScalarProperty(x.animation,0,x.kind==='blur'?64:1))&&(x.colorKeys===undefined||(x.kind!=='blur'&&Array.isArray(x.colorKeys)&&x.colorKeys.length<=2000&&x.colorKeys.every((k:{t:number;color:string},i:number)=>k&&Number.isInteger(k.t)&&k.t>=0&&(i===0||k.t>x.colorKeys![i-1].t)&&/^#[0-9a-fA-F]{6}$/.test(k.color))))&&(x.bypassKeys===undefined||(Array.isArray(x.bypassKeys)&&x.bypassKeys.length<=2000&&x.bypassKeys.every((k:{t:number;bypass:boolean},i:number)=>k&&Number.isInteger(k.t)&&k.t>=0&&(i===0||k.t>x.bypassKeys![i-1].t)&&typeof k.bypass==='boolean')))));}

export function validScalarProperty(p:Property,min:number,max:number):boolean{
 const value=(v:unknown)=>isNum(v)&&v>=min&&v<=max;
 const handle=(h:Vec2)=>isVec(h)&&h[0]>=0&&h[0]<=1&&h[1]>=-2&&h[1]<=3;
 return !!p&&p.type==='scalar'&&value(p.value)&&Array.isArray(p.keys)&&p.keys.length<=2000&&p.keys.every((k,i)=>k&&Number.isInteger(k.t)&&k.t>=0&&(i===0||k.t>p.keys[i-1].t)&&value(k.v)&&['hold','linear','bezier'].includes(k.interp)&&handle(k.out)&&handle(k.in));
}

export const DEFAULT_LAYER_COLOR='#ffffff';

const MAX_OFFSET=3600*TICKS_PER_SECOND;
/** Audio layers carry `audio` and a file; every other kind must not. Trim stays inside the embedded file. */
export function validAudio(l:Layer,doc:Pick<AnimationDocument,'audioAssets'>):boolean{
 if(l.kind!=='audio')return l.audio===undefined;
 const a=l.audio;if(!a||typeof a.assetId!=='string'||!Number.isInteger(a.trimIn)||a.trimIn<0||!Number.isInteger(l.offset)||Math.abs(l.offset)>MAX_OFFSET||l.inT!==0)return false;
 const asset=doc.audioAssets?.find(x=>x.id===a.assetId);if(!asset)return false;
 return a.trimIn+(l.outT-l.inT)<=asset.durationTicks&&validScalarProperty(a.volume,0,200);
}

const inRange=(v:unknown,min:number,max:number)=>isNum(v)&&v>=min&&v<=max;
export function validAnimators(l:Layer):boolean{
 const a=l.animators;if(a===undefined)return true;
 if(l.kind!=='text'||!Array.isArray(a)||a.length>MAX_TEXT_ANIMATORS||new Set(a.map(x=>x?.id)).size!==a.length)return false;
 if(a.length&&Array.from(l.source.text??'').length>MAX_ANIMATED_CHARS)return false;
 return a.every(x=>!!x&&typeof x.id==='string'&&x.id.length>0&&x.id.length<=64&&typeof x.enabled==='boolean'&&inRange(x.start,0,100)&&inRange(x.end,0,100)&&x.start<=x.end&&inRange(x.softness,0,100)&&validScalarProperty(x.offset,-200,200)&&isVec(x.position)&&x.position.every((v:number)=>Math.abs(v)<=2000)&&inRange(x.scale,0,1000)&&inRange(x.opacity,0,100)&&(x.rotation===undefined||inRange(x.rotation,-3600,3600))&&(x.unit===undefined||x.unit==='char'||x.unit==='word')&&(x.color===undefined||/^#[0-9a-fA-F]{6}$/.test(x.color))&&(x.tracking===undefined||inRange(x.tracking,-200,200))&&(x.ease===undefined||(TEXT_EASES as readonly string[]).includes(x.ease)));
}

export function validVecProperty(p:Property|undefined,min:number,max:number):boolean{
 const value=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(n=>isNum(n)&&n>=min&&n<=max);
 const handle=(h:Vec2)=>isVec(h)&&h[0]>=0&&h[0]<=1&&h[1]>=-2&&h[1]<=3;
 return !!p&&p.type==='vec2'&&value(p.value)&&Array.isArray(p.keys)&&p.keys.length<=2000&&p.keys.every((k,i)=>k&&Number.isInteger(k.t)&&k.t>=0&&(i===0||k.t>p.keys[i-1].t)&&value(k.v)&&['hold','linear','bezier'].includes(k.interp)&&handle(k.out)&&handle(k.in));
}
export function validMaskPath(p:MaskPath|undefined):boolean{
 if(!p||!Array.isArray(p.points)||typeof p.closed!=='boolean'||p.points.length<1||p.points.length>MAX_MASK_POINTS||(p.closed&&p.points.length<3))return false;
 return p.points.every(q=>!!q&&inRange(q.x,-16384,16384)&&inRange(q.y,-16384,16384)&&[q.inX,q.inY,q.outX,q.outY].every(h=>h===undefined||inRange(h,-16384,16384)));
}
export const MAX_SHAPE_KEYS=64;
export function validShapeKeys(m:LayerMask):boolean{
 const k=m.shapeKeys;if(k===undefined)return true;
 return m.shape==='path'&&!!m.path&&Array.isArray(k)&&k.length>=1&&k.length<=MAX_SHAPE_KEYS&&k.every((x,i)=>!!x&&Number.isInteger(x.t)&&x.t>=0&&(i===0||x.t>k[i-1].t)&&(x.ease===undefined||(SHAPE_EASES as readonly string[]).includes(x.ease))&&validMaskPath(x.path)&&x.path.closed===m.path!.closed&&x.path.points.length===m.path!.points.length);
}
export function validMasks(l:Layer):boolean{
 const m=l.masks;if(m===undefined)return true;
 if(!Array.isArray(m)||m.length>MAX_LAYER_MASKS||(m.length&&(l.kind==='null'||l.kind==='audio'))||new Set(m.map(x=>x?.id)).size!==m.length)return false;
 return m.every(x=>!!x&&typeof x.id==='string'&&x.id.length>0&&x.id.length<=64&&['rect','ellipse','path'].includes(x.shape)&&['add','subtract'].includes(x.mode)&&inRange(x.x,-16384,16384)&&inRange(x.y,-16384,16384)&&inRange(x.width,1,16384)&&inRange(x.height,1,16384)&&inRange(x.feather,0,64)&&typeof x.invert==='boolean'
  &&(x.opacity===undefined||inRange(x.opacity,0,100))&&(x.shape==='path'?validMaskPath(x.path):x.path===undefined)&&validShapeKeys(x)
  &&(x.anim===undefined||(!!x.anim&&Object.keys(x.anim).every(k=>['position','size','feather','opacity'].includes(k))&&(x.anim.position===undefined||validVecProperty(x.anim.position,-16384,16384))&&(x.anim.size===undefined||validVecProperty(x.anim.size,1,16384))&&(x.anim.feather===undefined||validScalarProperty(x.anim.feather,0,64))&&(x.anim.opacity===undefined||validScalarProperty(x.anim.opacity,0,100)))));
}
/** A matte source is another drawable layer of the same composition without its own matte, and not itself matted by this layer's source. No chains, so no cycles. */
export function validMatte(l:Layer,layers:readonly Layer[]):boolean{
 const m=l.matte;if(m===undefined)return true;
 if(!m||typeof m.source!=='string'||!['alpha','luma'].includes(m.mode)||typeof m.invert!=='boolean'||l.kind==='null'||l.kind==='audio'||m.source===l.id)return false;
 const src=layers.find(x=>x.id===m.source);
 return !!src&&src.kind!=='audio'&&src.kind!=='null'&&!src.matte&&!layers.some(x=>x.matte?.source===l.id);
}

/** Problems with comp layers: missing target, a composition that contains itself (directly or through others), nesting too deep, or too many layers once everything is expanded. */
/** Transform for a comp layer: the child is centered on the parent, so a same-size child lines up exactly. */
export function precompTransform(cw:number,ch:number,pw:number,ph:number):Transform{const t=makeTransform(pw,ph);return {...t,anchor:prop('vec2',[cw/2,ch/2])};}
export function validatePrecomps(d:AnimationDocument):string[]{
 const comps=new Map((d.compositions??[]).map(c=>[c.id,c]));const out:string[]=[];const memo=new Map<string,{depth:number;layers:number}>();
 const visit=(id:string,stack:readonly string[]):{depth:number;layers:number}|null=>{
  if(stack.includes(id))return null;const hit=memo.get(id);if(hit)return hit;const c=comps.get(id);if(!c)return {depth:0,layers:0};
  let depth=0,layers=c.layers?.length??0;
  for(const l of c.layers??[]){if(l?.kind!=='comp')continue;const t=l.source?.compId;
   if(!t||!comps.has(t)){out.push(`${l.id}: comp layer points at a missing composition`);continue;}
   const r=visit(t,[...stack,id]);if(!r){out.push(`${l.id}: a composition cannot contain itself`);continue;}
   depth=Math.max(depth,r.depth+1);layers+=r.layers;}
  const res={depth,layers};memo.set(id,res);return res;};
 for(const c of comps.values()){const r=visit(c.id,[]);if(r&&r.depth>MAX_PRECOMP_DEPTH)out.push(`${c.id}: precomps are nested more than ${MAX_PRECOMP_DEPTH} deep`);if(r&&r.layers>MAX_PRECOMP_LAYERS)out.push(`${c.id}: precomps expand to more than ${MAX_PRECOMP_LAYERS} layers`);}
 return [...new Set(out)];
}
