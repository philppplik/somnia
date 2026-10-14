import type {Vec2} from './keyTypes';
/** User-saved text animator presets: a leaf module so document validation (model.ts) does not pull in the library. */
export interface TextPresetSet{id:string;name:string;start:number;end:number;softness:number;position:Vec2;scale:number;opacity:number;rotation?:number;unit?:'char'|'word';color?:string;tracking?:number;ease?:'linear'|'smooth'|'in'|'out';/** Reveal or wave sweep played from the playhead when the preset is applied. Absent means the animator is added at rest. */sweep?:{mode:'wave'|'reveal';seconds:number}}
export interface TextPresetLib{version:1;items:readonly TextPresetSet[]}
export const TEXT_PRESET_LIB_VERSION=1,MAX_USER_TEXT_PRESETS=50;
const num=(v:unknown,lo:number,hi:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
/** True when `x` is a well-formed preset with every value inside the animator's own ranges. */
export function validTextPreset(x:unknown):x is TextPresetSet{
 const p=x as TextPresetSet;if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id||p.id.length>64||typeof p.name!=='string'||!p.name.trim()||p.name.length>40)return false;
 return num(p.start,0,100)&&num(p.end,0,100)&&p.start<=p.end&&num(p.softness,0,100)&&Array.isArray(p.position)&&p.position.length===2&&p.position.every(v=>num(v,-2000,2000))&&num(p.scale,0,1000)&&num(p.opacity,0,100)
  &&(p.rotation===undefined||num(p.rotation,-3600,3600))&&(p.unit===undefined||p.unit==='char'||p.unit==='word')&&(p.color===undefined||/^#[0-9a-fA-F]{6}$/.test(p.color))&&(p.tracking===undefined||num(p.tracking,-200,200))
  &&(p.ease===undefined||['linear','smooth','in','out'].includes(p.ease))&&(p.sweep===undefined||(!!p.sweep&&(p.sweep.mode==='wave'||p.sweep.mode==='reveal')&&num(p.sweep.seconds,0.1,30)));
}
/** Problems in a document's text preset library; empty means valid. */
export function validateTextPresetLib(lib:unknown):string[]{
 if(lib===undefined)return [];const l=lib as Partial<TextPresetLib>;
 if(!l||typeof l!=='object'||l.version!==TEXT_PRESET_LIB_VERSION||!Array.isArray(l.items))return ['text preset library has an unsupported version or shape'];
 if(l.items.length>MAX_USER_TEXT_PRESETS)return [`text preset library has more than ${MAX_USER_TEXT_PRESETS} presets`];
 const ids=new Set<string>(),names=new Set<string>();
 for(const m of l.items){if(!validTextPreset(m))return ['text preset library contains an invalid preset'];if(ids.has(m.id)||names.has(m.name.trim()))return ['text preset library has duplicate ids or names'];ids.add(m.id);names.add(m.name.trim());}
 return [];
}
