import {useEffect,useState} from 'react';
import {setCommentsOpen,useCommentsOpen} from '../../lib/documents/comments';
import {commentProblem,MAX_COMMENT_CHARS,type CommentItem} from '../../lib/documents/protocol';
import {addComment,commentSelection,deleteComment,readComments,resolveComment} from '../../lib/documents/session';
import {useDocuments} from '../../lib/documents/store';
import {useT} from '../../lib/useT';
import {NativeButton,Textarea} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const when=(iso:string)=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString();};
/** Comments list with add on the selection, resolve or reopen, and delete. Each change is one undo step. */
export function CommentsPanel(){
 const {t}=useT();const doc=useDocuments();const open=useCommentsOpen();const [items,setItems]=useState<CommentItem[]>([]);const [text,setText]=useState('');
 useEffect(()=>{if(!open||doc.status!=='ready')return;let live=true;void readComments().then(l=>{if(live&&l)setItems(l);}).catch(()=>undefined);return()=>{live=false;};},[open,doc.rev,doc.status]);
 if(!open||doc.status!=='ready')return null;
 const sel=commentSelection();const okText=commentProblem(text)===null;
 const add=()=>{if(!sel||!okText)return;const v=text;setText('');void addComment(v);};
 return <section role="region" aria-label={t('documents.comments.title')} className="media-bar grid max-h-64 gap-2 overflow-y-auto border-b border-subtle px-3 py-2" data-testid="documents-comments-panel" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setCommentsOpen(false);}}}>
  <div className="flex items-center gap-2"><span className="text-xs font-medium text-ink">{t('documents.comments.title')}</span><span className="text-xs tabular-nums text-ink-3" data-testid="documents-comments-count">{t('documents.comments.count',{n:items.length})}</span>
   <NativeButton className={tool+' ml-auto'} aria-label={t('documents.comments.close')} title={t('documents.comments.close')} onClick={()=>setCommentsOpen(false)} data-testid="documents-comments-close">{'\u00d7'}</NativeButton></div>
  <div className="flex items-start gap-2">
   <Textarea className="min-h-8 flex-1 rounded-sm border border-subtle bg-surface px-2 py-1 text-xs text-ink" rows={2} maxLength={MAX_COMMENT_CHARS} value={text} placeholder={t('documents.comments.placeholder')} aria-label={t('documents.comments.placeholder')} onChange={e=>setText(e.currentTarget.value)} data-testid="documents-comments-input"/>
   <NativeButton className={tool} disabled={!sel||!okText} onClick={add} data-testid="documents-comments-add">{t('documents.comments.add')}</NativeButton></div>
  <p className="text-xs text-ink-3" data-testid="documents-comments-hint">{sel?t('documents.comments.note'):t('documents.comments.needSelection')}</p>
  {items.length===0?<p className="text-xs text-ink-3" data-testid="documents-comments-empty">{t('documents.comments.empty')}</p>
   :<ul className="grid gap-2" data-testid="documents-comments-list">{items.map(c=><li key={c.id} className={'grid gap-1 rounded-sm border border-subtle p-2 text-xs'+(c.parent!==null?' ml-4':'')} data-testid="documents-comment">
    <div className="flex flex-wrap items-center gap-2 text-ink-3"><span className="text-ink">{c.author||'?'}</span><span>{when(c.date)}</span>{c.resolved&&<span data-testid="documents-comment-resolved">{t('documents.comments.resolved')}</span>}</div>
    {c.quote&&<p className="break-words italic text-ink-3">{c.quote}</p>}
    <p className="whitespace-pre-wrap break-words text-ink">{c.text}</p>
    <div className="flex gap-2"><NativeButton className={tool} onClick={()=>void resolveComment(c.id,!c.resolved)} data-testid="documents-comment-resolve">{c.resolved?t('documents.comments.reopen'):t('documents.comments.resolve')}</NativeButton>
     <NativeButton className={tool} onClick={()=>void deleteComment(c.id)} data-testid="documents-comment-delete">{t('documents.comments.delete')}</NativeButton></div></li>)}</ul>}
 </section>;
}
