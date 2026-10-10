import { pauseIntake, whenInitialReviewDecided } from './intakeGate';
import type { DiagnosticsIntent } from './uiTypes';
export function createDiagnosticsHostStore(whenDestructiveApprovalIdle: () => Promise<void>) {
 let intent: DiagnosticsIntent | null = null, release: (() => void) | undefined, generation = 0;
 const listeners = new Set<() => void>();
 const emit = () => { for (const fn of listeners) fn(); };
 return {
  getSnapshot: () => intent,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  async open(next: DiagnosticsIntent) {
   const mine = ++generation; release?.(); release = pauseIntake('diagnostics-modal');
   try { await whenInitialReviewDecided(); await whenDestructiveApprovalIdle(); if (mine === generation) { intent = next; emit(); } }
   catch { if (mine === generation) this.close(); }
  },
  close() { generation++; intent = null; release?.(); release = undefined; emit(); },
 };
}
export type DiagnosticsHostStore = ReturnType<typeof createDiagnosticsHostStore>;
let currentHost: DiagnosticsHostStore | undefined;
export function installDiagnosticsHost(host: DiagnosticsHostStore): () => void { currentHost = host; return () => { if (currentHost === host) { host.close(); currentHost = undefined; } }; }
export async function openDiagnostics(intent: DiagnosticsIntent = { tab: 'report' }): Promise<void> { await currentHost?.open(intent); }
/** Compatibility alias opens a preview, never silently copies. */
export function copyErrorReport(): Promise<void> { return openDiagnostics({ tab: 'report' }); }
