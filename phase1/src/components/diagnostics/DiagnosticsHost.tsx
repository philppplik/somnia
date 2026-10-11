import { useEffect, useSyncExternalStore } from 'react';
import type { DiagnosticsHostStore } from '../../lib/diagnostics/hostStore';
import type { DiagnosticsStore } from '../../lib/diagnostics/diagnosticsStore';
import type { CrashReviewStore } from '../../lib/diagnostics/crashReviewStore';
import { CrashReviewDialog } from './CrashReviewDialog';
import { DiagnosticsDialog } from './DiagnosticsDialog';
import '../../styles/diagnostics.css';
/** Mount outside studio error boundaries. start() must already have run before intake starts. */
export function DiagnosticsHost({ host, diagnostics, review, confirmDelete }: { host: DiagnosticsHostStore; diagnostics: DiagnosticsStore; review: CrashReviewStore; confirmDelete: () => Promise<boolean> }) {
 const intent = useSyncExternalStore(host.subscribe, host.getSnapshot);
 const state = useSyncExternalStore(review.subscribe, review.getSnapshot);
 useEffect(() => () => { host.close(); diagnostics.close(); review.dispose(); }, [host, diagnostics, review]);
 if (intent && !state.open) return <DiagnosticsDialog store={diagnostics} review={review} intent={intent} onClose={() => host.close()} confirmDelete={async () => { const previous = intent; host.close(); await new Promise(resolve => setTimeout(resolve, 0)); try { return await confirmDelete(); } finally { void host.open(previous); } }}/>;
 return <CrashReviewDialog store={review} onReport={id => { void host.open({ tab: 'report', incidentId: id }); review.later(); }}/>;
}
