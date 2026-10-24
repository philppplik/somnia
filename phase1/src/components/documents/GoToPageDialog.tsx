import {useState} from 'react';
import {scrollToPage} from '../../lib/documents/navigate';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
import {dialogTrapKeyDown} from '../../lib/focusTrap';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** A whole page number 1..max, or null while the field is empty, fractional or out of range. */
export const parsePage=(v:string,max:number):number|null=>{if(!/^\d{1,6}$/.test(v))return null;const n=Number(v);return n>=1&&n<=max?n:null;};
/** Jump to a page by number (Ctrl+G). */
export function GoToPageDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();const [v,setV]=useState('');const n=parsePage(v,doc.pages);
 const go=()=>{if(n===null)return;scrollToPage(n-1);onClose();};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-goto-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'){e.preventDefault();go();dialogTrapKeyDown(e);}}}>
  <div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-goto-dialog">
   <h2 id="documents-goto-title" className="text-sm font-medium">{t('documents.goto.title')}</h2>
   <label className="grid gap-1 text-xs text-ink-2">{t('documents.goto.page',{max:doc.pages})}
    <NativeInput className="w-24 rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink tabular-nums" inputMode="numeric" autoFocus value={v} aria-invalid={v!==''&&n===null} onChange={e=>setV(e.currentTarget.value)} data-testid="documents-goto-input"/></label>
   <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.cancel')}</NativeButton>
    <NativeButton className={tool+' border border-subtle'} disabled={n===null} onClick={go} data-testid="documents-goto-ok">{t('documents.goto.go')}</NativeButton></div>
  </div>
 </div>;
}
