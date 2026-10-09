import type {SoundParam} from './protocol';
const clampTo=(p:SoundParam,v:number)=>{
 let x=Number.isFinite(v)?Math.min(p.max,Math.max(p.min,v)):p.default;
 if(p.unit==='Toggle'||p.unit==='Choice')x=Math.round(x);return x;
};
/** Value to 0..1 control travel, honouring the log taper (same mapping as the engine's ParamInfo). */
export function toNorm(p:SoundParam,v:number){
 const x=clampTo(p,v),span=p.max-p.min;if(!(span>0))return 0;
 if(p.taper==='Log'&&p.min>0)return Math.min(1,Math.max(0,Math.log(x/p.min)/Math.log(p.max/p.min)));
 return Math.min(1,Math.max(0,(x-p.min)/span));
}
export function fromNorm(p:SoundParam,t:number){
 const k=Number.isFinite(t)?Math.min(1,Math.max(0,t)):0;
 const v=p.taper==='Log'&&p.min>0?p.min*Math.pow(p.max/p.min,k):p.min+(p.max-p.min)*k;
 return clampTo(p,v);
}
const UNIT:Record<string,string>={Db:' dB',Hz:' Hz',Ms:' ms',Percent:' %',Semitones:' st',Cents:' ct',Seconds:' s'};
export function formatParam(p:SoundParam,v:number){
 const x=clampTo(p,v);
 if(p.unit==='Choice')return p.choices[x]??String(x);
 if(p.unit==='Toggle')return x?'on':'off';
 const abs=Math.abs(x),digits=abs>=1000?0:abs>=100?0:abs>=10?1:2;
 return `${x.toFixed(digits)}${UNIT[p.unit]??''}`;
}
export const isDefault=(p:SoundParam,v:number|undefined)=>v===undefined||Math.abs(clampTo(p,v)-p.default)<1e-6;
