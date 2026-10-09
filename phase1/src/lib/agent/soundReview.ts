import {parseSound} from './soundStudio';
import type {SoundSettings} from '../sound/recipe';
/** One changed setting, ready for the review list. `key` is a locale key suffix; values are plain strings (numbers, on/off, mode names). */
export interface SoundChange{id:string;before:string;after:string}
const onOff=(b:boolean)=>b?'on':'off';
const num=(n:number)=>String(Math.round(n*1000)/1000);
const region=(r:SoundSettings['region'])=>r?`${r.mode} ${num(r.start)}-${num(r.end)} s`:'off';
const effect=(e:SoundSettings['effect'])=>e.id?`${e.id}${e.keepTail?'':' (no tail)'}`:'off';
/** Settings diff between two settings texts. Empty when nothing differs. Throws on invalid text, like the proposal path does. */
export function diffSound(beforeText:string,afterText:string):SoundChange[]{
 const a=parseSound(beforeText),b=parseSound(afterText),out:SoundChange[]=[];
 const add=(id:string,x:string,y:string)=>{if(x!==y)out.push({id,before:x,after:y});};
 add('region',region(a.region),region(b.region));
 add('trim',a.trim.on?`${num(a.trim.db)} dB`:'off',b.trim.on?`${num(b.trim.db)} dB`:'off');
 add('reverse',onOff(a.reverse),onOff(b.reverse));
 add('pitch',`${num(a.pitch)} st`,`${num(b.pitch)} st`);
 add('effect',effect(a.effect),effect(b.effect));
 const keys=new Set([...Object.keys(a.effect.params),...Object.keys(b.effect.params)]);
 for(const k of [...keys].sort())add(`effect.${k}`,a.effect.params[k]===undefined?'default':num(a.effect.params[k]),b.effect.params[k]===undefined?'default':num(b.effect.params[k]));
 add('fadeIn',`${num(a.fadeInMs)} ms`,`${num(b.fadeInMs)} ms`);add('fadeOut',`${num(a.fadeOutMs)} ms`,`${num(b.fadeOutMs)} ms`);
 add('normalize',a.normalize.on?`${num(a.normalize.db)} dB`:'off',b.normalize.on?`${num(b.normalize.db)} dB`:'off');
 return out;
}
