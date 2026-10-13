import type { StudioSnapshot } from './types';
import type { DurableCheckpointBackend } from './spill';

export interface CheckpointStoreOptions {
  /** Durable spill target (IndexedDB in the app shell, fake in tests). */
  spill?: DurableCheckpointBackend;
  /** Spill failures are reported here; checkpoint data is never dropped silently. */
  onSpillError?(error: unknown): void;
}

/**
 * Checkpoint store for suspended studios, one checkpoint per studio.
 * Memory-first and byte-bounded (concept budget: suspended metadata/previews
 * share a 64 MiB bucket in the normal profile). When the budget cannot fit a
 * checkpoint, the least recently used entries spill to the durable backend;
 * a checkpoint that alone exceeds the budget goes straight to the spill.
 * Refusal is the last resort, so unsaved state is never discarded.
 * Checkpoints are recovery data: they never mark a document clean and never
 * overwrite the source.
 */
export class CheckpointStore {
  private readonly capacityBytes: number;
  private readonly spill?: DurableCheckpointBackend;
  private readonly onSpillError?: (error: unknown) => void;
  private readonly map = new Map<string, StudioSnapshot>();
  /** Ids known to live only in the durable spill (not in memory). */
  private readonly spilled = new Set<string>();

  constructor(capacityBytes: number, options: CheckpointStoreOptions = {}) {
    this.capacityBytes = capacityBytes;
    this.spill = options.spill;
    this.onSpillError = options.onSpillError;
  }

  private spillError(error: unknown): void {
    try {
      this.onSpillError?.(error);
    } catch {
      /* reporting must never break the store */
    }
  }

  /**
   * Store or replace a checkpoint. Returns false only when neither memory
   * nor the durable spill can hold it.
   */
  async put(snapshot: StudioSnapshot): Promise<boolean> {
    const existing = this.map.get(snapshot.studioId);
    if (existing) this.map.delete(snapshot.studioId);
    if (snapshot.bytesEstimate > this.capacityBytes) {
      // Larger than the whole memory budget: straight to durable spill.
      if (!this.spill) {
        if (existing) this.map.set(snapshot.studioId, existing); // keep the previous checkpoint
        return false;
      }
      try {
        await this.spill.put(snapshot.studioId, snapshot);
        this.spilled.add(snapshot.studioId);
        return true;
      } catch (error) {
        this.spillError(error);
        if (existing) this.map.set(snapshot.studioId, existing);
        return false;
      }
    }
    while (this.bytes() + snapshot.bytesEstimate > this.capacityBytes && this.map.size) {
      const oldest = this.map.keys().next().value as string;
      const entry = this.map.get(oldest) as StudioSnapshot;
      if (!this.spill) return this.restore(existing, snapshot.studioId);
      try {
        await this.spill.put(oldest, entry);
        this.map.delete(oldest);
        this.spilled.add(oldest);
      } catch (error) {
        this.spillError(error);
        return this.restore(existing, snapshot.studioId);
      }
    }
    if (this.bytes() + snapshot.bytesEstimate > this.capacityBytes) return this.restore(existing, snapshot.studioId);
    this.map.set(snapshot.studioId, snapshot);
    if (this.spilled.delete(snapshot.studioId)) this.spill?.delete(snapshot.studioId).catch((e) => this.spillError(e));
    return true;
  }

  private restore(existing: StudioSnapshot | undefined, studioId: string): boolean {
    if (existing) this.map.set(studioId, existing);
    return false;
  }

  /** Memory-resident checkpoint, if any. Call hydrate() first when resuming. */
  get(studioId: string): StudioSnapshot | undefined {
    const hit = this.map.get(studioId);
    if (hit) {
      // LRU refresh: recently used checkpoints spill last.
      this.map.delete(studioId);
      this.map.set(studioId, hit);
    }
    return hit;
  }

  /** Load a spilled checkpoint back into memory. Returns true when one is available. */
  async hydrate(studioId: string): Promise<boolean> {
    if (this.map.has(studioId)) return true;
    if (!this.spill || !this.spilled.has(studioId)) return false;
    try {
      const snapshot = await this.spill.get(studioId);
      if (!snapshot) {
        this.spilled.delete(studioId);
        return false;
      }
      this.map.set(studioId, snapshot);
      this.spilled.delete(studioId);
      this.spill.delete(studioId).catch((e) => this.spillError(e));
      return true;
    } catch (error) {
      this.spillError(error);
      return false;
    }
  }

  delete(studioId: string): void {
    this.map.delete(studioId);
    if (this.spilled.delete(studioId)) this.spill?.delete(studioId).catch((e) => this.spillError(e));
  }

  bytes(): number {
    let total = 0;
    for (const s of this.map.values()) total += s.bytesEstimate;
    return total;
  }

  ids(): readonly string[] {
    return [...this.map.keys(), ...this.spilled];
  }

  clear(): void {
    this.map.clear();
    this.spilled.clear();
    this.spill?.clear().catch((e) => this.spillError(e));
  }
}
