import {useCallback,useEffect,useRef,useState} from 'react';
import {bookmarkProblem,MAX_BOOKMARK_NAME,type BookmarkItem} from '../../lib/documents/protocol';
import {addBookmark,bookmarkSelection,deleteBookmark,goToComment,readBookmarks} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Lists the bookmarks, adds one at the selection or caret, goes to one, deletes one. Each change is one undo step. */
export function BookmarksDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();
 const [list,setList]=useState<BookmarkItem[]|null>(null);const [failed,setFailed]=useState(false);const [name,setName]=useState('');
 const live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const load=useCallback(async()=>{try{const r=await readBookmarks();if(live.current&&r){setList(r);setFailed(false);}}catch{if(live.current)setFailed(true);}},[]);
 useEffect(()=>{void load();},[load,doc.rev]);
 const sel=bookmarkSelection();const nameOk=bookmarkProblem(name)===null;const moves=list?.some(b=>b.name===name)??false;
 const add=async()=>{if(!sel||!nameOk)return;const v=name;setName('');await addBookmark(v);await load();};
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-bookmarks-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-[28rem] max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-bookmarks-dialog">
   <h2 id="documents-bookmarks-title" className="text-sm font-medium">{t('documents.bookmarks.title')}</h2>
   <div className="flex items-center gap-2">
    <NativeInput className="h-7 flex-1 rounded-sm border border-subtle bg-surface px-2 text-xs text-ink" maxLength={MAX_BOOKMARK_NAME} value={name} placeholder={t('documents.bookmarks.name')} aria-label={t('documents.bookmarks.name')} aria-invalid={name!==''&&!nameOk} onChange={e=>setName(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void add();}}} data-testid="documents-bookmarks-name"/>
    <NativeButton className={tool} disabled={!sel||!nameOk} onClick={()=>void add()} data-testid="documents-bookmarks-add">{moves?t('documents.bookmarks.move'):t('documents.bookmarks.add')}</NativeButton></div>
   <p className="text-xs text-ink-3" data-testid="documents-bookmarks-hint">{!sel?t('documents.bookmarks.needCaret'):name!==''&&!nameOk?t('documents.bookmarks.nameRule',{n:MAX_BOOKMARK_NAME}):t('documents.bookmarks.note')}</p>
   {failed?<p className="text-xs text-ink-3" role="alert">{t('documents.bookmarks.unavailable')}</p>:list===null?<p className="text-xs text-ink-3">{t('documents.bookmarks.loading')}</p>:list.length===0?<p className="text-xs text-ink-2" data-testid="documents-bookmarks-none">{t('documents.bookmarks.none')}</p>
    :<ul className="grid max-h-64 gap-2 overflow-auto" data-testid="documents-bookmarks-list">{list.map(b=><li key={b.name} className="grid gap-1 rounded-sm border border-subtle p-2 text-xs" data-testid="documents-bookmark">
     <span className="break-words text-ink">{b.name}</span>{b.quote&&<span className="break-words italic text-ink-3">{b.quote}</span>}
     <span className="flex flex-wrap gap-1">
      <NativeButton className={tool} onClick={()=>void goToComment(b.block)} data-testid="documents-bookmark-goto">{t('documents.bookmarks.goTo')}</NativeButton>
      <NativeButton className={tool} onClick={()=>void deleteBookmark(b.name).then(load)} data-testid="documents-bookmark-delete">{t('documents.bookmarks.delete')}</NativeButton></span></li>)}</ul>}
   <div className="flex justify-end"><NativeButton className={tool} onClick={onClose} data-testid="documents-bookmarks-close">{t('documents.bookmarks.close')}</NativeButton></div>
  </div></div>;
}
