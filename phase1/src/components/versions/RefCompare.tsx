import {useMemo, useState} from 'react';
import type {GitBackend} from '../../lib/git/types';
import type {GitRefsBackend} from '../../lib/git/refs/contract';
import {buildRefComparison, evidenceMatches, type RefComparisonBundle} from '../../lib/git/refs/snapshot';
import {VisualDiff} from '../../lib/visualDiff';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {VersionPicker} from './VersionPicker';
/** Compare two versions as full project snapshots, bound to content hashes (R2-C3). */
export function RefCompare({backend, refs}: {backend: GitBackend; refs: GitRefsBackend}) {
 const {t} = useT();
 const [range, setRange] = useState<[string, string]>(['', '']), [bundle, setBundle] = useState<RefComparisonBundle | null>(null), [path, setPath] = useState('');
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [stale, setStale] = useState(false);
 const run = async () => {
  setBusy(true); setError(''); setStale(false); setBundle(null);
  try {const b = await buildRefComparison(refs, range[0], range[1]); setBundle(b); setPath(b.comparisons[0]?.path ?? '');} catch {setError(t('versions.compareRefs.error'));} finally {setBusy(false);}
 };
 const recheck = async () => {if (bundle) setStale(!(await evidenceMatches(refs, bundle.evidence).catch(() => false)));};
 const cmp = useMemo(() => bundle?.comparisons.find(c => c.path === path) ?? null, [bundle, path]);
 const ev = bundle?.evidence;
 return <div className="flex flex-col gap-3" data-testid="versions-refcompare" aria-busy={busy}>
  <VersionPicker backend={backend} disabled={busy} onChange={(a, b) => {setRange([a, b]); setBundle(null);}}/>
  <div><Button size="compact" variant="primary" disabled={busy || !range[0] || range[0] === range[1]} onClick={() => void run()} data-testid="refcompare-run">{t('versions.compareRefs.run')}</Button></div>
  {busy && <p role="status" className="text-ink-3">{t('versions.loading')}</p>}
  {error && <p role="alert" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{error}</p>}
  {bundle && ev && <section className="flex min-w-0 flex-col gap-2" aria-label={t('versions.compareRefs.evidence')} data-testid="refcompare-evidence">
   <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-ink-2">
    <dt>{t('versions.compareRefs.before')}</dt><dd className="m-0 break-all font-mono text-ink" data-testid="hash-before">{ev.before.sha.slice(0, 8)} · {ev.before.contentHash.slice(0, 12)}</dd>
    <dt>{t('versions.compareRefs.after')}</dt><dd className="m-0 break-all font-mono text-ink" data-testid="hash-after">{ev.after.sha.slice(0, 8)} · {ev.after.contentHash.slice(0, 12)}</dd></dl>
   <p className="m-0 text-[11px] text-ink-2">{ev.complete ? t('versions.compareRefs.complete', {before: ev.before.fileCount, after: ev.after.fileCount}) : t('versions.compareRefs.partial')}</p>
   <ul className="m-0 list-disc pl-4 text-[11px] text-ink-3" aria-label={t('versions.compareRefs.limits')}>{ev.limitations.filter(l => l.key !== 'partial').map(l => <li key={l.key}>{t(`versions.compareRefs.limit.${l.key}`, {count: l.count ?? 0})}</li>)}</ul>
   <div className="flex items-center gap-2"><Button size="compact" onClick={() => void recheck()} data-testid="refcompare-recheck">{t('versions.compareRefs.recheck')}</Button></div>
   {stale && <p role="alert" className="m-0 rounded-sm border border-subtle p-2 text-[11px] text-ink" data-testid="refcompare-stale">{t('versions.compareRefs.stale')}</p>}
   {bundle.skipped.length > 0 && <p className="m-0 text-[11px] text-ink-3">{t('versions.compareRefs.skipped', {count: bundle.skipped.length})}</p>}
   {bundle.comparisons.length === 0 ? <p className="m-0 text-ink-3">{t('versions.compareRefs.noFiles')}</p> : <>
    <label className="flex flex-col gap-1 text-[11px] text-ink-2">{t('versions.compareRefs.file')}
     <select className="h-8 rounded-sm border border-subtle bg-elevated px-2 text-xs text-ink" value={path} onChange={e => setPath(e.target.value)}>{bundle.comparisons.map(c => <option key={c.path} value={c.path}>{c.path}</option>)}</select></label>
    {cmp && <VisualDiff comparison={cmp}/>}</>}
  </section>}
 </div>;
}
