import {evaluate} from './interpolate';
import {snapToFrame,TICKS_PER_SECOND} from './time';
import {MAX_TEXT_ANIMATORS,EASE_IN,EASE_OUT,findComp,findLayer,newId,type AnimationDocument,type Layer,type TextAnimator} from './model';
import type {Edit} from './edit';
/** One rendered character: its text, the shift relative to the previous character, and neutral-based style values. */
export interface CharSpan{ch:string;dx:number;dy:number;scale:number;opacity:number;/** Degrees, absolute per glyph. */rotate:number;/** Mixed fill colour, or undefined when no animator changes it. */fill?:string}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
/** Selector weight of character `index` of `count`, 0..1. Pure and deterministic: no randomness, no time source. */
export function charWeight(a:TextAnimator,index:number,count:number,offset:number):number{
 const c=(index+0.5)/count*100,lo=a.start+offset,hi=a.end+offset;
 const d=c<lo?lo-c:c>hi?c-hi:0;
 if(d===0)return 1;
 return a.softness>0?Math.max(0,1-d/a.softness):0;
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
 let px=0,py=0;const base=/^#[0-9a-fA-F]{6}$/.test(layer.source.color??'')?layer.source.color!:'#ffffff';
 const unitsOf=active.map(a=>unitIndex(chars,a.unit));
 return chars.map((ch,i)=>{
  let x=0,y=0,scale=1,opacity=1,rotate=0,fill:string|undefined;
  active.forEach((a,k)=>{const w=charWeight(a,unitsOf[k].idx[i],unitsOf[k].count,offsets[k]);x+=a.position[0]*w;y+=a.position[1]*w;scale*=1+(a.scale/100-1)*w;opacity*=1+(a.opacity/100-1)*w;rotate+=(a.rotation??0)*w;if(a.color&&w>0)fill=mixHex(fill??base,a.color,w);});
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
export type AnimatorPatch=Partial<Pick<TextAnimator,'enabled'|'start'|'end'|'softness'|'position'|'scale'|'opacity'|'rotation'|'unit'>>&{color?:string|null};
export type AnimatorOp=
 |{op:'add';id?:string}
 |{op:'remove';animator:string}
 |{op:'update';animator:string;patch:AnimatorPatch}
 |{op:'offset';animator:string;value:number;t:number}
 |{op:'animate';animator:string;on:boolean;t:number}
 /** Sweeps the selector over the text: `wave` moves it across from before the first to past the last character, `reveal` releases the characters from the left (selector starts covering the text). */
 |{op:'stagger';animator:string;t:number;seconds:number;mode:'wave'|'reveal'};
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
