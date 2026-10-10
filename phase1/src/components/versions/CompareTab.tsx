import {useEffect,useState} from 'react';
import type {GitBackend,GitChange} from '../../lib/git/types';
import {VisualDiff,loadGitComparison,type VisualComparison} from '../../lib/visualDiff';
import {useGitInvalidation} from './useGitInvalidation';
import {useT} from '../../lib/useT';
import type {GitRefsBackend} from '../../lib/git/refs/contract';
import {RefCompare} from './RefCompare';
/** Read-only comparison of a changed file: last saved version vs. what is on disk now. */
export function CompareTab({backend,refs}:{backend:GitBackend;refs?:GitRefsBackend}){
 const {t}=useT();const revision=useGitInvalidation();const [mode,setMode]=useState<'file'|'versions'>('file');const [changes,setChanges]=useState<GitChange[]|null>(null),[path,setPath]=useState(''),[cmp,setCmp]=useState<VisualComparison|null>(null),[error,setError]=useState('');
 useEffect(()=>{let on=true;backend.status().then(s=>{if(on){setError('');setChanges(s.changes);setPath(p=>s.changes.some(c=>c.path===p)?p:'');}}).catch(()=>{if(on){setChanges([]);setError(t('versions.compare.error'));}});return()=>{on=false;};},[backend,revision]);
 useEffect(()=>{if(!path){setCmp(null);return;}let on=true;setError('');setCmp(null);loadGitComparison(backend,path,'head','worktree').then(c=>{if(on)setCmp(c);}).catch(()=>{if(on){setCmp(null);setError(t('versions.compare.error'));}});return()=>{on=false;};},[backend,path,revision]);
 const modes=refs?<div role="group" aria-label={t('versions.compareRefs.mode')} className="flex gap-1 px-3 pt-3">{(['file','versions'] as const).map(m=><button type="button" key={m} aria-pressed={mode===m} data-testid={`compare-mode-${m}`} onClick={()=>setMode(m)} className="h-7 cursor-pointer rounded-sm border border-subtle bg-elevated px-2 text-[11px] text-ink-2 aria-pressed:bg-accent-soft aria-pressed:text-accent">{t(`versions.compareRefs.mode.${m}`)}</button>)}</div>:null;
 if(refs&&mode==='versions')return <>{modes}<div className="p-3 text-xs"><RefCompare backend={backend} refs={refs}/></div></>;
 if(changes===null)return <>{modes}<p className="p-4 text-xs text-ink-3" role="status">{t('versions.loading')}</p></>;
 if(!changes.length&&!error)return <>{modes}<p className="p-4 text-xs text-ink-3" data-testid="compare-none">{t('versions.changes.none')}</p></>;
 return <>{modes}<div className="flex flex-col gap-2 p-3 text-xs" data-testid="versions-compare">
  <label className="flex flex-col gap-1 text-[11px] text-ink-2">{t('versions.compare.pick')}
   <select className="h-8 rounded-sm border border-subtle bg-elevated px-2 text-xs text-ink" value={path} onChange={e=>setPath(e.target.value)}><option value="">-</option>{changes.map(c=><option key={c.path} value={c.path}>{c.path}</option>)}</select></label>
  {error&&<p role="alert" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{error}</p>}
  {cmp&&<VisualDiff comparison={cmp}/>}</div></>;}
