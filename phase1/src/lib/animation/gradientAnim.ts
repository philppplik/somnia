import {evaluate} from './interpolate';
import type {Property} from './model';
/** The gradient with its keyed angle sampled at `tick`; the result carries no `angleAnim`. */
export function gradientAt<G extends {angle:number;angleAnim?:Property}>(g:G,tick:number):Omit<G,'angleAnim'>{
 if(!g.angleAnim?.keys.length)return g;
 const {angleAnim,...rest}=g;return {...rest,angle:evaluate(angleAnim,tick) as number};
}
