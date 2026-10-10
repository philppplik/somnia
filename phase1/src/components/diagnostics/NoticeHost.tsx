import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pauseIntake, whenInitialReviewDecided } from '../../lib/diagnostics/intakeGate';
import { noticeStore } from '../../lib/diagnostics/noticeStore';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
import { openDiagnostics } from '../../lib/diagnostics/hostStore';
import { NoticeDetailsDialog } from './NoticeDetailsDialog';
import '../../styles/diagnostics.css';
/** Shell-owned slot. Do not place inside a studio save-status text slot. */
export function NoticeHost({ whenDestructiveApprovalIdle }: { whenDestructiveApprovalIdle: () => Promise<void> }) {
 const { t } = useDiagnosticText(); const all = useSyncExternalStore(noticeStore.subscribe, noticeStore.getSnapshot);
 const [selected, select] = useState<string>(); const [history, showHistory] = useState(false);
 const pending = all.filter(n => !n.acknowledged);
 const current = pending.find(n => n.kind === 'error' && n.failure.fatal) ?? pending.find(n => n.kind === 'error' && n.failure.level === 'error') ?? pending.find(n => n.kind === 'error') ?? pending[0];
 const release = useRef<(() => void) | undefined>(undefined);
 const generation = useRef(0);
 const close = () => { generation.current++; select(undefined); release.current?.(); release.current = undefined; };
 useEffect(() => close, []);
 const showDetails = async (id: string) => { const mine = ++generation.current; release.current?.(); release.current = pauseIntake('diagnostics-modal'); try { await whenInitialReviewDecided(); await whenDestructiveApprovalIdle(); if (mine === generation.current) select(id); } catch { if (mine === generation.current) close(); } };
 const detail = all.find(n => n.noticeId === selected);
 if (!current && !noticeStore.getOverflow()) return null;
 const summary = (n: typeof all[number]) => n.kind === 'error' ? t(`${n.failure.userMessageKey}.title`) : (n.resetCount ?? 0) > 0 && (n.affectedItems ?? 0) > 0 ? t('err.app.012.title') : t('notice.operation', { opened: n.opened, rejected: n.rejected, failed: n.failed, deferred: n.deferred });
 const urgent = current?.kind === 'error' && (current.failure.fatal || current.failure.level === 'error');
 return <section className="diag-notice">
  <span role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'} aria-atomic="true">{current && <span key={current.noticeId}>{summary(current)}</span>}</span>
  {current && <button type="button" onClick={() => { void showDetails(current.noticeId); }}>{t('notice.details')}</button>}
  <button type="button" aria-expanded={history} onClick={() => showHistory(!history)}>{t('notice.more', { count: all.length })}</button>
  {noticeStore.getOverflow() > 0 && <button type="button" onClick={() => { void openDiagnostics(); }}>{t('notice.overflow', { count: noticeStore.getOverflow() })}</button>}
  {history && <ul className="diag-history" aria-label={t('notice.history')}>{all.map(n => <li key={n.noticeId}><button type="button" onClick={() => { void showDetails(n.noticeId); }}>{summary(n)}</button></li>)}</ul>}
  {detail && <NoticeDetailsDialog notice={detail} onClose={close}/>}
 </section>;
}
