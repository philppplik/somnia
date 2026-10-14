import {MAX_ROWS,MAX_COLS,addressOf} from './format';import {rectCells,type Rect} from './clipboard';import type {SheetLayout,ViewCell} from './protocol';
/** Existing formatted viewport cache only. Never fetch offscreen or raw formulas. */
export function previewCachedSheetSelection(range:Rect,layout:SheetLayout|null,cells:ReadonlyMap<string,ViewCell>){
 if(!layout||Object.values(range).some(n=>!Number.isSafeInteger(n)||n<0)||range.r1<range.r0||range.c1<range.c0||range.r1>=MAX_ROWS||range.c1>=MAX_COLS||rectCells(range)>100)throw Error('Selection unavailable');
 if(layout.rows.some(r=>r.hidden&&r.i>=range.r0&&r.i<=range.r1)||layout.cols.some(c=>c.hidden&&c.i>=range.c0&&c.i<=range.c1)||layout.merges.some(m=>m.r0<=range.r1&&m.r1>=range.r0&&m.c0<=range.c1&&m.c1>=range.c0))throw Error('Hidden or merged selection');
 const rows=[];let bytes=0;for(let r=range.r0;r<=range.r1;r++)for(let c=range.c0;c<=range.c1;c++){const address=addressOf(r,c),cell=cells.get(address);if(!cell||typeof cell.text!=='string'||/[\uD800-\uDFFF\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(cell.text)||new TextEncoder().encode(cell.text).length>4096)throw Error('Selected cell not cached');bytes+=new TextEncoder().encode(cell.text).length;if(bytes>16384)throw Error('Selected text too large');rows.push(Object.freeze({address,text:cell.text}));}return Object.freeze(rows);
}
