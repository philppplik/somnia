/**
 * Focus requests for the formula builder's first field. The Smart Formula hero
 * (`sheets.formulas.open`, docs/concepts/hero-action-sheets.md) bumps this; the mounted
 * panel focuses its function select. Repeated hero clicks re-focus without toggling the panel.
 */
let count=0;
const listeners=new Set<()=>void>();
export const getFormulasFocusRequest=()=>count;
export function requestFormulasFocus(){count++;listeners.forEach(fn=>fn());}
export const subscribeFormulasFocus=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
