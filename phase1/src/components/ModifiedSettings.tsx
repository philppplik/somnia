import {useT} from '../lib/useT';
import {displayValue,getSetting,modifiedSettings,type SettingEntry,type StateLike} from '../lib/settingsRegistry';
/** "Modified" view: every setting that differs from its default, with Default -> Current and single / all reset. */
export function ModifiedSettings({state,onReset,onOpenSection}:{state:StateLike;onReset(entries:readonly SettingEntry[]):void;onOpenSection(section:string):void}){
 const {t}=useT();const rows=modifiedSettings(state);
 const show=(v:unknown)=>typeof v==='boolean'?t(v?'settings.modified.on':'settings.modified.off'):displayValue(v);
 if(!rows.length)return <p role="status" className="settings-modified-empty">{t('settings.modified.none')}</p>;
 return <div className="settings-modified" data-testid="settings-modified">
  <p>{t('settings.modified.hint')}</p>
  <ul>{rows.map(e=><li key={e.id} data-testid={`modified-${e.id}`}>
   <button type="button" className="settings-modified-link" onClick={()=>onOpenSection(e.section)}><strong>{t(e.labelKey)}</strong><span className="settings-modified-path">{e.section}</span></button>
   <span className="settings-modified-values">{t('settings.modified.defaultLabel')}: {show(e.default)} → {show(getSetting(state,e))}</span>
   {e.scope==='project'&&<span className="settings-chip" title={t('settings.modified.projectHint')}>{t('settings.modified.projectChip')}</span>}
   <button type="button" onClick={()=>onReset([e])}>{t('settings.modified.reset')}</button>
  </li>)}</ul>
  <button type="button" data-testid="settings-reset-all" onClick={()=>onReset(rows)}>{t('settings.modified.resetAll')} ({rows.length})</button>
 </div>;
}
