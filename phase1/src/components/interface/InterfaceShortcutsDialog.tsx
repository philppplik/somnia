import {useEffect,useRef} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {isMac} from '../../lib/commands';
import {INTERFACE_SHORTCUT_ENTRIES,formatInterfaceShortcut} from '../../lib/interface/shortcuts';
/** Modal cheatsheet of the Interface canvas keyboard surface. Closes on Esc, backdrop click or the close button and restores focus to the invoker. */
export function InterfaceShortcutsDialog({onClose}:{onClose:()=>void}){
 const {t}=useT();const panel=useRef<HTMLDivElement>(null);const restore=useRef<Element|null>(null);
 useEffect(()=>{restore.current=document.activeElement;panel.current?.focus();const handler=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}};document.addEventListener('keydown',handler,true);return()=>{document.removeEventListener('keydown',handler,true);(restore.current as HTMLElement|null)?.focus?.();};},[onClose]);
 const mac=isMac();
 return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40" onClick={onClose}>
  <div ref={panel} role="dialog" aria-modal="true" aria-label={t('interface.shortcuts')} tabIndex={-1} className="panel flex max-h-[80vh] w-full max-w-md flex-col gap-2 overflow-auto p-4 outline-none" onClick={e=>e.stopPropagation()}>
   <h2 className="text-sm font-semibold">{t('interface.shortcuts')}</h2>
   <ul className="flex flex-col gap-1 text-xs">{INTERFACE_SHORTCUT_ENTRIES.map(entry=><li key={entry.combo} className="flex items-center justify-between gap-3"><span>{t(entry.labelKey)}</span><kbd className="shrink-0 rounded bg-panel px-1.5 py-0.5 font-mono">{formatInterfaceShortcut(entry.combo,mac)}</kbd></li>)}</ul>
   <Button size="compact" variant="outline" className="self-end" onClick={onClose}>{t('interface.shortcutsClose')}</Button>
  </div>
 </div>;
}
