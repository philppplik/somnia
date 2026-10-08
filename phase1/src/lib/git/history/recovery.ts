import type {FilePort, FileEvent, Revision, Recovery, Read} from '../../fileAdapter';
export interface RecoverySnapshot extends Recovery {updatedAtMs?: number; baseRevision?: Revision}
export interface RecoveryEntry {id: string; kind: 'recovery' | 'safety'; record: RecoverySnapshot}
export interface RecoveryRestoreResult {event: FileEvent; content: string; safetyIds: string[]}
export interface RecoveryBackend {
 list(): Promise<RecoveryEntry[]>;
 review(entry: RecoveryEntry): Promise<Revision>;
 restore(entry: RecoveryEntry, expectedRevision: Revision): Promise<RecoveryRestoreResult>;
}
/** Uses the same project grant and revision counter as the file adapter. No global Tauri access. */
export function createRecoveryBackend(port: Pick<FilePort, 'invoke'>, projectId: string, nextRevision: () => number): RecoveryBackend {
 return {
  list: () => port.invoke('recovery_history_list', {projectId}),
  review: async entry => (await port.invoke<Read>('read_file', {projectId, path: entry.record.path})).revision,
  restore: (entry, expectedRevision) => port.invoke('recovery_restore_safe', {
   projectId, id: entry.id, path: entry.record.path, expectedRevision, clientRevision: nextRevision(),
  }),
 };
}
