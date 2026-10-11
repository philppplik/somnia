import type { CrashMeta } from '../../lib/diagnostics/uiTypes';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
export function IncidentList({ incidents, selected, onSelect }: { incidents: readonly CrashMeta[]; selected?: string; onSelect: (id: string) => void }) {
 const { t, locale } = useDiagnosticText();
 return <nav className="diag-incident-list" aria-label={t('diag.incidents')}>
  {!incidents.length && <p>{t('diag.empty')}</p>}
  {[...incidents].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).map(i => <button type="button" key={i.incidentId} aria-current={selected === i.incidentId ? 'true' : undefined} onClick={() => onSelect(i.incidentId)}>
   <strong>{t(i.kind === 'native-panic' ? 'diag.nativePanic' : i.kind === 'frontend-fatal' ? 'diag.frontendFatal' : 'err.app.010.title')}</strong>
   <time dateTime={i.occurredAt}>{new Date(i.occurredAt).toLocaleString(locale)}</time><span>{t(i.reviewedAt ? 'diag.reviewed' : 'diag.pending')}</span>
  </button>)}
 </nav>;
}
