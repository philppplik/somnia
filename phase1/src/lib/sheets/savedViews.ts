import type {SavedView,SavedViewOp} from './protocol';
/** Saved views (sheet, selected cell and zoom under a name): validation of untrusted command input. The Rust bridge re-validates. */
export const MAX_VIEW_NAME=64,MAX_SAVED_VIEWS=50;
const nameOf=(v:unknown)=>{if(typeof v!=='string'||v.trim()===''||[...v.trim()].length>MAX_VIEW_NAME||/[\u0000-\u001f\u007f]/.test(v))throw Error('The view name must be 1 to 64 characters without control characters.');return v.trim();};
export const viewNameProblem=(v:string)=>{try{nameOf(v);return null;}catch{return 'name';}};
export function parseSavedViewCommand(input:unknown):SavedViewOp{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('View operation must be an object.');
 const o=input as Record<string,unknown>;if(Object.keys(o).some(k=>k!=='kind'&&k!=='name'))throw Error('Unknown view field.');
 if(o.kind!=='save'&&o.kind!=='show'&&o.kind!=='delete')throw Error('Unsupported view operation.');
 return {kind:o.kind,name:nameOf(o.name)};
}
export function parseSavedViews(raw:unknown):SavedView[]{
 const list=(raw as {views?:unknown})?.views;if(!Array.isArray(list))return [];
 return list.slice(0,MAX_SAVED_VIEWS).flatMap(x=>{const r=x as Record<string,unknown>|null;
  if(!r||typeof r.name!=='string'||r.name===''||[...r.name].length>MAX_VIEW_NAME||typeof r.sheet!=='number'||!Number.isInteger(r.sheet)||r.sheet<0||r.sheet>254)return [];
  return [{name:r.name,sheet:r.sheet,selection:typeof r.selection==='string'&&/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(r.selection)?r.selection:'A1',zoom:typeof r.zoom==='number'&&Number.isInteger(r.zoom)&&r.zoom>=10&&r.zoom<=400?r.zoom:100}];});
}
/** Where a shown view lands, bounded; null when the bridge reply is unusable. */
export function parseShownView(raw:unknown):{sheet:number;selection:string}|null{
 const r=raw as Record<string,unknown>|null;if(!r||typeof r.sheet!=='number'||!Number.isInteger(r.sheet)||r.sheet<0||r.sheet>254||typeof r.selection!=='string'||!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(r.selection))return null;
 return {sheet:r.sheet,selection:r.selection};
}
