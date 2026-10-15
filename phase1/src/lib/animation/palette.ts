import type {Layer} from './model';
/** Colour palette of a composition: every solid colour of solid, shape and text fills and shape strokes, with how many layers use it. */
export const MAX_PALETTE=12;
export const HEX=/^#[0-9a-fA-F]{6}$/;
export interface PaletteEntry{color:string;layers:number}
const uses=(l:Layer):string[]=>{const o:string[]=[];
 if(['solid','shape','text'].includes(l.kind)&&l.source.color&&HEX.test(l.source.color))o.push(l.source.color.toLowerCase());
 if(l.kind==='shape'&&l.stroke&&HEX.test(l.stroke.color))o.push(l.stroke.color.toLowerCase());return o;};
/** Colours in order of first use (top layer first), at most MAX_PALETTE. A layer counts once per colour. */
export function paletteOf(layers:readonly Layer[]):PaletteEntry[]{
 const m=new Map<string,number>();for(const l of layers)for(const c of new Set(uses(l)))m.set(c,(m.get(c)??0)+1);
 return [...m].slice(0,MAX_PALETTE).map(([color,layers])=>({color,layers}));
}
export type RecolorEdit={layer:string;source?:{color:string};stroke?:NonNullable<Layer['stroke']>};
/** Changes that swap `from` for `to` on the unlocked layers (fill and stroke). */
export function recolor(layers:readonly Layer[],from:string,to:string):RecolorEdit[]{
 const f=from.toLowerCase(),t=to.toLowerCase(),out:RecolorEdit[]=[];
 if(f===t)return out;
 for(const l of layers){if(l.locked)continue;const e:RecolorEdit={layer:l.id};
  if(['solid','shape','text'].includes(l.kind)&&l.source.color?.toLowerCase()===f)e.source={color:t};
  if(l.kind==='shape'&&l.stroke&&l.stroke.color.toLowerCase()===f)e.stroke={...l.stroke,color:t};
  if(e.source||e.stroke)out.push(e);}
 return out;
}
