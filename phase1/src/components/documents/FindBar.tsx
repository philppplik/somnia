import {useMemo,useRef,useState} from 'react';
import {MAX_FIND_QUERY,MAX_REPLACE_TEXT,validReplaceText} from '../../lib/documents/find';
import {documentStats,findStep,replaceAll,replaceCurrent,setFindOpen,setFindQuery} from '../../lib/documents/session';
import {caretPage,scrollToPage} from '../../lib/documents/navigate';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,NativeInput} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:text-ink disabled:cursor-default disabled:opacity-50';
const field='h-7 w-44 rounded-sm border border-subtle bg-surface px-2 text-xs text-ink';
/** Find and replace bar: Enter finds the next match, Shift+Enter the previous one, Escape closes. */
export function FindBar(){
 const {t}=useT();const doc=useDocuments();const f=doc.find;const [rep,setRep]=useState('');const [done,setDone]=useState<number|null>(null);const input=useRef<HTMLInputElement>(null);
 if(!f.open)return null;
 const repOk=validReplaceText(rep);const has=f.count>0;
 const step=(dir:1|-1)=>{setDone(null);void findStep(dir).then(ok=>{if(ok){const p=caretPage();if(p!==null)scrollToPage(p);}});};
 return <div role="search" aria-label={t('documents.find.label')} className="media-bar flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-1" data-testid="documents-find-bar" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setFindOpen(false);}}}>
  <NativeInput ref={input} autoFocus className={field} maxLength={MAX_FIND_QUERY} value={f.query} aria-label={t('documents.find.query')} placeholder={t('documents.find.query')} onChange={e=>{setDone(null);setFindQuery({query:e.currentTarget.value});}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1);}}} data-testid="documents-find-query"/>
  <span className="min-w-16 text-xs tabular-nums text-ink-3" role="status" data-testid="documents-find-count">{f.query===''?'':f.count===0?t('documents.find.none'):t('documents.find.count',{current:f.current,total:f.capped?f.count+'+':f.count})}</span>
  <NativeButton className={tool} disabled={!has} aria-label={t('documents.find.prev')} title={t('documents.find.prev')} onClick={()=>step(-1)} data-testid="documents-find-prev">{'\u2191'}</NativeButton>
  <NativeButton className={tool} disabled={!has} aria-label={t('documents.find.next')} title={t('documents.find.next')} onClick={()=>step(1)} data-testid="documents-find-next">{'\u2193'}</NativeButton>
  <NativeButton className={tool} aria-pressed={f.matchCase} onClick={()=>setFindQuery({matchCase:!f.matchCase})} data-testid="documents-find-case">{t('documents.find.matchCase')}</NativeButton>
  <NativeButton className={tool} aria-pressed={f.wholeWord} onClick={()=>setFindQuery({wholeWord:!f.wholeWord})} data-testid="documents-find-word">{t('documents.find.wholeWord')}</NativeButton>
  <NativeInput className={field} maxLength={MAX_REPLACE_TEXT} value={rep} aria-label={t('documents.find.replaceWith')} placeholder={t('documents.find.replaceWith')} aria-invalid={!repOk} onChange={e=>{setDone(null);setRep(e.currentTarget.value);}} data-testid="documents-find-replacement"/>
  <NativeButton className={tool} disabled={!has||!repOk} onClick={()=>{setDone(null);void replaceCurrent(rep);}} data-testid="documents-find-replace">{t('documents.find.replace')}</NativeButton>
  <NativeButton className={tool} disabled={!has||!repOk} onClick={()=>void replaceAll(rep).then(setDone)} data-testid="documents-find-replace-all">{t('documents.find.replaceAll')}</NativeButton>
  {done!==null&&<span className="text-xs text-ink-3" role="status" data-testid="documents-find-done">{t('documents.find.replaced',{n:done})}</span>}
  <NativeButton className={tool} aria-label={t('documents.find.close')} title={t('documents.find.close')} onClick={()=>setFindOpen(false)} data-testid="documents-find-close">{'\u00d7'}</NativeButton>
 </div>;
}
/** Words and characters of the document, and the selected words while a selection exists. */
export function StatusBar(){
 const {t}=useT();const doc=useDocuments();
 const s=useMemo(()=>doc.status==='ready'?documentStats():null,[doc.rev,doc.caret,doc.status]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!s)return null;
 return <div role="status" className="flex items-center gap-3 border-t border-subtle px-3 py-1 text-xs text-ink-3 tabular-nums" data-testid="documents-status-bar">
  <span data-testid="documents-status-words">{t('documents.status.words',{n:s.words})}</span><span data-testid="documents-status-chars">{t('documents.status.chars',{n:s.chars})}</span>
  {s.selectionWords>0&&<span data-testid="documents-status-selection">{t('documents.status.selection',{n:s.selectionWords})}</span>}</div>;
}
