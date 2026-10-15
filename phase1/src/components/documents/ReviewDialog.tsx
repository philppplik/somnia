import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReviewChange} from '../../lib/documents/protocol';
import {goToAdjacentChange,setViewMarks,goToChange,readReview,resolveAllChanges,resolveChange,setTrackChanges} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Lists the tracked changes (inserted and deleted text) and accepts or rejects them one by one or all at once. */
export function ReviewDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();
 const [list,setList]=useState<ReviewChange[]|null>(null);const [failed,setFailed]=useState(false);
 const live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const load=useCallback(async()=>{try{const r=await readReview();if(live.current){setList(r.changes);setFailed(false);}}catch{if(live.current)setFailed(true);}},[]);
 useEffect(()=>{void load();},[load,doc.rev]);
 const one=async(c:ReviewChange,accept:boolean)=>{await resolveChange(c,accept);await load();};
 const all=async(accept:boolean)=>{await resolveAllChanges(accept);await load();};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-review-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-[28rem] max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-review-dialog">
   <h2 id="documents-review-title" className="text-sm font-medium">{t('documents.review.title')}</h2>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={doc.trackChanges} onChange={e=>void setTrackChanges(e.currentTarget.checked)} data-testid="documents-review-track"/>{t('documents.review.track')}</label>
   <label className="flex items-center gap-2 text-xs text-ink-2"><NativeInput type="checkbox" checked={doc.showMarkup} onChange={e=>void setViewMarks(doc.showMarks,e.currentTarget.checked)} data-testid="documents-review-markup"/>{t('documents.view.markup')}</label>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.review.unavailable')}</p>:list===null?<p className="text-xs text-ink-3">{t('documents.review.loading')}</p>:list.length===0?<p className="text-xs text-ink-2" data-testid="documents-review-none">{t('documents.review.none')}</p>:<>
    <p className="text-xs text-ink-3" data-testid="documents-review-count">{t('documents.review.count',{n:list.length})}</p>
    <ul className="grid max-h-64 gap-2 overflow-auto" data-testid="documents-review-list">
     {list.map(c=><li key={c.id+':'+c.start} className="grid gap-1 rounded-sm border border-subtle p-2 text-xs">
      <span className="text-ink-3">{t(c.kind==='insert'?'documents.review.inserted':'documents.review.deleted',{author:c.author})}</span>
      <span className="break-words text-ink-2">{c.text}</span>
      <span className="flex flex-wrap gap-1">
       <NativeButton className={tool} onClick={()=>void goToChange(c)}>{t('documents.review.go')}</NativeButton>
       <NativeButton className={tool} onClick={()=>void one(c,true)} data-testid="documents-review-accept">{t('documents.review.accept')}</NativeButton>
       <NativeButton className={tool} onClick={()=>void one(c,false)} data-testid="documents-review-reject">{t('documents.review.reject')}</NativeButton>
      </span>
     </li>)}
    </ul>
    <span className="flex flex-wrap gap-1">
     <NativeButton className={tool} onClick={()=>void goToAdjacentChange(-1)} data-testid="documents-review-prev">{t('documents.review.previous')}</NativeButton>
     <NativeButton className={tool} onClick={()=>void goToAdjacentChange(1)} data-testid="documents-review-next">{t('documents.review.next')}</NativeButton>
     <NativeButton className={tool} onClick={()=>void all(true)} data-testid="documents-review-accept-all">{t('documents.review.acceptAll')}</NativeButton>
     <NativeButton className={tool} onClick={()=>void all(false)} data-testid="documents-review-reject-all">{t('documents.review.rejectAll')}</NativeButton>
    </span></>}
   <span className="flex justify-end"><NativeButton className={tool} onClick={onClose} data-testid="documents-review-close">{t('documents.review.close')}</NativeButton></span>
  </div></div>;
}
