import { invokeCmd as typedInvokeCmd } from '../invokeCmd';
import type { CrashMeta, DiagnosticSnapshot, DiagnosticsSelection, SafeLogEvent, SaveOutcome } from './uiTypes';
/** Install S2's typed cmd adapter; no raw invoke and no second business log on transport errors. */
export interface DiagnosticsCommands {
 build_diagnostic_zip: { args: { selection: DiagnosticsSelection; rendererEntries: readonly SafeLogEvent[] }; result: DiagnosticSnapshot };
 write_diagnostic_zip: { args: { snapshotId: string }; result: SaveOutcome };
 discard_diagnostic_snapshot: { args: { snapshotId: string }; result: void };
 list_crash_reports: { args: undefined; result: CrashMeta[] };
 mark_crash_reports_reviewed: { args: { ids: readonly string[] }; result: void };
 delete_crash_reports: { args: { ids: readonly string[] }; result: void };
}
export type DiagnosticsInvoker = <K extends keyof DiagnosticsCommands>(command: K, args: DiagnosticsCommands[K]['args']) => Promise<DiagnosticsCommands[K]['result']>;
export interface DiagnosticsClient {
 native: boolean;
 prepare(selection: DiagnosticsSelection, rendererEntries: readonly SafeLogEvent[]): Promise<DiagnosticSnapshot>;
 save(snapshotId: string): Promise<SaveOutcome>;
 discard(snapshotId: string): Promise<void>;
 list(): Promise<CrashMeta[]>;
 markReviewed(ids: readonly string[]): Promise<void>;
 delete(ids: readonly string[]): Promise<void>;
}
export function createDiagnosticsClient(invokeCmd: DiagnosticsInvoker): DiagnosticsClient {
 return { native: true, prepare: (selection, rendererEntries) => invokeCmd('build_diagnostic_zip', { selection, rendererEntries }), save: snapshotId => invokeCmd('write_diagnostic_zip', { snapshotId }), discard: snapshotId => invokeCmd('discard_diagnostic_snapshot', { snapshotId }), list: () => invokeCmd('list_crash_reports', undefined), markReviewed: ids => invokeCmd('mark_crash_reports_reviewed', { ids }), delete: ids => invokeCmd('delete_crash_reports', { ids }) };
}
/** Web preview must be supplied by D1's safe report collector, never from a raw logger buffer. */
export function createWebDiagnosticsClient(prepare: DiagnosticsClient['prepare']): DiagnosticsClient {
 return { native: false, prepare, list: async () => [], markReviewed: async () => {}, delete: async () => {}, discard: async () => {}, save: async () => { throw new Error('native-save-unavailable'); } };
}

/** Default production adapter uses S2's command overloads, preserving native DTO discriminants. */
export function createNativeDiagnosticsClient(): DiagnosticsClient {
 return { native: true, prepare: (selection, entries) => typedInvokeCmd('build_diagnostic_zip', { selection, rendererEntries: [...entries] }), save: snapshotId => typedInvokeCmd('write_diagnostic_zip', { snapshotId }), discard: async snapshotId => { await typedInvokeCmd('discard_diagnostic_snapshot', { snapshotId }); }, list: () => typedInvokeCmd('list_crash_reports'), markReviewed: async ids => { await typedInvokeCmd('mark_crash_reports_reviewed', { ids: [...ids] }); }, delete: async ids => { await typedInvokeCmd('delete_crash_reports', { ids: [...ids] }); } };
}
