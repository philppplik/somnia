import type {Layer} from './model';
/** Timeline lanes for keyed style properties that have no transform row: comp layer volume, stroke width and opacity, fill and stroke colour. */
export interface StyleKeyLane{id:'gain'|'strokeWidth'|'strokeOpacity'|'fill'|'stroke';labelKey:string;ticks:readonly number[]}
export type StyleLaneId=StyleKeyLane['id'];
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

/** A selected key in a style lane (view state, not saved). */
export interface StyleKeyRef{layer:string;lane:StyleLaneId;t:number}
export const MAX_STYLE_SELECTION=200;
/** Drops picks whose layer, lane or key no longer exists; keeps order and removes duplicates. */
export function pruneStyleKeys(layers:readonly Layer[],picks:readonly StyleKeyRef[]):StyleKeyRef[]{
 const seen=new Set<string>(),out:StyleKeyRef[]=[];
 for(const p of picks){
  const l=layers.find(x=>x.id===p.layer),id=`${p.layer}|${p.lane}|${p.t}`;
  if(!l||seen.has(id)||!styleKeyLanes(l).some(x=>x.id===p.lane&&x.ticks.includes(p.t)))continue;
  seen.add(id);out.push(p);if(out.length>=MAX_STYLE_SELECTION)break;}
 return out;
}
/** Toggles one key in a selection (shift-click). */
export function toggleStyleKey(picks:readonly StyleKeyRef[],p:StyleKeyRef):StyleKeyRef[]{
 const same=(a:StyleKeyRef)=>a.layer===p.layer&&a.lane===p.lane&&a.t===p.t;
 return picks.some(same)?picks.filter(a=>!same(a)):[...picks,p].slice(-MAX_STYLE_SELECTION);
}
