import {useT} from '../lib/useT';
import {displayValue,getSetting,type SettingEntry} from '../lib/settingsRegistry';
import type {UnifiedResult} from '../lib/settingsUnifiedSearch';
import {NativeButton} from './ui/native-controls';
/** Registry + command results above the section list while searching. Synonyms and @filters work here. */
export function SettingsSearchResults({results,state,onOpenSection,onReset,onCommandShortcut}:{results:readonly UnifiedResult[];state:Readonly<Record<string,any>>;onOpenSection(section:string):void;onReset(entries:readonly SettingEntry[]):void;onCommandShortcut(title:string):void}){
 const {t}=useT();
 if(!results.length)return null;
 const show=(v:unknown)=>typeof v==='boolean'?t(v?'settings.modified.on':'settings.modified.off'):displayValue(v);
 return <div className="settings-results" data-testid="settings-results" data-settings-results aria-label={t('settings.results.title')}>
  <ul>{results.map(r=>r.kind==='setting'
   ?<li key={r.entry.id} data-testid={`result-${r.entry.id}`} data-modified={r.modified}>
     <NativeButton type="button" className="settings-result-link" onClick={()=>onOpenSection(r.entry.section)}><strong>{t(r.entry.labelKey)}</strong><span className="settings-modified-path">{r.entry.section} · {show(getSetting(state,r.entry))}</span></NativeButton>
     {r.entry.scope==='project'&&<span className="settings-chip">{t('settings.modified.projectChip')}</span>}
     {r.modified&&<NativeButton type="button" onClick={()=>onReset([r.entry])}>{t('settings.modified.reset')}</NativeButton>}
    </li>
   :<li key={r.command.id} data-testid={`result-cmd-${r.command.id}`}>
     <NativeButton type="button" className="settings-result-link" onClick={()=>onCommandShortcut(r.command.title)}><strong>{r.command.title}</strong><span className="settings-modified-path">{t('settings.results.command')}{r.command.shortcut?` · ${r.command.shortcut}`:''}</span></NativeButton>
    </li>)}</ul>
 </div>;
}
