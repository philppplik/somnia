import type {SheetsEditReceipt,SheetsNativeState,SheetsRangeReceipt} from './protocol';
/** Strict validation of owner receipts: anything off-shape is rejected, never repaired or defaulted. */
const obj=(v:unknown,what:string):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error(`Invalid ${what}.`);return v as Record<string,unknown>;};
const uint=(v:unknown,what:string)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw Error(`Invalid ${what}.`);return v;};
const text=(v:unknown,what:string,max=256)=>{if(typeof v!=='string'||v.length===0||v.length>max)throw Error(`Invalid ${what}.`);return v;};
export function parseNativeState(input:unknown):SheetsNativeState{const o=obj(input,'native state');return {revision:uint(o.revision,'revision'),token:text(o.token,'token')};}
export function parseEditReceipt(input:unknown):SheetsEditReceipt{
 const o=obj(input,'receipt'),rb=obj(o.readback,'readback');
 if(o.applied!==0&&o.applied!==1)throw Error('Invalid applied delta.');if(typeof o.undoable!=='boolean')throw Error('Invalid undoable flag.');
 const before=uint(o.beforeRevision,'before revision'),after=uint(o.afterRevision,'after revision');
 if(after<before)throw Error('Receipt revision went backwards.');
 if(rb.formula!==null&&typeof rb.formula!=='string')throw Error('Invalid readback formula.');
 return {sheet:uint(o.sheet,'sheet'),address:text(o.address,'address',16),beforeRevision:before,afterRevision:after,applied:o.applied,undoable:o.undoable,token:text(o.token,'token'),readback:{address:text(rb.address,'readback address',16),value:rb.value,formula:rb.formula as string|null}};
}
/** True for a proven non-mutation caused by a changed workbook or cell since review. */
export const isStaleError=(e:unknown)=>e instanceof Error&&e.message.startsWith('stale');
/** Strict validation of the owner receipt for one reviewed range edit or its exact undo. */
export function parseRangeReceipt(input:unknown):SheetsRangeReceipt{
 const o=obj(input,'range receipt');
 if(o.applied!==0&&o.applied!==1)throw Error('Invalid applied delta.');if(typeof o.undoable!=='boolean')throw Error('Invalid undoable flag.');
 const before=uint(o.beforeRevision,'before revision'),after=uint(o.afterRevision,'after revision');
 if(after<before)throw Error('Receipt revision went backwards.');
 const rows=uint(o.rows,'rows'),cols=uint(o.cols,'cols'),row=uint(o.row,'row'),col=uint(o.col,'col');
 if(rows<1||cols<1||rows*cols>1000)throw Error('Invalid range size.');
 if(!Array.isArray(o.readback)||o.readback.length!==rows*cols)throw Error('Invalid readback.');
 const readback=o.readback.map(c=>{const r=obj(c,'readback cell');if(r.formula!==null&&typeof r.formula!=='string')throw Error('Invalid readback formula.');return {address:text(r.address,'readback address',16),value:r.value,formula:r.formula as string|null};});
 return {sheet:uint(o.sheet,'sheet'),row,col,rows,cols,beforeRevision:before,afterRevision:after,applied:o.applied,undoable:o.undoable,token:text(o.token,'token'),readback};
}
