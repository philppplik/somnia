import type { RecoveryEvidence } from '../../lib/diagnostics/uiTypes';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
/** Current drafts are deliberately outside incident-scoped recovery claims. No restore action without a producer capability. */
export function RecoveryEvidencePanel({ evidence = [] }: { evidence?: readonly RecoveryEvidence[] }) {
 const { t, locale } = useDiagnosticText();
 const scoped = evidence.filter(e => e.kind === 'incident-scoped' && e.snapshotCorrelated === true);
 return <section className="diag-recovery">
  {!scoped.length && <p>{t('recovery.unknown')}</p>}
  {scoped.map((e, index) => e.kind === 'incident-scoped' && <p key={index}>{t('recovery.scoped', { session: e.session, scope: e.scope, time: new Date(e.checkpointAt).toLocaleString(locale) })}</p>)}
  {evidence.filter(e => e.kind === 'draft-present').map((e, index) => e.kind === 'draft-present' && <section key={index}><h3>{t('recovery.current')}</h3><p>{t('recovery.drafts', { count: e.count, age: e.newestAgeSec })}</p></section>)}
 </section>;
}
