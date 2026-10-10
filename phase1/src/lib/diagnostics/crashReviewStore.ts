import type { DiagnosticsClient } from './client';
import { completeInitialReviewDecision, pauseIntake } from './intakeGate';
import type { CrashMeta } from './uiTypes';
export interface CrashReviewState { incidents: readonly CrashMeta[]; open: boolean; busy: boolean; feedback?: 'diag.failed' | 'diag.partial' }
export function createCrashReviewStore(client: DiagnosticsClient, gate = { pauseIntake, completeInitialReviewDecision }, timeoutMs = 2000) {
 let state: CrashReviewState = { incidents: [], open: false, busy: false }, started = false, generation = 0;
 let release: (() => void) | undefined;
 const listeners = new Set<() => void>();
 const set = (value: CrashReviewState) => { state = value; for (const fn of listeners) fn(); };
 const finish = () => { gate.completeInitialReviewDecision(); release?.(); release = undefined; };
 const listBounded = async () => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([client.list(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('collection-timeout')), timeoutMs); })]); }
  finally { clearTimeout(timer); }
 };
 return {
  getSnapshot: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  /** Call synchronously before orchestrator.start(), not from a mount effect. */
  start(): Promise<void> {
   if (started) return Promise.resolve(); started = true;
   release = gate.pauseIntake('initial-review');
   if (!client.native) { finish(); return Promise.resolve(); }
   const mine = ++generation; set({ ...state, busy: true });
   return listBounded().then(incidents => {
    if (mine !== generation) return;
    const open = incidents.some(i => !i.reviewedAt);
    set({ incidents, open, busy: false }); if (!open) finish();
   }).catch(() => { if (mine === generation) { set({ ...state, open: false, busy: false, feedback: 'diag.partial' }); finish(); } });
  },
  async refresh() {
   try { const incidents = await listBounded(); set({ ...state, incidents, feedback: undefined }); }
   catch { set({ ...state, feedback: 'diag.partial' }); }
  },
  later() { generation++; set({ ...state, open: false, busy: false }); finish(); },
  async review(ids: readonly string[]) {
   const mine = generation; set({ ...state, busy: true });
   try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([client.markReviewed(ids), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('review-timeout')), timeoutMs); })]); }
    finally { clearTimeout(timer); }
    if (mine === generation) set({ ...state, incidents: state.incidents.map(i => ids.includes(i.incidentId) ? { ...i, reviewedAt: new Date().toISOString() } : i), open: false, busy: false });
   } catch { if (mine === generation) set({ ...state, open: false, busy: false, feedback: 'diag.failed' }); }
   finally { finish(); }
  },
  async deleteSelected(id: string, confirm: () => Promise<boolean>) {
   if (!await confirm()) return;
   set({ ...state, busy: true });
   try { await client.delete([id]); set({ ...state, incidents: state.incidents.filter(i => i.incidentId !== id), busy: false }); }
   catch { set({ ...state, busy: false, feedback: 'diag.failed' }); }
  },
  dispose() { generation++; set({ ...state, open: false, busy: false }); finish(); },
 };
}
export type CrashReviewStore = ReturnType<typeof createCrashReviewStore>;
