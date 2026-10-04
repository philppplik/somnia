import {openExternal} from '../lib/openExternal';
import {useEffect,useState} from 'react';
import {autoCheck,autoCheckEnabled,type ReleaseInfo} from '../lib/updates';
/** Green status-bar pill shown when a newer GitHub release exists. Checks at start, every 30 minutes and when the window regains focus (can be turned off in Settings > About), no data about the user is sent. */
export function UpdatePill(){
 const [rel,setRel]=useState<ReleaseInfo|null>(null);
 useEffect(()=>{let live=true,last=0;
  const run=()=>{if(!autoCheckEnabled()||Date.now()-last<60_000)return;last=Date.now();void autoCheck(__APP_RELEASE__).then(r=>{if(live&&r)setRel(r);});};
  run();const timer=window.setInterval(run,30*60_000);const onFocus=()=>{if(Date.now()-last>10*60_000)run();};window.addEventListener('focus',onFocus);
  return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);};},[]);
 if(!rel)return null;
 const v=rel.tag.replace(/^v/,'');
 return <a href={rel.asset?.url??rel.url} onClick={e=>{e.preventDefault();void openExternal(rel.asset?.url??rel.url).catch(()=>{});}} data-testid="update-pill" aria-label={`New version ${v} available. Update now`} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[10px] font-medium text-white no-underline hover:bg-emerald-700">New version {v} - Update now</a>;}
