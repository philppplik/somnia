import type { DiagnosticsClient } from './client';
import type { DiagnosticSnapshot, DiagnosticsSelection, SafeLogEvent } from './uiTypes';
export interface DiagnosticsState { phase: 'closed' | 'collecting' | 'ready' | 'copying' | 'saving'; snapshot?: DiagnosticSnapshot; feedback?: 'diag.failed' | 'diag.copyFailed' | 'diag.copied' | 'diag.saved' | 'diag.expired' }
const defaults = (): DiagnosticsSelection => ({ incidentIds: [], includeLogs: false, includeIncidentDetails: false, includeCapabilityHealth: false });
export function createDiagnosticsStore(client: DiagnosticsClient, entries: () => readonly SafeLogEvent[], writeClipboard: (text: string) => Promise<void>) {
 let state: DiagnosticsState = { phase: 'closed' }, selection = defaults(), generation = 0;
 const listeners = new Set<() => void>();
 const set = (value: DiagnosticsState) => { state = value; for (const fn of listeners) fn(); };
 const discard = (snapshot?: DiagnosticSnapshot) => { if (snapshot) void client.discard(snapshot.snapshotId).catch(() => {}); };
 const ready = () => {
  if (state.phase !== 'ready' || !state.snapshot) return false;
  if (!Number.isFinite(Date.parse(state.snapshot.expiresAt)) || Date.parse(state.snapshot.expiresAt) <= Date.now()) { set({ ...state, feedback: 'diag.expired' }); return false; }
  return true;
 };
 return {
  native: client.native,
  getSnapshot: () => state,
  getSelection: () => selection,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  async open(incidentIds: DiagnosticsSelection['incidentIds'] = []) { selection = { ...defaults(), incidentIds }; await this.refresh(); },
  async refresh() {
   if (state.phase === 'saving' || state.phase === 'copying') return;
   const mine = ++generation; discard(state.snapshot); set({ phase: 'collecting' });
   try {
    const snapshot = await client.prepare(selection, entries());
    if (mine !== generation) { discard(snapshot); return; }
    // Store a detached immutable preview; copy/save must refer to these exact bytes.
    const copy = structuredClone(snapshot);
    copy.files.forEach(Object.freeze); Object.freeze(copy.files); Object.freeze(copy.selection); Object.freeze(copy);
    set({ phase: 'ready', snapshot: copy });
   } catch { if (mine === generation) set({ phase: 'ready', feedback: 'diag.failed' }); }
  },
  async changeSelection(next: DiagnosticsSelection) { if (state.phase === 'saving' || state.phase === 'copying') return; selection = structuredClone(next); await this.refresh(); },
  async copy() {
   if (!ready()) return;
   const snapshot = state.snapshot!, mine = generation; set({ phase: 'copying', snapshot });
   try { await writeClipboard(snapshot.reportText); if (mine === generation) set({ phase: 'ready', snapshot, feedback: 'diag.copied' }); }
   catch { if (mine === generation) set({ phase: 'ready', snapshot, feedback: 'diag.copyFailed' }); }
  },
  async save() {
   if (!client.native || !ready()) return;
   const snapshot = state.snapshot!, mine = generation; set({ phase: 'saving', snapshot });
   try { const result = await client.save(snapshot.snapshotId); if (mine === generation) set({ phase: 'ready', snapshot, feedback: result.kind === 'saved' ? 'diag.saved' : undefined }); }
   catch { if (mine === generation) set({ phase: 'ready', snapshot, feedback: 'diag.failed' }); }
  },
  close() { generation++; discard(state.snapshot); selection = defaults(); set({ phase: 'closed' }); },
 };
}
export type DiagnosticsStore = ReturnType<typeof createDiagnosticsStore>;
