import type {Layer} from './model';
/** Timeline layer filter: a layer matches when every word of the query is found in its name, its kind or its colour label (case blind). An empty query matches all layers. View only, never stored in the document. */
export const MAX_FILTER_LENGTH=60;
export function layerMatches(l:Pick<Layer,'name'|'kind'|'label'>,query:string):boolean{
 const words=query.trim().toLowerCase().slice(0,MAX_FILTER_LENGTH).split(/\s+/).filter(Boolean);if(!words.length)return true;
 const hay=`${l.name} ${l.kind} ${l.label??''}`.toLowerCase();return words.every(w=>hay.includes(w));
}
