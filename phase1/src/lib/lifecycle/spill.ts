import type { StudioSnapshot } from './types';

/**
 * Durable checkpoint backend seam (concept section 4: spill verified
 * recovery/history to storage). The IndexedDB implementation lives in
 * idbSpill.ts; tests use in-memory fakes. Payloads are structured-cloneable
 * by contract: no secrets, Blob URLs or worker handles.
 */
export interface DurableCheckpointBackend {
  put(studioId: string, snapshot: StudioSnapshot): Promise<void>;
  get(studioId: string): Promise<StudioSnapshot | undefined>;
  delete(studioId: string): Promise<void>;
  clear(): Promise<void>;
}
