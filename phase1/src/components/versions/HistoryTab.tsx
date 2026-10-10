import {useEffect, useState, type ReactNode} from 'react';
import {History, ShieldCheck} from 'lucide-react';
import {ConfirmShell, FileCard} from '../ConfirmShell';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {HistoryController, type HistoryPage, type RestoreReview, type RestoreOutcome, type TimelineEntry} from '../../lib/git/history/history';
export interface HistoryTabProps {
 controller: HistoryController;
 /** Persisted safety copies; rendered under the timeline when a ref backend exists. `refreshKey` changes after a restore. */
 safetySlot?: (refreshKey: number) => ReactNode;
 /** Reconcile native held-recovery/editor state, or reload changed Git files after success. Must not discard buffers. */
 onRestored: (outcome: RestoreOutcome) => Promise<void>;
}
export function HistoryTab({controller, onRestored, safetySlot}: HistoryTabProps) {
 const [safetyKey, setSafetyKey] = useState(0);
 const {t, locale} = useT();
 const [page, setPage] = useState<HistoryPage | null>(null), [review, setReview] = useState<RestoreReview | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 useEffect(() => {let active = true; setPage(null); setReview(null); setError('');
  controller.load().then(p => {if (active) setPage(p);}).catch(e => {if (active) setError(String(e));});
  return () => {active = false;};
 }, [controller]);
 const title = (entry: TimelineEntry) => entry.kind === 'version' ? entry.version.subject : entry.recovery.record.path;
 const startReview = async (entry: TimelineEntry) => {setBusy(true); setError(''); setNotice(''); try {setReview(await controller.review(entry));} catch(e) {setError(String(e));} finally {setBusy(false);}};
 const restore = async () => {
  if (!review || busy) return;
  setBusy(true); setError('');
  try {
   const outcome = await controller.restore(review);
   // Close before editor reconciliation: a failed reload must never offer to repeat the committed restore.
   setReview(null); setNotice(t('versions.history.restored'));
   try {await onRestored(outcome);} catch(e) {setError(`${t('versions.history.reloadFailed')} ${String(e)}`);}
   setPage(await controller.load()); setSafetyKey(k => k + 1);
  } catch(e) {setReview(null); setError(String(e));} finally {setBusy(false);}
 };
 const loadMore = async () => {if (!page?.moreBefore || busy) return; setBusy(true);
  try {const next = await controller.load(page.moreBefore); setPage({...next, entries: [...new Map([...page.entries, ...next.entries].map(e => [e.id, e])).values()]});}
  catch(e) {setError(String(e));} finally {setBusy(false);}
 };
 return <section className="versions-history" aria-label={t('versions.history.title')} aria-busy={busy}>
  <header><History size={16} aria-hidden="true"/><h2>{t('versions.history.title')}</h2><Button size="compact" disabled={busy} onClick={async () => {setBusy(true); setError(''); try {setPage(await controller.load());} catch(e) {setError(String(e));} finally {setBusy(false);}}}>{t('versions.history.refresh')}</Button></header>
  <p className="history-hint">{t('versions.history.localOnly')}</p>
  {page && page.repo.kind !== 'ready' && <p role="status">{t('versions.history.gitUnavailable')} ({page.repo.kind}{page.repo.kind === 'blocked' ? `: ${page.repo.reason}` : ''})</p>}
  {page?.warnings.map((w,i) => <p role="alert" key={i}>{w}</p>)}
  {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  {!page && !error && <p role="status">{t('versions.history.loading')}</p>}
  {page?.entries.length === 0 && <p>{t('versions.history.empty')}</p>}
  <ol className="history-timeline">{page?.entries.map(entry => <li key={entry.id}>
   <span className="history-kind">{entry.kind === 'version' ? <History size={15} aria-hidden="true"/> : <ShieldCheck size={15} aria-hidden="true"/>}{t(`versions.history.${entry.kind === 'version' && entry.safety ? 'safety' : entry.kind}`)}</span>
   <strong title={title(entry)}>{title(entry)}</strong>
   <span>{entry.timeMs === null ? t('versions.history.undated') : new Intl.DateTimeFormat(locale, {dateStyle:'medium', timeStyle:'short'}).format(entry.timeMs)}</span>
   {entry.kind === 'version' && <span>{entry.version.authorName} · {entry.version.sha.slice(0,8)} · {t('versions.history.files', {count: entry.version.changedFiles})}</span>}
   <Button size="compact" variant="outline" disabled={busy} onClick={() => void startReview(entry)}>{t('versions.history.review')}</Button>
  </li>)}</ol>
  {page?.moreBefore && <Button disabled={busy} onClick={() => void loadMore()}>{t('versions.history.more')}</Button>}
  {safetySlot?.(safetyKey)}
  <ConfirmShell open={!!review} busy={busy} onCancel={() => setReview(null)} tone="warning" Icon={ShieldCheck} ariaLabel={t('versions.history.restoreTitle')} title={t('versions.history.restoreTitle')} description={review?.kind === 'version' ? t('versions.history.restoreGit') : t('versions.history.restoreRecovery')}
   body={review && <FileCard name={title(review.entry)} status={t('versions.history.neverDelete')}/>}
   footer={<><Button disabled={busy} onClick={() => setReview(null)}>{t('dialogs.cancel')}</Button><Button variant="primary" disabled={busy} onClick={() => void restore()}>{t('versions.history.confirm')}</Button></>}/>
 </section>;
}
