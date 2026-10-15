export const DASH_PRESETS=['solid','dashed','dotted','dashDot'] as const;
export type DashPreset=typeof DASH_PRESETS[number];
/** Dash arrays scale with the stroke width (at least 1 unit) so a preset keeps its look on thin and thick lines. Empty array means solid. */
export function dashArrayFor(preset:DashPreset,strokeWidth:number):number[]{
  if(!(DASH_PRESETS as readonly string[]).includes(preset))throw Error('Unknown dash preset');
  if(!Number.isFinite(strokeWidth)||strokeWidth<0)throw Error('Stroke width is not valid');
  const w=Math.max(1,strokeWidth);
  return preset==='solid'?[]:preset==='dashed'?[3*w,2*w]:preset==='dotted'?[w,2*w]:[3*w,2*w,w,2*w];
}
/** The preset a dash array matches for this width, or 'custom' for anything the presets cannot produce (kept as is). */
export function dashPresetOf(dash:readonly number[]|undefined,strokeWidth:number):DashPreset|'custom'{
  if(!dash||!dash.length)return 'solid';
  for(const p of DASH_PRESETS){const a=dashArrayFor(p,strokeWidth);if(a.length===dash.length&&a.every((v,i)=>Math.abs(v-dash[i])<1e-9))return p;}
  return 'custom';
}
