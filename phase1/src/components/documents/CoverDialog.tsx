import {useState} from 'react';
import {coverProblem,MAX_COVER_CHARS} from '../../lib/documents/protocol';
import {savedAuthor} from '../../lib/documents/author';
import {insertCoverPage} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const field='rounded-lg border border-subtle bg-transparent px-2 py-1.5 text-ink';
const KEYS=['title','subtitle','author','date'] as const;
/** Cover page: title, subtitle, author and date go before the first paragraph, which starts page two. One undo step. */
export function CoverDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();
 const [o,setO]=useState({title:'',subtitle:'',author:savedAuthor(),date:new Date().toLocaleDateString(undefined,{dateStyle:'long'})});
 const bad=coverProblem(o);
 const apply=()=>{if(bad)return;onClose();void insertCoverPage(o);};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-cover-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Enter'){e.preventDefault();apply();}}}>
  <div className="grid w-96 max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-cover-dialog">
   <h2 id="documents-cover-title" className="text-sm font-medium">{t('documents.cover.title')}</h2>
   {KEYS.map(k=><label key={k} className="grid gap-1 text-xs text-ink-2">{t(k==='title'?'documents.cover.titleField':'documents.cover.'+k)}
    <NativeInput className={field} autoFocus={k==='title'} maxLength={MAX_COVER_CHARS} value={o[k]} onChange={e=>setO({...o,[k]:e.currentTarget.value})} data-testid={'documents-cover-'+k}/></label>)}
   <div className="flex justify-end gap-2"><NativeButton className={tool} onClick={onClose}>{t('documents.para.opt.cancel')}</NativeButton>
    <NativeButton className={tool} disabled={bad!==null} onClick={apply} data-testid="documents-cover-apply">{t('documents.cover.apply')}</NativeButton></div>
  </div></div>;
}
