import {useCallback, useMemo, useState} from 'react';
import {Copy, FileText} from 'lucide-react';
import type {GitBackend} from '../../lib/git/types';
import type {GitDiffRefsResult, GitRefsBackend} from '../../lib/git/refs/contract';
import {validateDiffRefs} from '../../lib/git/refs/contract';
import {changelogMarkdown, explain} from '../../lib/git/refs/explain';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {VersionPicker} from './VersionPicker';
/** "What changed?" between any two versions. Local and deterministic: path counts and the bounded patch from git_diff_refs. */
export function ExplainTab({backend, refs}: {backend: GitBackend; refs: GitRefsBackend}) {
 const {t} = useT();
 const [range, setRange] = useState<[string, string]>(['', '']), [result, setResult] = useState<GitDiffRefsResult | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);
 const onRange = useCallback((a: string, b: string) => {setRange([a, b]); setResult(null); setCopied(false);}, []);
 const run = async () => {
  if (!range[0] || !range[1] || range[0] === range[1]) {setError(t('versions.explain.pick')); return;}
  setBusy(true); setError(''); setCopied(false);
  try {const req = {from: range[0], to: range[1]}; setResult(validateDiffRefs(await refs.diffRefs(req), req));} catch {setResult(null); setError(t('versions.explain.error'));} finally {setBusy(false);}
 };
 const ex = useMemo(() => result ? explain(result, t) : null, [result, t]);
 const copy = async () => {if (!result) return; try {await navigator.clipboard.writeText(changelogMarkdown(result, t)); setCopied(true);} catch {setError(t('versions.explain.copyFailed'));}};
 return <div className="flex flex-col gap-3 p-3 text-xs" data-testid="versions-explain" aria-busy={busy}>
  <h2 className="m-0 text-xs font-semibold text-ink">{t('versions.explain.title')}</h2>
  <VersionPicker backend={backend} onChange={onRange} disabled={busy}/>
  <div className="flex flex-wrap gap-2"><Button size="compact" variant="primary" disabled={busy || !range[0]} onClick={() => void run()} data-testid="explain-run">{t('versions.explain.run')}</Button>
   {result && !ex?.empty && <Button size="compact" onClick={() => void copy()} data-testid="explain-copy"><Copy size={12} aria-hidden="true"/> {copied ? t('versions.explain.copied') : t('versions.explain.copy')}</Button>}</div>
  {busy && <p role="status" className="text-ink-3">{t('versions.loading')}</p>}
  {error && <p role="alert" className="rounded-sm border border-subtle p-2 text-[11px] text-ink">{error}</p>}
  {result && ex && <section aria-label={t('versions.explain.title')} className="flex min-w-0 flex-col gap-2" data-testid="explain-result">
   <p className="m-0 text-[12px] font-medium text-ink" role="status">{ex.headline}</p>
   {ex.lines.length > 0 && <ul className="m-0 list-disc pl-4 text-ink-2">{ex.lines.map(l => <li key={l}>{l}</li>)}</ul>}
   <ul className="m-0 flex list-none flex-col gap-2 p-0">{result.files.map(f => <li key={`${f.kind}:${f.path}`} className="min-w-0 rounded-md border border-subtle p-2">
    <div className="flex items-start gap-2"><FileText size={13} className="mt-0.5 shrink-0" aria-hidden="true"/><span className="min-w-0 break-all font-medium text-ink">{f.path}</span><span className="ml-auto shrink-0 text-ink-3">{t(`versions.explain.file.${f.kind}`)}</span></div>
    {f.oldPath && <p className="m-0 mt-1 break-all text-ink-3">{t('versions.explain.renamedFrom', {path: f.oldPath})}</p>}
    {f.binary ? <p className="m-0 mt-1 text-ink-3">{t('versions.explain.binaryFile')}</p> : f.patch ? <details className="mt-1"><summary className="cursor-pointer text-ink-2">{t('versions.explain.showPatch')}</summary>
     <pre className="m-0 mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-elevated p-2 text-[11px] text-ink">{f.patch}</pre>{f.patchTruncated && <p className="m-0 mt-1 text-ink-3">{t('versions.explain.patchCut')}</p>}</details> : null}
   </li>)}</ul>
   <p className="m-0 text-[11px] text-ink-3">{t('versions.explain.localNote')}</p>
  </section>}
 </div>;
}
