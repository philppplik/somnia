import {evaluate} from './interpolate';
import {snapToFrame,TICKS_PER_SECOND} from './time';
import {MAX_TEXT_ANIMATORS,EASE_IN,EASE_OUT,findComp,findLayer,newId,type AnimationDocument,type Layer,type TextAnimator,type Vec2,type MaskPath,type MaskPoint,MAX_TEXT_PATH_POINTS,validSource} from './model';
import {worldMatrix} from './scene';
import {bezierPath} from './masks';
import type {Edit} from './edit';
/** One rendered character: its text, the shift relative to the previous character, and neutral-based style values. */
export interface CharSpan{ch:string;dx:number;dy:number;scale:number;opacity:number;/** Degrees, absolute per glyph. */rotate:number;/** Mixed fill colour, or undefined when no animator changes it. */fill?:string}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
/** Shapes the 0..1 softness ramp: smooth is smoothstep, in starts slow, out ends slow. */
export const easeWeight=(e:TextAnimator['ease'],w:number)=>e==='smooth'?w*w*(3-2*w):e==='in'?w*w:e==='out'?1-(1-w)*(1-w):w;
/** Selector weight of character `index` of `count`, 0..1. Pure and deterministic: no randomness, no time source. */
export function charWeight(a:TextAnimator,index:number,count:number,offset:number):number{
 const c=(index+0.5)/count*100,lo=a.start+offset,hi=a.end+offset;
 const d=c<lo?lo-c:c>hi?c-hi:0;
 if(d===0)return 1;
 return a.softness>0?easeWeight(a.ease,Math.max(0,1-d/a.softness)):0;
}
/** Selector unit of every character: its own index, or the index of the word it belongs to (spaces belong to the word before them). */
export function unitIndex(chars:readonly string[],unit:'char'|'word'|undefined):{idx:number[];count:number}{
 if(unit!=='word')return {idx:chars.map((_,i)=>i),count:chars.length};
 let w=-1,inWord=false;const idx=chars.map(ch=>{if(/\s/.test(ch)){inWord=false;return Math.max(w,0);}if(!inWord){w++;inWord=true;}return w;});
 return {idx,count:Math.max(w+1,1)};
}
/** Per-character spans for a text layer at `tick`, or undefined when no enabled animator applies. Animators combine: shifts add, scale and opacity multiply. */
export function animatedChars(layer:Layer,text:string,tick:number):CharSpan[]|undefined{
 const active=(layer.animators??[]).filter(a=>a.enabled);if(!active.length||layer.kind!=='text')return undefined;
 const chars=Array.from(text);if(!chars.length)return undefined;
 const offsets=active.map(a=>clamp(a.offset.keys.length?evaluate(a.offset,tick) as number:a.offset.value as number,-200,200));
 let px=0,py=0,track=0;const base=/^#[0-9a-fA-F]{6}$/.test(layer.source.color??'')?layer.source.color!:'#ffffff';
 const unitsOf=active.map(a=>unitIndex(chars,a.unit));
 return chars.map((ch,i)=>{
  let x=0,y=0,scale=1,opacity=1,rotate=0,fill:string|undefined;
  const before=track;x+=before;
  active.forEach((a,k)=>{const w=charWeight(a,unitsOf[k].idx[i],unitsOf[k].count,offsets[k]);track+=(a.tracking??0)*w;x+=a.position[0]*w;y+=a.position[1]*w;scale*=1+(a.scale/100-1)*w;opacity*=1+(a.opacity/100-1)*w;rotate+=(a.rotation??0)*w;if(a.color&&w>0)fill=mixHex(fill??base,a.color,w);});
  const span={ch,dx:round(x-px),dy:round(y-py),scale:round(scale),opacity:round(clamp(opacity,0,1)),rotate:round(rotate),...(fill?{fill}:{})};px=x;py=y;return span;
 });
}
/** Linear sRGB-channel mix of two #rrggbb colours, `u` in 0..1. */
export function mixHex(a:string,b:string,u:number):string{
 const ch=(h:string,i:number)=>parseInt(h.slice(1+i*2,3+i*2),16);
 return '#'+[0,1,2].map(i=>Math.round(ch(a,i)+(ch(b,i)-ch(a,i))*clamp(u,0,1)).toString(16).padStart(2,'0')).join('');
}
const round=(v:number)=>Math.round(v*1e4)/1e4;

export const DEFAULT_ANIMATOR_COLOR='#ff7a59';
export type AnimatorPatch=Partial<Pick<TextAnimator,'enabled'|'start'|'end'|'softness'|'position'|'scale'|'opacity'|'rotation'|'unit'|'tracking'|'ease'>>&{color?:string|null};
export type AnimatorOp=
 |{op:'add';id?:string}
 |{op:'remove';animator:string}
 |{op:'update';animator:string;patch:AnimatorPatch}
 |{op:'offset';animator:string;value:number;t:number}
 |{op:'animate';animator:string;on:boolean;t:number}
 /** Sweeps the selector over the text: `wave` moves it across from before the first to past the last character, `reveal` releases the characters from the left (selector starts covering the text). */
 |{op:'stagger';animator:string;t:number;seconds:number;mode:'wave'|'reveal'}
 /** Adds a ready-made per-character entrance that plays over `seconds` from `t`. Counts toward the animator limit. */
 |{op:'preset';preset:TextPreset;t:number;seconds:number;unit?:'char'|'word'};
export const TEXT_PRESETS=['rise','pop','spin','fade','typewriter'] as const;
export type TextPreset=typeof TEXT_PRESETS[number];
const PRESET_BASE:Record<TextPreset,Partial<TextAnimator>>={
 rise:{position:[0,40],opacity:0,softness:30,ease:'out'},pop:{scale:0,opacity:0,softness:30,ease:'out'},spin:{rotation:180,scale:50,opacity:0,softness:30,ease:'out'},
 fade:{opacity:0,softness:60,ease:'smooth'},typewriter:{opacity:0,softness:0}};
/** A neutral-to-visible starter: first half of the text drops 40 px and fades, softly. */
export const defaultAnimator=(id=newId('anim')):TextAnimator=>({id,enabled:true,start:0,end:50,softness:25,offset:{type:'scalar',value:0,keys:[]},position:[0,40],scale:100,opacity:0});
const key=(t:number,v:number)=>({t,v,interp:'linear' as const,out:EASE_OUT,in:EASE_IN});
/** Turns one animator operation into a single undoable edit. Bounds are enforced again by document validation. */
export function animatorEdit(doc:AnimationDocument,layerId:string,o:AnimatorOp):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');if(l.kind!=='text')throw Error('Text animators require a text layer.');
 const list=l.animators??[];const target=(id:string)=>list.find(a=>a.id===id)??(()=>{throw Error('Animator no longer exists.');})();
 const set=(animators:readonly TextAnimator[]):Edit=>({type:'text.animators',layer:l.id,animators});
 const map=(id:string,fn:(a:TextAnimator)=>TextAnimator)=>{target(id);return set(list.map(a=>a.id===id?fn(a):a));};
 switch(o.op){
  case 'add':if(list.length>=MAX_TEXT_ANIMATORS)throw Error(`At most ${MAX_TEXT_ANIMATORS} animators per text layer.`);return set([...list,defaultAnimator(o.id)]);
  case 'preset':{
   if(!TEXT_PRESETS.includes(o.preset))throw Error('Unknown text preset.');
   if(list.length>=MAX_TEXT_ANIMATORS)throw Error(`At most ${MAX_TEXT_ANIMATORS} animators per text layer.`);
   if(!Number.isFinite(o.seconds)||o.seconds<0.1||o.seconds>30)throw Error('Stagger duration must be 0.1 to 30 seconds.');
   const t0=snapToFrame(o.t,c.fps),t1=snapToFrame(o.t+o.seconds*TICKS_PER_SECOND,c.fps);
   if(t0<c.start||t1>c.start+c.duration||t1<=t0)throw Error('The stagger does not fit the composition.');
   const a={...defaultAnimator(),position:[0,0] as Vec2,scale:100,opacity:100,start:0,end:100,...PRESET_BASE[o.preset],...(o.unit?{unit:o.unit}:{})} as TextAnimator;
   const to=100+a.softness;return set([...list,{...a,offset:{...a.offset,value:0,keys:[key(t0,0),key(t1,to)]}}]);}
  case 'remove':return map(o.animator,a=>a)&&set(list.filter(a=>a.id!==o.animator));
  case 'update':return map(o.animator,a=>{const {color,...rest}=o.patch;const next={...a,...rest};if(color===null)delete next.color;else if(color!==undefined)next.color=color;return next;});
  case 'offset':return map(o.animator,a=>({...a,offset:a.offset.keys.length?{...a.offset,keys:[...a.offset.keys.filter(k=>k.t!==o.t),key(o.t,o.value)].sort((x,y)=>x.t-y.t)}:{...a.offset,value:o.value}}));
  case 'stagger':return map(o.animator,a=>{
   if(!Number.isFinite(o.seconds)||o.seconds<0.1||o.seconds>30)throw Error('Stagger duration must be 0.1 to 30 seconds.');
   const t0=snapToFrame(o.t,c.fps),t1=snapToFrame(o.t+o.seconds*TICKS_PER_SECOND,c.fps);
   if(t0<c.start||t1>c.start+c.duration||t1<=t0)throw Error('The stagger does not fit the composition.');
   let from:number,to:number;
   if(o.mode==='wave'){from=-(a.end+a.softness);to=100-a.start+a.softness;}
   else{from=0;to=100-a.start+a.softness;}
   return {...a,offset:{...a.offset,value:from,keys:[key(t0,from),key(t1,to)]}};});
  case 'animate':return map(o.animator,a=>{const now=evaluate(a.offset,o.t) as number;return {...a,offset:o.on?(a.offset.keys.length?a.offset:{...a.offset,keys:[key(o.t,now)]}):{...a.offset,value:now,keys:[]}};});
 }
}

/** Id of the path element a text-on-path layer draws along. */
export const textPathId=(l:Layer)=>`tp-${l.id.replace(/[^A-Za-z0-9_-]/g,'_')}`;
/** SVG path data of a text layer's baseline path, or undefined for the straight baseline. */
export const textPathD=(l:Layer):string|undefined=>l.kind==='text'&&l.source.textPath?bezierPath(l.source.textPath as MaskPath,0,0):undefined;
export type TextPathOp={op:'set';from:string}|{op:'clear'}|{op:'start';value:number};
const r4=(n:number)=>Math.round(n*1e4)/1e4;
/** One edit: the baseline of a text layer follows (a copy of) a static path layer, or goes back to straight, or starts further along. The path is copied in layer pixels through both layers' world matrices at the composition start, so it keeps its place on screen; later changes of the path layer do not follow. Open and closed paths of at most 64 points; animated and compound paths are refused. Text animators still apply: x shifts run along the path, y shifts across it. */
export function textPathEdit(doc:AnimationDocument,layerId:string,o:TextPathOp):Edit{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!c||!l)throw Error('Select a layer.');if(l.kind!=='text')throw Error('Text on a path needs a text layer.');
 if(l.locked)throw Error('Layer is locked.');
 if(o.op==='clear'){if(!l.source.textPath)throw Error('The text has no path.');return {type:'layer.update',layer:l.id,source:{textPath:undefined,textPathStart:undefined}};}
 if(o.op==='start'){if(!l.source.textPath)throw Error('Set a path first.');if(!Number.isFinite(o.value)||o.value<0||o.value>100)throw Error('Start must be 0 to 100 percent.');return {type:'layer.update',layer:l.id,source:{textPathStart:r4(o.value)}};}
 const p=findLayer(c,o.from);if(!p||p.kind!=='shape'||p.source.shape!=='path'||!p.source.path)throw Error('Pick a path shape layer.');
 if(p.id===l.id)throw Error('Pick another layer.');
 if(p.source.pathKeys?.length)throw Error('Turn off path animation first.');
 if(p.source.subpaths?.length)throw Error('Compound paths cannot carry text.');
 const src=p.source.path as MaskPath;if(src.points.length<2||src.points.length>MAX_TEXT_PATH_POINTS)throw Error(`The path needs 2 to ${MAX_TEXT_PATH_POINTS} points.`);
 const t=c.start,M=worldMatrix(c,l,t),N=worldMatrix(c,p,t),det=M[0]*M[3]-M[1]*M[2];if(Math.abs(det)<1e-9)throw Error('The layer has no area.');
 const w2=Math.max(1,p.source.width??1),h2=Math.max(1,p.source.height??1);
 const toLocal=(x:number,y:number)=>{const wx=N[0]*x+N[2]*y+N[4],wy=N[1]*x+N[3]*y+N[5],dx=wx-M[4],dy=wy-M[5];return [(M[3]*dx-M[2]*dy)/det,(-M[1]*dx+M[0]*dy)/det] as const;};
 const lin=(x:number,y:number)=>{const wx=N[0]*x+N[2]*y,wy=N[1]*x+N[3]*y;return [(M[3]*wx-M[2]*wy)/det,(-M[1]*wx+M[0]*wy)/det] as const;};
 const points=src.points.map(q=>{const [x,y]=toLocal(q.x*w2,q.y*h2),pt:MaskPoint={x:r4(x),y:r4(y)};
  if(q.inX!==undefined||q.inY!==undefined){const [hx,hy]=lin((q.inX??0)*w2,(q.inY??0)*h2);pt.inX=r4(hx);pt.inY=r4(hy);}
  if(q.outX!==undefined||q.outY!==undefined){const [hx,hy]=lin((q.outX??0)*w2,(q.outY??0)*h2);pt.outX=r4(hx);pt.outY=r4(hy);}
  return pt;});
 const textPath={closed:src.closed,points};
 if(!validSource({...l.source,textPath}))throw Error('The path is out of range for this layer.');
 return {type:'layer.update',layer:l.id,source:{textPath,textPathStart:l.source.textPathStart??0}};
}
