import {typeText} from '../../lib/documents/session';
import {SYMBOL_GROUPS,SPECIAL_CHARS,dateText,timeText} from '../../lib/documents/symbols';
import {useT} from '../../lib/useT';
import {NativeButton} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
const cell='grid h-8 w-8 cursor-pointer place-items-center rounded-sm border border-subtle bg-transparent text-sm text-ink hover:bg-hover';
/** Insert special characters and today's date at the caret. Each click is one undo step. */
export function SymbolDialog({onClose}:{onClose:()=>void}){
 const {t,locale}=useT();
 const now=new Date();
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-symbol-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <div className="grid max-h-[90vh] w-[28rem] max-w-full gap-3 overflow-y-auto rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-symbol-dialog">
   <h2 id="documents-symbol-title" className="text-sm font-medium">{t('documents.symbol.title')}</h2>
   {SYMBOL_GROUPS.map(g=><div key={g.id} className="grid gap-1"><p className="text-xs text-ink-3">{t('documents.symbol.group.'+g.id)}</p>
    <div className="flex flex-wrap gap-1">{Array.from(g.chars).map(c=><NativeButton key={c} className={cell} aria-label={c} onClick={()=>{void typeText(c);}} data-testid="documents-symbol-char">{c}</NativeButton>)}</div></div>)}
   <div className="grid gap-1"><p className="text-xs text-ink-3">{t('documents.symbol.group.special')}</p>
    <div className="flex flex-wrap gap-2">{SPECIAL_CHARS.map(x=><NativeButton key={x.id} className={tool} onClick={()=>{void typeText(x.ch);}} data-testid={'documents-symbol-'+x.id}>{t('documents.symbol.special.'+x.id)}</NativeButton>)}</div></div>
   <div className="flex flex-wrap gap-2">
    <NativeButton className={tool} onClick={()=>{void typeText(timeText(now,false,locale));}} data-testid="documents-symbol-time">{timeText(now,false,locale)}</NativeButton>
    <NativeButton className={tool} onClick={()=>{void typeText(timeText(now,true,locale));}} data-testid="documents-symbol-datetime">{timeText(now,true,locale)}</NativeButton>
    <NativeButton className={tool} onClick={()=>{void typeText(dateText(now,'iso'));}} data-testid="documents-symbol-date-iso">{dateText(now,'iso')}</NativeButton>
    <NativeButton className={tool} onClick={()=>{void typeText(dateText(now,'long',locale));}} data-testid="documents-symbol-date-long">{dateText(now,'long',locale)}</NativeButton></div>
   <div className="flex justify-end"><NativeButton className={tool} onClick={onClose}>{t('documents.styles.close')}</NativeButton></div>
  </div></div>;
}
