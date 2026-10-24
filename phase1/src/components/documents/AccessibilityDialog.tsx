import {useDocuments} from '../../lib/documents/store';
import {checkAccessibility} from '../../lib/documents/accessibility';
import {goToComment} from '../../lib/documents/session';
import {useT} from '../../lib/useT';
import {NativeButton} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Lists what makes the document hard to use with a screen reader (read only: nothing is changed). Each entry goes to its paragraph. */
export function AccessibilityDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const doc=useDocuments();const issues=checkAccessibility(doc.blocks,doc.words);
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-a11y-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid w-[28rem] max-w-full gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-a11y-dialog">
   <h2 id="documents-a11y-title" className="text-sm font-medium">{t('documents.a11y.title')}</h2>
   {issues.length===0?<p className="text-xs text-ink-3" data-testid="documents-a11y-none">{t('documents.a11y.none')}</p>
    :<ul className="grid max-h-64 gap-2 overflow-auto" data-testid="documents-a11y-list">{issues.map((i,n)=><li key={n} className="grid gap-1 rounded-sm border border-subtle p-2 text-xs" data-testid={'documents-a11y-'+i.kind}>
     <span className="break-words text-ink">{t('documents.a11y.'+i.kind,{level:i.level??0,from:i.from??0})}</span>{i.quote&&<span className="break-words italic text-ink-3">{i.quote}</span>}
     {i.block>=0&&<span className="flex"><NativeButton className={tool} onClick={()=>void goToComment(i.block)} data-testid="documents-a11y-goto">{t('documents.a11y.goTo')}</NativeButton></span>}</li>)}</ul>}
   <p className="text-xs text-ink-3">{t('documents.a11y.scope')}</p>
   <div className="flex justify-end"><NativeButton className={tool} onClick={onClose} data-testid="documents-a11y-close">{t('documents.a11y.close')}</NativeButton></div>
  </div></div>;
}
