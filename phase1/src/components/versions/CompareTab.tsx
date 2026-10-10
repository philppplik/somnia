import {useEffect,useState} from 'react';
import type {GitBackend,GitChange} from '../../lib/git/types';
import {VisualDiff,loadGitComparison,type VisualComparison} from '../../lib/visualDiff';
import {useGitInvalidation} from './useGitInvalidation';
import {useT} from '../../lib/useT';
/** Read-only comparison of a changed file: last saved version vs. what is on disk now. */
export function CompareTab({backend}:{backend:GitBackend}){
 const {t}=useT();const revision=useGitInvalidation();const [changes,setChanges]=useState<GitChange[]|null>(null),[path,setPath]=useState(''),[cmp,setCmp]=useState<VisualComparison|null>(null),[error,setError]=useState('');
 useEffect(()=>{let on=true;backend.status().then(s=>{if(on){setError('');setChanges(s.changes);setPath(p=>s.changes.some(c=>c.path===p)?p:'');}}).catch(()=>{if(on){setChanges([]);setError(t('versions.compare.error'));}});return()=>{on=false;};},[backend,revision]);
 useEffect(()=>{if(!path){setCmp(null);return;}let on=true;setError('');setCmp(null);loadGitComparison(backend,path,'head','worktree').then(c=>{if(on)setCmp(c);}).catch(()=>{if(on){setCmp(null);setError(t('versions.compare.error'));}});return()=>{on=false;};},[backend,path,revision]);
 if(changes===null)return <p className="p-4 text-xs text-ink-3" role="status">{t('versions.loading')}</p>;
 if(!changes.length&&!error)return <p className="p-4 text-xs text-ink-3" data-testid="compare-none">{t('versions.changes.none')}</p>;
 return <div className="flex flex-col gap-2 p-3 text-xs" data-testid="versions-compare">
  <label className="flex flex-col gap-1 text-[11px] text-ink-2">{t('versions.compare.pick')}
   <select className="h-8 rounded-sm border border-subtle bg-elevated px-2 text-xs text-ink" value={path} onChange={e=>setPath(e.target.value)}><option value="">-</option>{changes.map(c=><option key={c.path} value={c.path}>{c.path}</option>)}</select></label>
  {error&&<p role="alert" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{error}</p>}
  {cmp&&<VisualDiff comparison={cmp}/>}</div>;}
