import type {FilePort} from './fileAdapter';
/**
 * Bridge between the file adapter (which owns the project grant, the revision
 * counter and the autosave queue) and the Versions panel. The panel never
 * touches the adapter internals; it only sees this narrow surface.
 */
export interface VersionsSession {
  projectId: string;
  port: Pick<FilePort, 'invoke'>;
  /** Same counter the autosave uses, so recovery restores order correctly. */
  nextRevision(): number;
  /** True for dirty buffers, in-flight or queued autosave work, or a held recovery restore. */
  hasUnsavedBuffers(): boolean;
  /** Waits for queued autosave work to finish (does not save dirty buffers). */
  settle(): Promise<void>;
  /** Mirrors a safe recovery restore into the editor without re-staging it. The file stays dirty and held until explicit Save. */
  applyRecoveryRestore(path: string, content: string, event: import('./fileAdapter').FileEvent): Promise<void>;
  /** Re-reads project files from disk after a Git restore. Returns paths changed in the editor and a note for files it could not mirror. */
  reloadFromDisk(): Promise<{changed: string[]; note?: string}>;
}
let current: VersionsSession | null = null;
const listeners = new Set<() => void>();
export const getVersionsSession = () => current;
export function setVersionsSession(next: VersionsSession | null) {
  current = next;
  listeners.forEach(fn => fn());
}
export function subscribeVersionsSession(fn: () => void) {
  listeners.add(fn);
  return () => {listeners.delete(fn);};
}
