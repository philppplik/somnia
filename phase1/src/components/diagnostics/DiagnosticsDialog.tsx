import '../../styles/diagnostics.css';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import type { DiagnosticsStore } from '../../lib/diagnostics/diagnosticsStore';
import type { CrashReviewStore } from '../../lib/diagnostics/crashReviewStore';
import type { DiagnosticsIntent } from '../../lib/diagnostics/uiTypes';
import { useDiagnosticText } from '../../lib/diagnostics/useDiagnosticText';
import { IncidentList } from './IncidentList';
import { IncidentDetail } from './IncidentDetail';
export function DiagnosticsDialog({ store, review, intent, onClose, confirmDelete }: { store: DiagnosticsStore; review: CrashReviewStore; intent: DiagnosticsIntent; onClose: () => void; confirmDelete: () => Promise<boolean> }) {
 const { t } = useDiagnosticText();
 const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
 const crashes = useSyncExternalStore(review.subscribe, review.getSnapshot);
 const [tab, setTab] = useState(intent.tab ?? 'report');
 const [selected, setSelected] = useState<string | undefined>(intent.incidentId);
 const [file, setFile] = useState(0);
 const [now, setNow] = useState(Date.now);
 useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
 useEffect(() => { void store.open(intent.incidentId ? [intent.incidentId] : []); void review.refresh(); return () => store.close(); }, [store, review, intent]);
 const busy = state.phase === 'collecting' || state.phase === 'saving' || state.phase === 'copying';
 const snapshot = state.snapshot;
 const expired = !snapshot || !Number.isFinite(Date.parse(snapshot.expiresAt)) || Date.parse(snapshot.expiresAt) <= now;
 const incident = crashes.incidents.find(i => i.incidentId === selected) ?? crashes.incidents[0];
 const close = () => { store.close(); onClose(); };
 return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="diag-popup" aria-busy={busy}>
  <header><DialogTitle>{t('diag.title')}</DialogTitle><DialogDescription>{t('diag.privacy')}</DialogDescription></header>
  <nav className="diag-tabs" aria-label={t('diag.title')}>{(['report', 'zip', 'incidents'] as const).map(value => <button type="button" key={value} aria-pressed={value === tab} onClick={() => setTab(value)}>{t(`diag.${value}`)}</button>)}</nav>
  <div className="diag-body">
   {!store.native && <p>{t('diag.web')}</p>}
   {state.feedback && <p role="status">{t(state.feedback)}</p>}
   {snapshot?.health !== undefined && snapshot.health !== 'complete' && <p role="status">{t('diag.partial')}</p>}
   {state.phase === 'collecting' && <p role="status">{t('diag.collecting')}</p>}
   {tab !== 'incidents' && <fieldset disabled={busy}><legend>{t('diag.extended')}</legend>{(['includeLogs', 'includeIncidentDetails', 'includeCapabilityHealth'] as const).map((key, index) => <label key={key}><input type="checkbox" checked={store.getSelection()[key]} onChange={e => { setFile(0); void store.changeSelection({ ...store.getSelection(), [key]: e.target.checked }); }}/>{t(['diag.logs', 'diag.technical', 'diag.capabilities'][index])}</label>)}</fieldset>}
   {tab === 'report' && snapshot && <pre className="diag-preview" data-copyable tabIndex={0}>{snapshot.reportText}</pre>}
   {tab === 'zip' && snapshot && <><nav className="diag-files" aria-label={t('diag.zip')}>{snapshot.files.map((f, index) => <button type="button" key={f.name} aria-pressed={file === index} onClick={() => setFile(index)}>{f.name} ({f.utf8Bytes})</button>)}</nav><pre className="diag-preview" data-copyable tabIndex={0}>{snapshot.files[file]?.text}</pre><p>{snapshot.totalUncompressedBytes} bytes</p></>}
   {tab === 'incidents' && <><p>{t('diag.retention')}</p>{crashes.feedback && <p role="status">{t(crashes.feedback)}</p>}<div className="diag-split"><IncidentList incidents={crashes.incidents} selected={incident?.incidentId} onSelect={setSelected}/>{incident && <IncidentDetail incident={incident}/>}</div></>}
  </div>
  <footer className="diag-footer">
   {tab === 'incidents' && incident && <button type="button" disabled={crashes.busy} onClick={() => { void review.deleteSelected(incident.incidentId, confirmDelete); }}>{t('diag.delete')}</button>}
   <button type="button" disabled={busy} onClick={() => { void store.refresh(); }}>{t('diag.refresh')}</button>
   <button type="button" disabled={busy || expired} onClick={() => { void store.copy(); }}>{t('diag.copy')}</button>
   {store.native && <button type="button" disabled={busy || expired} onClick={() => { void store.save(); }}>{t('diag.save')}</button>}
   <button type="button" onClick={close}>{t('diag.close')}</button>
  </footer>
 </DialogContent></Dialog>;
}
