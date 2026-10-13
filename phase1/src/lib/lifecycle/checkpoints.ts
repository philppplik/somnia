import type { StudioSnapshot } from './types';

/**
 * In-memory checkpoint store for suspended studios, one checkpoint per studio.
 * Byte-bounded (concept budget: suspended metadata/previews share a 64 MiB
 * bucket in the normal profile). Durable spill (IndexedDB/OPFS) is a later
 * phase; the store is the seam where it lands. Checkpoints are recovery data:
 * they never mark a document clean and never overwrite the source.
 */
export class CheckpointStore {
  private readonly capacityBytes: number;
  private readonly map = new Map<string, StudioSnapshot>();

  constructor(capacityBytes: number) {
    this.capacityBytes = capacityBytes;
  }

  /** Store or replace a checkpoint. Returns false when the budget cannot fit it. */
  put(snapshot: StudioSnapshot): boolean {
    const existing = this.map.get(snapshot.studioId);
    const freed = existing?.bytesEstimate ?? 0;
    if (this.bytes() - freed + snapshot.bytesEstimate > this.capacityBytes) return false;
    this.map.delete(snapshot.studioId);
    this.map.set(snapshot.studioId, snapshot);
    return true;
  }

  get(studioId: string): StudioSnapshot | undefined {
    return this.map.get(studioId);
  }

  delete(studioId: string): void {
    this.map.delete(studioId);
  }

  bytes(): number {
    let total = 0;
    for (const s of this.map.values()) total += s.bytesEstimate;
    return total;
  }

  ids(): readonly string[] {
    return [...this.map.keys()];
  }

  clear(): void {
    this.map.clear();
  }
}
