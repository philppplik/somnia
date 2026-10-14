import {evaluate} from './interpolate';
import {colorAt} from './colorKeys';
import {GRADIENT_KEYS} from './keyTypes';
import type {ColorKey,Property} from './model';
import type {GradientKey} from './keyTypes';
type Anim={angle:number;angleAnim?:Property;anim?:{[K in GradientKey]?:Property};start?:string;end?:string;colorKeys?:{start?:readonly ColorKey[];end?:readonly ColorKey[]}};
/** The gradient with every keyed value sampled at `tick`; the result carries no key data. */
export function gradientAt<G extends Anim>(g:G,tick:number):Omit<G,'angleAnim'|'anim'|'colorKeys'>{
 if(!g.angleAnim?.keys.length&&!g.anim&&!g.colorKeys)return g;
 const {angleAnim,anim,colorKeys,...rest}=g,out:Record<string,unknown>={...rest};
 if(angleAnim?.keys.length)out.angle=evaluate(angleAnim,tick) as number;
 if(anim)for(const k of GRADIENT_KEYS){const p=anim[k];if(p?.keys.length)out[k]=evaluate(p,tick) as number;}
 if(colorKeys?.start?.length)out.start=colorAt(colorKeys.start,g.start??'#000000',tick);
 if(colorKeys?.end?.length)out.end=colorAt(colorKeys.end,g.end??'#000000',tick);
 return out as Omit<G,'angleAnim'|'anim'|'colorKeys'>;
}
