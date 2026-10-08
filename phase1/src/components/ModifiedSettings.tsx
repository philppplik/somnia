import {useRef,useState} from 'react';
import {useT} from '../lib/useT';
import {exportSettings,importPatch,parseSettingsImport} from '../lib/settingsExport';
import {displayValue,getSetting,modifiedSettings,type SettingEntry,type StateLike} from '../lib/settingsRegistry';
/** "Modified" view: every setting that differs from its default, with Default -> Current and single / all reset. */
export function ModifiedSettings({state,onReset,onOpenSection,onImport}:{state:StateLike;onReset(entries:readonly SettingEntry[]):void;onOpenSection(section:string):void;onImport(patch:Record<string,unknown>):void}){
 const {t}=useT();const rows=modifiedSettings(state);const file=useRef<HTMLInputElement>(null);const [note,setNote]=useState('');
 const doExport=()=>{const url=URL.createObjectURL(new Blob([exportSettings(state)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='somnia-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const doImport=async(f:File|undefined)=>{if(!f)return;const r=parseSettingsImport(await f.text());const n=Object.keys(r.accepted).length;if(!n){setNote(r.warnings[0]??t('settings.modified.importNone'));return;}onImport(importPatch(state,r.accepted));setNote(t('settings.modified.imported',{n})+(r.warnings.length?` ${t('settings.modified.importSkipped',{n:r.warnings.length})}`:''));};
 const tools=<div className="settings-modified-tools"><button type="button" data-testid="settings-export" disabled={!rows.length} onClick={doExport}>{t('settings.modified.export')}</button><button type="button" data-testid="settings-import" onClick={()=>file.current?.click()}>{t('settings.modified.import')}</button><input ref={file} type="file" accept=".json,application/json" hidden data-testid="settings-import-file" onChange={e=>{void doImport(e.target.files?.[0]);e.target.value='';}}/>{note&&<span role="status" className="settings-modified-note">{note}</span>}</div>;
 const show=(v:unknown)=>typeof v==='boolean'?t(v?'settings.modified.on':'settings.modified.off'):displayValue(v);
 if(!rows.length)return <div><p className="settings-modified-empty">{t('settings.modified.none')}</p>{tools}</div>;
 return <div className="settings-modified" data-testid="settings-modified">
  <p>{t('settings.modified.hint')}</p>
  <ul>{rows.map(e=><li key={e.id} data-testid={`modified-${e.id}`}>
   <button type="button" className="settings-modified-link" onClick={()=>onOpenSection(e.section)}><strong>{t(e.labelKey)}</strong><span className="settings-modified-path">{e.section}</span></button>
   <span className="settings-modified-values">{t('settings.modified.defaultLabel')}: {show(e.default)} → {show(getSetting(state,e))}</span>
   {e.scope==='project'&&<span className="settings-chip" title={t('settings.modified.projectHint')}>{t('settings.modified.projectChip')}</span>}
   <button type="button" onClick={()=>onReset([e])}>{t('settings.modified.reset')}</button>
  </li>)}</ul>
  {tools}
  <button type="button" data-testid="settings-reset-all" onClick={()=>onReset(rows)}>{t('settings.modified.resetAll')} ({rows.length})</button>
 </div>;
}
