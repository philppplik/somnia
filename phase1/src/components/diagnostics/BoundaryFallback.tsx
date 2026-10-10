import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
import { openDiagnostics } from '../../lib/diagnostics/hostStore';
/** No reload/remount without an operation-owned safe executor. Integrator releases review on root fatal. */
export function BoundaryFallback() { const { t } = useDiagnosticText(); return <section className="diag-boundary" role="alert"><h2>{t('err.ui.001.title')}</h2><p>{t('error.memoryOnly')}</p><button type="button" onClick={() => { void openDiagnostics({ tab: 'report' }); }}>{t('diag.title')}</button></section>; }
