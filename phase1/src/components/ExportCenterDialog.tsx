import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {NativeButton,NativeInput} from './ui/native-controls';
import {Bookmark,Download,Search,X} from 'lucide-react';
import {commandEnabled,executeCommand,formatShortcut,listCommands} from '../lib/commands';
import {exportGroups,filterExportGroups,runPreset,setExportCenterOpen,useExportCenterOpen} from '../lib/exportCenter';
import {useT} from '../lib/useT';
import {useState,useSyncExternalStore,type KeyboardEvent} from 'react';
import {commandRevision,subscribeCommands} from '../lib/commandRegistry';

const ROW='[data-export-row]';
/** Roving native focus over input + rows: ArrowDown/ArrowUp walk the list, Home/End jump, Enter activates the focused row (native button click). */
function onKeys(e:KeyboardEvent<HTMLElement>){
 if(e.key!=='ArrowDown'&&e.key!=='ArrowUp'&&e.key!=='Home'&&e.key!=='End')return;
 const root=(e.currentTarget as HTMLElement).closest('[data-testid="export-center"]');
 if(!root)return;
 const rows=[...root.querySelectorAll<HTMLElement>(ROW)].filter(r=>!r.hasAttribute('disabled'));
 const input=root.querySelector<HTMLElement>('[data-testid="export-center-search"]');
 const stops=[...(input?[input]:[]),...rows];
 const at=stops.indexOf(e.currentTarget as HTMLElement);
 if(at<0)return;
 e.preventDefault();
 const next=e.key==='Home'?0:e.key==='End'?stops.length-1:e.key==='ArrowDown'?Math.min(at+1,stops.length-1):Math.max(at-1,0);
 stops[next]?.focus();
}

/** The grouped command list, exported for tests. Rows run the existing commands; the center adds no export logic of its own. */
export function ExportCenterPanel({onClose}:{onClose:()=>void}){
 const {t}=useT();useSyncExternalStore(subscribeCommands,commandRevision,commandRevision);
 const [query,setQuery]=useState('');
 const groups=filterExportGroups(exportGroups(listCommands(),commandEnabled),query,id=>t('exportCenter.preset.'+id));
 const rowClass="flex w-full items-center gap-2 rounded-[var(--r-control,8px)] px-2 py-1.5 text-left text-xs hover:bg-hover focus-visible:bg-hover disabled:opacity-50 outline-none";
 return <div className="max-h-[60vh] overflow-auto px-4 pb-4" data-testid="export-center">
  <div className="sticky top-0 flex items-center gap-2 bg-surface py-2">
   <Search size={13} className="shrink-0 text-ink-3" aria-hidden="true"/>
   <NativeInput type="search" autoFocus data-testid="export-center-search" aria-label={t('exportCenter.search')} placeholder={t('exportCenter.search')}
    className="h-7 w-full rounded-[var(--r-control,8px)] border border-subtle bg-surface px-2 text-xs outline-none focus:border-accent"
    value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={onKeys}/>
  </div>
  {groups.length===0&&<p className="p-4 text-xs text-ink-3" data-testid="export-center-empty">{t(query.trim()?'exportCenter.noMatches':'exportCenter.empty')}</p>}
  {groups.map(g=><section key={g.studio} className="pt-3" data-testid={'export-center-group-'+g.studio}>
   <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-[.1em] text-ink-3">{t('exportCenter.group.'+g.studio)}</h3>
   {g.presets.length>0&&<><h4 className="px-2 pb-0.5 pt-1 text-xs text-ink-3" data-testid={'export-center-presets-'+g.studio}>{t('exportCenter.presets')}</h4>
   <ul className="grid gap-0.5">{g.presets.map(({preset,enabled})=><li key={preset.id}>
    <NativeButton type="button" disabled={!enabled} data-testid={'export-center-preset-'+preset.id} data-export-row="preset"
     className={rowClass} onKeyDown={onKeys}
     onClick={()=>{onClose();void runPreset(preset,executeCommand);}}>
     <Bookmark size={13} className="shrink-0 text-ink-3" aria-hidden="true"/>
     <span className="min-w-0 flex-1 truncate">{t('exportCenter.preset.'+preset.id)}</span>
    </NativeButton></li>)}</ul></>}
   <ul className="grid gap-0.5">{g.commands.map(c=>{const on=commandEnabled(c);return <li key={c.id}>
    <NativeButton type="button" disabled={!on} data-testid={'export-center-cmd-'+c.id} data-export-row="command"
     className={rowClass} onKeyDown={onKeys}
     onClick={()=>{onClose();void executeCommand(c.id);}}>
     <Download size={13} className="shrink-0 text-ink-3" aria-hidden="true"/>
     <span className="min-w-0 flex-1 truncate">{c.title}</span>
     {c.shortcut&&<kbd className="shrink-0 text-xs text-ink-3">{formatShortcut(c.shortcut)}</kbd>}
    </NativeButton></li>;})}</ul>
  </section>)}
 </div>;
}

/** Advanced export: every studio's export commands in one grouped dialog. */
export function ExportCenterDialog(){
 const {t}=useT();const open=useExportCenterOpen();
 const close=()=>setExportCenterOpen(false);
 return <Dialog open={open} onOpenChange={o=>{if(!o)close();}}><DialogContent className="export-popup" aria-label={t('exportCenter.aria')}>
  <header className="export-head">
   <DialogTitle>{t('exportCenter.title')}</DialogTitle>
   <DialogDescription>{t('exportCenter.desc')}</DialogDescription>
   <NativeButton type="button" className="export-close" aria-label={t('set.close.aria')} title={t('set.close')} onClick={close}><X size={16}/></NativeButton>
  </header>
  {open&&<ExportCenterPanel onClose={close}/>}
 </DialogContent></Dialog>;
}
