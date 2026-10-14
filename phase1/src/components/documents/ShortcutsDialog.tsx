import {SHORTCUTS,setShortcutsOpen,useShortcutsOpen} from '../../lib/documents/shortcuts';
import {useT} from '../../lib/useT';
import {NativeButton} from '../ui/native-controls';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink-2 hover:bg-hover';
/** All document keyboard shortcuts. On macOS, Cmd works wherever Ctrl is listed. */
export function ShortcutsDialog(){
 const {t}=useT();const open=useShortcutsOpen();
 if(!open)return null;
 return <div role="dialog" aria-modal="true" aria-labelledby="documents-shortcuts-title" className="fixed inset-0 z-20 grid place-items-center bg-black/30" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setShortcutsOpen(false);}}}>
  <div className="grid max-h-[80vh] w-[28rem] max-w-full gap-3 overflow-y-auto rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl" data-testid="documents-shortcuts-dialog">
   <h2 id="documents-shortcuts-title" className="text-sm font-medium">{t('documents.shortcuts.title')}</h2>
   <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
    {SHORTCUTS.map(([k,keys])=><div key={k+keys} className="contents"><dt className="text-ink-2">{t(k)}</dt><dd className="tabular-nums text-ink" data-testid="documents-shortcut-keys">{keys}</dd></div>)}
   </dl>
   <p className="text-xs text-ink-3">{t('documents.shortcuts.mac')}</p>
   <div className="flex justify-end"><NativeButton className={tool} autoFocus onClick={()=>setShortcutsOpen(false)} data-testid="documents-shortcuts-close">{t('documents.shortcuts.close')}</NativeButton></div>
  </div>
 </div>;
}
