import {openExternal} from '../lib/openExternal';
import {useEffect,useState} from 'react';
import {autoCheck,autoCheckEnabled,type ReleaseInfo} from '../lib/updates';
import {canSelfUpdate,installSignedUpdate,type UpdateProgress} from '../lib/selfUpdate';
import {useT} from '../lib/useT';
import {patchState,useAppStore} from '../store/appStore';
/** Green status-bar pill shown when a newer GitHub release exists. Checks at start, every 30 minutes and when the window regains focus (can be turned off in Settings > About), no data about the user is sent. */
export function UpdatePill(){
 const {t}=useT();const prefs=useAppStore().updatePrefs;
 const [rel,setRel]=useState<ReleaseInfo|null>(null);const [busy,setBusy]=useState<UpdateProgress|null>(null);
 useEffect(()=>{let live=true,last=0;
  const run=()=>{if(!autoCheckEnabled()||Date.now()-last<60_000)return;last=Date.now();void autoCheck(__APP_RELEASE__).then(r=>{if(live)setRel(r);});};
  run();const timer=window.setInterval(run,prefs.intervalMinutes*60_000);const onFocus=()=>{if(Date.now()-last>prefs.intervalMinutes*60_000)run();};window.addEventListener('focus',onFocus);
  return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);};},[prefs]);
 if(!rel)return null;
 const v=rel.tag.replace(/^v/,'');
 const label=busy?(busy.phase==='downloading'?(busy.percent!==null?t('update.downloadingPct',{percent:busy.percent}):t('update.downloading')):busy.phase==='checking'?t('update.checking'):busy.phase==='installing'?t('update.installing'):t('update.restarting')):t('update.available',{version:v});
 const go=async(e:React.MouseEvent)=>{e.preventDefault();if(busy)return;const page=rel.asset?.url??rel.url;
  if(!canSelfUpdate()||rel.prerelease){void openExternal(page).catch(()=>{});return;}
  try{const done=await installSignedUpdate(setBusy);if(!done){setBusy(null);patchState({notice:t('update.noSigned')});void openExternal(page).catch(()=>{});}}
  catch(err){setBusy(null);patchState({notice:t('update.failed',{error:err instanceof Error?err.message:String(err)})});void openExternal(page).catch(()=>{});}};
 return <a href={rel.asset?.url??rel.url} onClick={e=>void go(e)} data-testid="update-pill" aria-busy={!!busy} aria-label={busy?label:t('update.availableAria',{version:v})} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[10px] font-medium text-white no-underline hover:bg-emerald-700">{label}</a>;}
