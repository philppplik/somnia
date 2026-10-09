import {useEffect,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {useT} from '../lib/useT';
import {clearMeta,nativeSyncHost,syncOnce} from '../lib/syncFolder';
import {listCommands,setShortcutOverride,shortcutOverrides} from '../lib/commands';
import type {StateLike} from '../lib/settingsRegistry';
/** Desktop only: pick a folder (Dropbox, iCloud, Syncthing...) that carries settings and shortcuts between machines. Newer version wins. */
export function SyncFolderPanel({state,onApply}:{state:StateLike;onApply(patch:Record<string,unknown>):void}){
 const {t}=useT();const native=isTauri();const [host]=useState(()=>nativeSyncHost((c,a)=>invoke(c,a)));
 const [name,setName]=useState<string|null>(null);const [note,setNote]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{if(native)host.status().then(setName).catch(()=>{});},[native,host]);
 if(!native)return null;
 const run=async()=>{setBusy(true);setNote('');try{
  const known=listCommands().map(c=>c.id);
  const r=await syncOnce(host,state,shortcutOverrides(),known);
  if(r.action==='apply'&&r.patch){onApply(r.patch);const want=r.shortcuts??{};for(const id of Object.keys(shortcutOverrides()))if(!(id in want))setShortcutOverride(id,null);for(const [id,s] of Object.entries(want))setShortcutOverride(id,s);}
  setNote(t(r.action==='write'?'settings.sync.wrote':r.action==='apply'?'settings.sync.applied':'settings.sync.same')+(r.both?' '+t('settings.sync.newerWon'):''));
 }catch{setNote(t('settings.sync.failed'));}finally{setBusy(false);}};
 const choose=async()=>{setBusy(true);try{const n=await host.choose();if(n){setName(n);clearMeta();setBusy(false);await run();return;}}catch{setNote(t('settings.sync.failed'));}setBusy(false);};
 const stop=async()=>{try{await host.clear();clearMeta();setName(null);setNote(t('settings.sync.stopped'));}catch{setNote(t('settings.sync.failed'));}};
 return <section className="settings-sync" data-testid="sync-folder">
  <h3>{t('settings.sync.title')}</h3><p>{t('settings.sync.hint')}</p>
  {name?<p data-testid="sync-folder-name">{t('settings.sync.folder')}: <strong>{name}</strong></p>:<p>{t('settings.sync.none')}</p>}
  <div className="settings-modified-tools">
   <button type="button" data-testid="sync-choose" disabled={busy} onClick={choose}>{t(name?'settings.sync.change':'settings.sync.choose')}</button>
   {name&&<button type="button" data-testid="sync-now" disabled={busy} onClick={run}>{t('settings.sync.now')}</button>}
   {name&&<button type="button" data-testid="sync-stop" disabled={busy} onClick={stop}>{t('settings.sync.stop')}</button>}
  </div>
  {note&&<p role="status" data-testid="sync-note">{note}</p>}
 </section>;
}
