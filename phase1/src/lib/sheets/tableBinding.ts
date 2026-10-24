import {parseSpan} from './format';
import type {TableInfo} from './protocol';

export interface TableHit{table:TableInfo;from:{row:number;col:number};to:{row:number;col:number}}
export interface Rect{r0:number;c0:number;r1:number;c1:number}

/**
 * Tables of the active sheet (TablesInfo) overlapping the given range. Headerless
 * tables are excluded: the panel filter model needs a header row first, so offering
 * them would guess at the data.
 */
export function tablesHere(tables:readonly TableInfo[]|undefined,r:Rect):TableHit[]{
 const out:TableHit[]=[];
 for(const table of tables??[]){
  if(!table.header)continue;
  const sp=parseSpan(table.range);if(!sp||!sp.to)continue;
  if(sp.from.row<=r.r1&&sp.to.row>=r.r0&&sp.from.col<=r.c1&&sp.to.col>=r.c0)out.push({table,from:sp.from,to:sp.to});
 }
 return out;
}
/** The range a table binding selects: full table minus the totals row (a totals row is not filter data). */
export const tableFilterRange=(h:TableHit):Rect=>({r0:h.from.row,c0:h.from.col,r1:h.table.totals?h.to.row-1:h.to.row,c1:h.to.col});
export const sameRange=(a:Rect,b:Rect):boolean=>a.r0===b.r0&&a.c0===b.c0&&a.r1===b.r1&&a.c1===b.c1;
