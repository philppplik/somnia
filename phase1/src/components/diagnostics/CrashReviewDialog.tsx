import '../../styles/diagnostics.css';
import { useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { CrashReviewStore } from '../../lib/diagnostics/crashReviewStore';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
import { IncidentList } from './IncidentList';
import { IncidentDetail } from './IncidentDetail';
export function CrashReviewDialog({ store, onReport }: { store: CrashReviewStore; onReport: (id: string) => void }) {
 const { t } = useDiagnosticText();
 const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
 const [selected, setSelected] = useState<string>();
 const incident = state.incidents.find(i => i.incidentId === selected) ?? state.incidents[0];
 return <Dialog open={state.open} onOpenChange={open => { if (!open) store.later(); }}><DialogContent className="diag-popup" aria-busy={state.busy}>
  <header><DialogTitle>{t('diag.previous')}</DialogTitle><DialogDescription>{t('diag.retention')}</DialogDescription></header>
  <div className="diag-body">{state.feedback && <p role="status">{t(state.feedback)}</p>}<div className="diag-split"><IncidentList incidents={state.incidents} selected={incident?.incidentId} onSelect={setSelected}/>{incident && <IncidentDetail incident={incident}/>}</div></div>
  <footer className="diag-footer"><button type="button" onClick={() => store.later()}>{t('diag.later')}</button>{incident && <button type="button" onClick={() => onReport(incident.incidentId)}>{t('diag.review')}</button>}<button type="button" disabled={state.busy} onClick={() => { void store.review(state.incidents.map(i => i.incidentId)); }}>{t('diag.continue')}</button></footer>
 </DialogContent></Dialog>;
}
