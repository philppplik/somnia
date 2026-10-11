import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { Notice } from '../../lib/diagnostics/uiTypes';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
import { canRetryNotice, retryBusy, retryNoticeItem, subscribeRetries } from '../../lib/diagnostics/retryActions';
import { openDiagnostics } from '../../lib/diagnostics/hostStore';
import { acknowledgeNotice } from '../../lib/diagnostics/noticePresenter';
export function NoticeDetailsDialog({ notice, onClose }: { notice: Notice; onClose: () => void }) {
 const { t } = useDiagnosticText(); const [, tick] = useState(0);
 useEffect(() => { const unsub = subscribeRetries(() => tick(n => n + 1)); const timer = setInterval(() => tick(n => n + 1), 1000); return () => { unsub(); clearInterval(timer); }; }, []);
 const [feedback, setFeedback] = useState(false);
 const failure = notice.kind === 'error' ? notice.failure : undefined;
 const title = notice.kind === 'error' ? t(`${notice.failure.userMessageKey}.title`) : t('notice.operation', { opened: notice.opened, rejected: notice.rejected, failed: notice.failed, deferred: notice.deferred });
 const impact = notice.kind === 'error' ? notice.impact : undefined;
 return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="diag-popup">
  <header><DialogTitle>{title}</DialogTitle><DialogDescription>{failure ? t(`${failure.userMessageKey}.hint`) : t('notice.details')}</DialogDescription></header>
  <div className="diag-body">
   {notice.kind === 'error' && <><p>{notice.display?.displayName}</p><p data-copyable><code>{failure!.id}</code><br/><code>{failure!.incidentId}</code></p>
    <p>{impact?.kind === 'unchanged' ? t('error.currentUnchanged') : impact?.kind === 'rollbackVerified' ? t('error.rollbackVerified') : impact?.kind === 'saveFailed' ? t('error.saveFailed') : impact?.kind === 'draftVerified' ? t('error.draftVerified', { time: impact.savedAt }) : impact?.kind === 'memoryOnly' ? t('error.memoryOnly') : t('recovery.unknown')}</p></>}
   {notice.kind === 'operation' && <ul>{notice.items.map(item => <li key={`${notice.corr}:${item.ordinal}`}>{item.displayName ?? t('notice.item', { ordinal: item.ordinal })}: {t(`notice.${item.status}`)}</li>)}</ul>}
   {feedback && <p role="status">{t('diag.failed')}</p>}
  </div>
  <footer className="diag-footer">
   {failure?.incidentId && <button type="button" onClick={() => { void navigator.clipboard.writeText(`${failure.id} ${failure.incidentId}`).catch(() => setFeedback(true)); }}>{t('diag.copyReference')}</button>}
   <button type="button" onClick={() => { acknowledgeNotice(notice.noticeId); onClose(); }}>{t('notice.ack')}</button>
   {failure?.incidentId && canRetryNotice(failure.incidentId) && <button type="button" disabled={retryBusy(failure.incidentId)} onClick={() => { void retryNoticeItem(failure.incidentId!).catch(() => setFeedback(true)); }}>{t('notice.retry')}</button>}
   <button type="button" onClick={() => { onClose(); void openDiagnostics({ tab: 'report', incidentId: failure?.incidentId }); }}>{t('diag.title')}</button>
   <button type="button" onClick={onClose}>{t('diag.close')}</button>
  </footer>
 </DialogContent></Dialog>;
}
