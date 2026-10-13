import {useEffect, useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {ConfirmShell, FileCard} from '../ConfirmShell';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import type {GitSafetyEntry} from '../../lib/git/refs/contract';
import {SafetyController, SafetyError, type SafetyReview} from '../../lib/git/refs/safety';
import type {GitRestoreResult} from '../../lib/git/types';
export interface SafetyBrowserProps {controller: SafetyController; onRestored: (result: GitRestoreResult) => Promise<void>; refreshKey?: number}
/** Persisted refs/somnia/safety/* entries ("Safety copies"), listed again after every restart. */
export function SafetyBrowser({controller, onRestored, refreshKey = 0}: SafetyBrowserProps) {
 const {t, locale} = useT();
 const [list, setList] = useState<GitSafetyEntry[] | null>(null), [review, setReview] = useState<SafetyReview | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 const fail = (e: unknown) => setError(e instanceof SafetyError ? t(`versions.safety.err.${e.code}`) : t('versions.safety.error'));
 const load = () => controller.list().then(setList).catch(e => {setList([]); fail(e);});
 useEffect(() => {let on = true; setList(null); controller.list().then(l => {if (on) setList(l);}).catch(e => {if (on) {setList([]); fail(e);}}); return () => {on = false;};}, [controller, refreshKey]);
 const open = async (e: GitSafetyEntry) => {setBusy(true); setError(''); setNotice(''); try {setReview(await controller.review(e));} catch(err) {fail(err);} finally {setBusy(false);}};
 const confirm = async () => {
  if (!review || busy) return; setBusy(true); setError('');
  try {const r = await controller.restore(review); setReview(null); setNotice(t('versions.safety.restored'));
   try {await onRestored(r);} catch {setError(t('versions.history.reloadFailed'));}
   await load();
  } catch(err) {setReview(null); fail(err);} finally {setBusy(false);}
 };
 const opLabel = (e: GitSafetyEntry) => t(`versions.safety.op.${e.operation}`);
 return <section className="versions-safety" aria-label={t('versions.safety.title')} aria-busy={busy} data-testid="versions-safety">
  <header><ShieldCheck size={16} aria-hidden="true"/><h2>{t('versions.safety.title')}</h2></header>
  <p className="history-hint">{t('versions.safety.hint')}</p>
  {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  {list === null && <p role="status">{t('versions.loading')}</p>}
  {list?.length === 0 && !error && <p>{t('versions.safety.empty')}</p>}
  <ol className="history-timeline">{list?.map(e => <li key={e.ref}>
   <span className="history-kind"><ShieldCheck size={15} aria-hidden="true"/>{opLabel(e)}</span>
   <strong title={e.subject}>{e.subject}</strong>
   <span>{new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeStyle: 'short'}).format(e.time * 1000)} · {e.sha.slice(0, 8)} · {e.scope.length ? t('versions.safety.scope', {count: e.scope.length}) : t('versions.safety.scopeAll')}</span>
   <Button size="compact" variant="outline" disabled={busy} onClick={() => void open(e)}>{t('versions.safety.restore')}</Button>
  </li>)}</ol>
  <ConfirmShell open={!!review} busy={busy} onCancel={() => setReview(null)} tone="warning" Icon={ShieldCheck} ariaLabel={t('versions.safety.confirmTitle')} title={t('versions.safety.confirmTitle')} description={t('versions.safety.confirmBody')}
   body={review && <><FileCard name={review.entry.subject} status={review.changedFiles === null ? t('versions.safety.previewUnknown') : t('versions.safety.previewResult', {count: review.changedFiles})}/></>}
   footer={<><Button disabled={busy} onClick={() => setReview(null)}>{t('dialogs.cancel')}</Button><Button variant="primary" disabled={busy} onClick={() => void confirm()}>{t('versions.safety.confirm')}</Button></>}/>
 </section>;
}
