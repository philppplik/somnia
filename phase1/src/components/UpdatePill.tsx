import {useEffect,useState} from 'react';
import {checkForUpdate,autoCheckEnabled,type ReleaseInfo} from '../lib/updates';
/** Green status-bar pill shown when a newer GitHub release exists. One check on start (can be turned off in Settings > About), no data about the user is sent. */
export function UpdatePill(){
 const [rel,setRel]=useState<ReleaseInfo|null>(null);
 useEffect(()=>{if(!autoCheckEnabled())return;let live=true;checkForUpdate(__APP_RELEASE__).then(r=>{if(live&&r.status==='available')setRel(r.release);}).catch(()=>{/* offline or rate limited: stay quiet */});return()=>{live=false;};},[]);
 if(!rel)return null;
 const v=rel.tag.replace(/^v/,'');
 return <a href={rel.asset?.url??rel.url} target="_blank" rel="noreferrer" data-testid="update-pill" aria-label={`New version ${v} available. Update now`} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-[10px] font-medium text-white no-underline hover:bg-emerald-700">New version {v} - Update now</a>;}
