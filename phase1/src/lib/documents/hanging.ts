import type {ParaPatch} from './protocol';
/** One hanging-indent step in points (the same as an indent step). */
export const HANG_STEP_PT=36;
const MAX_INDENT_PT=1440;
/**
 * The paragraph change for Ctrl+T (`more`) or Ctrl+Shift+T (`less`): the text block moves right by one step while the first line stays where it was
 * (more), or the hang shrinks by one step (less). Null when nothing can change (no hang to reduce, or the indent is at its limit).
 * `left` and `first` are the current indents in points; null (mixed or unset) counts as 0.
 */
export function hangingPatch(left:number|null,first:number|null,dir:'more'|'less'):ParaPatch|null{
 const l=Number.isFinite(left as number)?left as number:0,f=Number.isFinite(first as number)?first as number:0;
 if(dir==='more'){
  const nl=Math.min(MAX_INDENT_PT,l+HANG_STEP_PT);if(nl===l)return null;
  const nf=Math.max(-nl,f-(nl-l));return{indentLeft:nl,indentFirst:nf};
 }
 if(f>=0)return null;
 const step=Math.min(HANG_STEP_PT,-f);
 return{indentLeft:Math.max(0,l-step),indentFirst:f+step};
}
