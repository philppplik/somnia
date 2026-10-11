import type { CrashMeta } from '../../lib/diagnostics/uiTypes';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
import { RecoveryEvidencePanel } from './RecoveryEvidencePanel';
export function IncidentDetail({ incident }: { incident: CrashMeta }) {
 const { t } = useDiagnosticText();
 return <article className="diag-incident-detail">
  <h3>{t(incident.kind === 'native-panic' ? 'diag.nativePanic' : incident.kind === 'frontend-fatal' ? 'diag.frontendFatal' : 'err.app.010.title')}</h3>
  {incident.kind === 'unclean-exit' && <p>{t('diag.unclean')}</p>}
  <p data-copyable><code>{incident.errorId}</code><br/><code>{incident.incidentId}</code></p>
  <pre data-copyable>{JSON.stringify(incident.build, null, 2)}</pre>
  <RecoveryEvidencePanel evidence={incident.recovery}/>
  <ul>{incident.artifacts.map((a, index) => <li key={index}>{t(a.available ? 'diag.artifactAvailable' : 'diag.artifactMissing', { kind: a.kind, bytes: a.bytes })}</li>)}</ul>
 </article>;
}
