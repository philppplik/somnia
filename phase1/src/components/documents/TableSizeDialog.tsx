import {useState} from 'react';
import {MAX_NEW_TABLE_COLS,MAX_NEW_TABLE_ROWS} from '../../lib/documents/protocol';
import {insertTable} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='w-20 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums';
/** Whole number inside `1..max`, or null while the field is empty, fractional or out of range. */
export const parseSize=(v:string,max:number):number|null=>{if(!/^\d{1,3}$/.test(v))return null;const n=Number(v);return n>=1&&n<=max?n:null;};
/** Custom table size: rows and columns inside the engine's bounds. */
export function TableSizeDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const [rows,setRows]=useState('3'),[cols,setCols]=useState('3');
 const r=parseSize(rows,MAX_NEW_TABLE_ROWS),c=parseSize(cols,MAX_NEW_TABLE_COLS);
 const go=()=>{if(r===null||c===null)return;onClose();void insertTable(r,c);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-table-size-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'){e.preventDefault();go();}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-table-size-dialog">
   <h2 id="documents-table-size-title" className="text-sm font-medium">{t('documents.table.insert')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.table.rows',{max:MAX_NEW_TABLE_ROWS})}
    <NativeInput className={field} inputMode="numeric" autoFocus value={rows} aria-invalid={r===null} onChange={e=>setRows(e.currentTarget.value)} data-testid="documents-table-size-rows"/></label>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.table.cols',{max:MAX_NEW_TABLE_COLS})}
    <NativeInput className={field} inputMode="numeric" value={cols} aria-invalid={c===null} onChange={e=>setCols(e.currentTarget.value)} data-testid="documents-table-size-cols"/></label>
   <div className="flex justify-end gap-2">
    <NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={r===null||c===null} onClick={go} data-testid="documents-table-size-ok">{t('documents.table.insert')}</NativeButton>
   </div>
  </div>
 </div>;
}
