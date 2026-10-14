import {evaluate} from './interpolate';
import {GRADIENT_KEYS} from './keyTypes';
import type {Property} from './model';
import type {GradientKey} from './keyTypes';
type Anim={angle:number;angleAnim?:Property;anim?:{[K in GradientKey]?:Property}};
/** The gradient with every keyed value sampled at `tick`; the result carries no key data. */
export function gradientAt<G extends Anim>(g:G,tick:number):Omit<G,'angleAnim'|'anim'>{
 if(!g.angleAnim?.keys.length&&!g.anim)return g;
 const {angleAnim,anim,...rest}=g,out:Record<string,unknown>={...rest};
 if(angleAnim?.keys.length)out.angle=evaluate(angleAnim,tick) as number;
 if(anim)for(const k of GRADIENT_KEYS){const p=anim[k];if(p?.keys.length)out[k]=evaluate(p,tick) as number;}
 return out as Omit<G,'angleAnim'|'anim'>;
}
