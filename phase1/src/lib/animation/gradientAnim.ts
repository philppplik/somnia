import {evaluate} from './interpolate';
import {colorAt} from './colorKeys';
import {GRADIENT_KEYS} from './keyTypes';
import type {ColorKey,GradientStop,Property} from './model';
import type {GradientKey} from './keyTypes';
type Anim={angle:number;angleAnim?:Property;anim?:{[K in GradientKey]?:Property};stops?:readonly GradientStop[];start?:string;end?:string;colorKeys?:{start?:readonly ColorKey[];end?:readonly ColorKey[]}};
/** The gradient with every keyed value sampled at `tick`; the result carries no key data. */
export function gradientAt<G extends Anim>(g:G,tick:number):Omit<G,'angleAnim'|'anim'|'colorKeys'>{
 if(!g.angleAnim?.keys.length&&!g.anim&&!g.colorKeys&&!g.stops?.some(x=>x.offsetAnim||x.colorKeys))return g;
 const {angleAnim,anim,colorKeys,...rest}=g,out:Record<string,unknown>={...rest};
 if(angleAnim?.keys.length)out.angle=evaluate(angleAnim,tick) as number;
 if(anim)for(const k of GRADIENT_KEYS){const p=anim[k];if(p?.keys.length)out[k]=evaluate(p,tick) as number;}
 if(colorKeys?.start?.length)out.start=colorAt(colorKeys.start,g.start??'#000000',tick);
 if(colorKeys?.end?.length)out.end=colorAt(colorKeys.end,g.end??'#000000',tick);
 if(g.stops?.some(x=>x.offsetAnim||x.colorKeys)){let prev=0;out.stops=g.stops.map(x=>{const {offsetAnim,colorKeys:ck,...r}=x;let off=offsetAnim?.keys.length?evaluate(offsetAnim,tick) as number:r.offset;off=Math.min(0.99,Math.max(prev+0.01,off));prev=off;return {...r,offset:Math.round(off*1e4)/1e4,color:ck?.length?colorAt(ck,r.color,tick):r.color};});}
 return out as Omit<G,'angleAnim'|'anim'|'colorKeys'>;
}
