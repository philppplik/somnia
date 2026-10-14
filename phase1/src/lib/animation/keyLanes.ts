import type {Layer} from './model';
/** Timeline lanes for keyed style properties that have no transform row: comp layer volume, stroke width and opacity, fill and stroke colour. */
export interface StyleKeyLane{id:'gain'|'strokeWidth'|'strokeOpacity'|'fill'|'stroke';labelKey:string;ticks:readonly number[]}
export function styleKeyLanes(l:Layer):StyleKeyLane[]{
 const out:StyleKeyLane[]=[];
 const add=(id:StyleKeyLane['id'],labelKey:string,ticks:readonly number[]|undefined)=>{if(ticks?.length)out.push({id,labelKey,ticks});};
 add('gain','animation.precomp.volume',l.kind==='comp'?l.gain?.keys.map(k=>k.t):undefined);
 add('strokeWidth','animation.stroke.width',l.stroke?.widthAnim?.keys.map(k=>k.t));
 add('strokeOpacity','animation.stroke.opacity',l.stroke?.opacityAnim?.keys.map(k=>k.t));
 add('fill','animation.layer.color',l.colorKeys?.fill?.map(k=>k.t));
 add('stroke','animation.stroke.color',l.colorKeys?.stroke?.map(k=>k.t));
 return out;
}
