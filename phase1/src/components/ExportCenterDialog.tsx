import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {NativeButton,NativeInput} from './ui/native-controls';
import {Bookmark,Download,Search,X} from 'lucide-react';
import {commandEnabled,executeCommand,formatShortcut,listCommands} from '../lib/commands';
import {exportGroups,filterExportGroups,recentGroup,recordRecent,runPreset,setExportCenterOpen,useExportCenterOpen,useRecentRevision,type ExportRow} from '../lib/exportCenter';
import {useT} from '../lib/useT';
import {useRef,useState,useSyncExternalStore,type KeyboardEvent,type RefObject} from 'react';
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

const rowClass="flex w-full items-center gap-2 rounded-[var(--r-control,8px)] px-2 py-1.5 text-left text-xs hover:bg-hover focus-visible:bg-hover disabled:opacity-50";

/** The grouped command list, exported for tests. Rows run the existing commands; the center adds no export logic of its own. */
export function ExportCenterPanel({onClose,inputRef}:{onClose:()=>void;inputRef?:RefObject<HTMLInputElement|null>}){
 const {t}=useT();useSyncExternalStore(subscribeCommands,commandRevision,commandRevision);useRecentRevision();
 const [query,setQuery]=useState('');
 const label=(id:string)=>t('exportCenter.preset.'+id);
 const all=listCommands();
 const studioGroups=exportGroups(all,commandEnabled);
 const recent=recentGroup(all,commandEnabled);
 const groups=filterExportGroups([...(recent?[recent]:[]),...studioGroups],query,label);
 const row=(r:ExportRow)=><NativeButton type="button" disabled={!r.enabled}
   data-testid={r.kind==='command'?'export-center-cmd-'+r.command.id:'export-center-preset-'+r.preset.id} data-export-row={r.kind}
   className={rowClass} onKeyDown={onKeys}
   onClick={()=>{if(r.kind==='command'){recordRecent('command',r.command.id);onClose();void executeCommand(r.command.id);}else{recordRecent('preset',r.preset.id);onClose();void runPreset(r.preset,executeCommand);}}}>
   {r.kind==='command'?<Download size={13} className="shrink-0 text-ink-3" aria-hidden="true"/>:<Bookmark size={13} className="shrink-0 text-ink-3" aria-hidden="true"/>}
   <span className="min-w-0 flex-1 truncate">{r.kind==='command'?r.command.title:label(r.preset.id)}</span>
   {r.kind==='command'&&r.command.shortcut&&<kbd className="shrink-0 text-xs text-ink-3">{formatShortcut(r.command.shortcut)}</kbd>}
  </NativeButton>;
 return <div className="max-h-[60vh] overflow-auto px-4 pb-4" data-testid="export-center">
  <div className="sticky top-0 flex items-center gap-2 bg-surface py-2">
   <Search size={13} className="shrink-0 text-ink-3" aria-hidden="true"/>
   <NativeInput type="search" ref={inputRef} data-testid="export-center-search" aria-label={t('exportCenter.search')} placeholder={t('exportCenter.search')}
    className="h-7 flex-1 text-xs"
    value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={onKeys}/>
  </div>
  {groups.length===0&&<p role="status" className="p-4 text-xs text-ink-3" data-testid="export-center-empty">{t(query.trim()?'exportCenter.noMatches':'exportCenter.empty')}</p>}
  {groups.map(g=><section key={g.studio} className="pt-3" data-testid={'export-center-group-'+g.studio}>
   <h3 className="truncate px-2 pb-1 text-xs font-medium uppercase tracking-[.1em] text-ink-3">{t('exportCenter.group.'+g.studio)}</h3>
   <ul className="grid gap-0.5">{g.rows.map((r,i)=><li key={(r.kind==='command'?r.command.id:r.preset.id)}>
    {g.studio!=='recent'&&r.kind==='preset'&&(i===0||g.rows[i-1].kind!=='preset')&&<h4 className="truncate px-2 pb-0.5 pt-1 text-xs text-ink-3" data-testid={'export-center-presets-'+g.studio}>{t('exportCenter.presets')}</h4>}
    {row(r)}
   </li>)}</ul>
  </section>)}
  <footer className="flex justify-between border-t border-subtle px-2 py-2 text-xs text-ink-2">
   <span>{t('exportCenter.hintNav')}</span><span>{t('exportCenter.hintRun')}</span>
  </footer>
 </div>;
}

/** Advanced export: every studio's export commands in one grouped dialog. */
export function ExportCenterDialog(){
 const {t}=useT();const open=useExportCenterOpen();
 const close=()=>setExportCenterOpen(false);const searchInputRef=useRef<HTMLInputElement>(null);
 return <Dialog open={open} onOpenChange={o=>{if(!o)close();}}><DialogContent className="export-popup" aria-label={t('exportCenter.aria')} initialFocus={searchInputRef}>
  <header className="export-head">
   <DialogTitle>{t('exportCenter.title')}</DialogTitle>
   <DialogDescription>{t('exportCenter.desc')}</DialogDescription>
   <NativeButton type="button" className="export-close" aria-label={t('set.close.aria')} title={t('set.close')} onClick={close}><X size={16}/></NativeButton>
  </header>
  {open&&<ExportCenterPanel onClose={close} inputRef={searchInputRef}/>}
 </DialogContent></Dialog>;
}
