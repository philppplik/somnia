import type { StudioSnapshot } from './types';
import type { DurableCheckpointBackend } from './spill';

const DB_NAME = 'somnia-lifecycle';
const STORE = 'checkpoints';
const VERSION = 1;
/** Recovery checkpoints older than this are pruned when the store opens. */
export const SPILL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

/**
 * IndexedDB checkpoint spill. Local and private by construction; payloads
 * never contain credentials (see types.ts). Available only where IndexedDB
 * exists (app shell); Node tests use a fake backend instead.
 */
export class IdbCheckpointSpill implements DurableCheckpointBackend {
  private dbPromise: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    try {
      return typeof indexedDB !== 'undefined';
    } catch {
      return false;
    }
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, VERSION);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
      }).then(async (db) => {
        await this.prune(db).catch(() => {});
        return db;
      });
    }
    return this.dbPromise;
  }

  /** Drop expired checkpoints (retention control). */
  private async prune(db: IDBDatabase): Promise<void> {
    const cutoff = Date.now() - SPILL_RETENTION_MS;
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const keys = await request(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    for (const key of keys) {
      const value = await request(store.get(key)) as StudioSnapshot | undefined;
      if (!value || typeof value.capturedAt !== 'number' || value.capturedAt < cutoff) store.delete(key);
    }
  }

  async put(studioId: string, snapshot: StudioSnapshot): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snapshot, studioId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  }

  async get(studioId: string): Promise<StudioSnapshot | undefined> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readonly');
    return (await request(tx.objectStore(STORE).get(studioId))) as StudioSnapshot | undefined;
  }

  async delete(studioId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(studioId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
    });
  }
}
