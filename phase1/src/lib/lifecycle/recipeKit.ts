import { checksumParts } from './checksum';
import type { StudioLifecycleAdapter, StudioSnapshot } from './types';

/**
 * Shared building blocks for the studio lifecycle adapters (Slides, Photos,
 * Sound, Video, Vector, Design). Each studio keeps its own session module as
 * the owner of its state; this file only provides the parts that must behave
 * identically everywhere: snapshot sealing and verification, source
 * fingerprints, and the recipe stash used by the media studios.
 */

/** Identity of a media source without storing the (blob) URL itself. */
export const fingerprintOf = (url: string): string => checksumParts(['source', url]);

/**
 * Canonical, order-independent serialization of a checkpoint payload. Typed
 * arrays are replaced by a length marker and appended to `bytes` so they
 * enter the checksum without being copied into a string.
 */
function canonical(value: unknown, bytes: Uint8Array[]): string {
  if (value === null || value === undefined) return 'n';
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? `d${value}` : `x${String(value)}`;
    case 'boolean':
      return value ? 't' : 'f';
    case 'string':
      return `s${value.length}:${value}`;
    case 'object': {
      if (value instanceof Uint8Array) {
        bytes.push(value);
        return `b${value.byteLength}`;
      }
      if (Array.isArray(value)) return `[${value.map((v) => canonical(v, bytes)).join(',')}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${k.length}:${k}=${canonical(v, bytes)}`).join(',')}}`;
    }
    default:
      return 'u';
  }
}

export function payloadChecksum(studioId: string, schemaVersion: number, revision: number, payload: unknown): string {
  const bytes: Uint8Array[] = [];
  const text = canonical(payload, bytes);
  return checksumParts([studioId, schemaVersion, revision, text, ...bytes]);
}

export interface SealInput {
  studioId: string;
  schemaVersion: number;
  revision: number;
  payload: unknown;
  bytesEstimate: number;
  sourceFingerprint?: string;
  now?: () => number;
}

/** Build a checksummed StudioSnapshot. The payload must be structured-clone safe and free of secrets. */
export function sealSnapshot(input: SealInput): StudioSnapshot {
  return {
    studioId: input.studioId,
    schemaVersion: input.schemaVersion,
    sourceFingerprint: input.sourceFingerprint,
    revision: input.revision,
    capturedAt: (input.now ?? Date.now)(),
    bytesEstimate: Math.max(0, Math.round(input.bytesEstimate)),
    checksum: payloadChecksum(input.studioId, input.schemaVersion, input.revision, input.payload),
    payload: input.payload,
  };
}

/** Throws unless the snapshot belongs to this studio and schema and its checksum still matches. */
export function verifySnapshot(snapshot: StudioSnapshot, studioId: string, schemaVersion: number): void {
  if (snapshot.studioId !== studioId) throw new Error(`Checkpoint belongs to ${snapshot.studioId}, not ${studioId}`);
  if (snapshot.schemaVersion !== schemaVersion) throw new Error(`Unsupported ${studioId} checkpoint version ${snapshot.schemaVersion}`);
  if (snapshot.payload == null || typeof snapshot.payload !== 'object') throw new Error(`${studioId} checkpoint has no payload`);
  if (payloadChecksum(studioId, snapshot.schemaVersion, snapshot.revision, snapshot.payload) !== snapshot.checksum) {
    throw new Error(`${studioId} checkpoint failed verification`);
  }
}

/** Rough retained size of a JSON-like value, for bytesEstimate. Typed arrays count by byteLength. */
export function estimateValueBytes(value: unknown): number {
  const bytes: Uint8Array[] = [];
  const text = canonical(value, bytes);
  return text.length * 2 + bytes.reduce((n, b) => n + b.byteLength, 0);
}

/** One edit recipe, keyed to the document name and the fingerprint of the source it was made against. */
export interface RecipeEntry<R> {
  name: string;
  fingerprint: string;
  recipe: R;
}

/**
 * Recipes of suspended documents that have not been re-opened yet. A recipe is
 * only handed back when the same source is opened again (name and fingerprint
 * match), so a different file re-using the name never inherits an old edit.
 */
export class RecipeStash<R> {
  private readonly map = new Map<string, RecipeEntry<R>>();

  put(entry: RecipeEntry<R>): void {
    this.map.set(entry.name, entry);
  }

  /** Remove and return the recipe for this source. A fingerprint mismatch drops the stale entry. */
  take(name: string, fingerprint: string): R | undefined {
    const entry = this.map.get(name);
    if (!entry) return undefined;
    this.map.delete(name);
    return entry.fingerprint === fingerprint ? entry.recipe : undefined;
  }

  drop(name: string): void {
    this.map.delete(name);
  }

  entries(): RecipeEntry<R>[] {
    return [...this.map.values()];
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

export interface RecipeAdapterOptions<R> {
  studioId: string;
  schemaVersion: number;
  stash: RecipeStash<R>;
  /** Live sessions that carry edits. Neutral sessions are left out: re-opening them is lossless. */
  capture(): RecipeEntry<R>[];
  /** Close every live session and release engines, workers and caches. Source bytes are dropped with them. */
  release(): void;
  /** Validate a recipe read from a checkpoint; return null to drop it. */
  sanitize(recipe: unknown): R | null;
  pinReasons(): readonly string[];
  resourceIds?(): readonly string[];
  estimateBytes(): number;
  /** Monotonic counter bumped on every edit, so newer edits invalidate older snapshots. */
  revision(): number;
  now?: () => number;
}

interface RecipePayload<R> {
  entries: RecipeEntry<R>[];
}

/** Adapter for studios that checkpoint recipes only (Photos, Sound, Video). Source bytes are never copied. */
export function createRecipeAdapter<R>(opts: RecipeAdapterOptions<R>): StudioLifecycleAdapter {
  const merged = (): RecipeEntry<R>[] => {
    const byName = new Map<string, RecipeEntry<R>>();
    for (const e of opts.stash.entries()) byName.set(e.name, e);
    for (const e of opts.capture()) byName.set(e.name, e);
    return [...byName.values()];
  };
  return {
    estimateBytes: () => opts.estimateBytes(),
    resourceIds: () => opts.resourceIds?.() ?? [`studio:${opts.studioId}`],
    pinReasons: () => opts.pinReasons(),
    hasUnsavedChanges: () => opts.stash.size > 0 || opts.capture().length > 0,
    async snapshot() {
      const entries = merged();
      const payload: RecipePayload<R> = { entries };
      return sealSnapshot({
        studioId: opts.studioId,
        schemaVersion: opts.schemaVersion,
        revision: opts.revision(),
        payload,
        bytesEstimate: 256 + estimateValueBytes(payload),
        now: opts.now,
      });
    },
    async suspend() {
      // Move live edits into the stash first; the manager's checkpoint already holds the same recipes.
      for (const e of opts.capture()) opts.stash.put(e);
      opts.release();
    },
    async resume(snapshot) {
      verifySnapshot(snapshot, opts.studioId, opts.schemaVersion);
      const payload = snapshot.payload as RecipePayload<unknown>;
      if (!Array.isArray(payload.entries)) throw new Error(`${opts.studioId} checkpoint has no entries`);
      // Synchronous from here on: stash before any await so the mount path finds the recipes.
      for (const e of payload.entries) {
        if (!e || typeof e.name !== 'string' || typeof e.fingerprint !== 'string') continue;
        const recipe = opts.sanitize(e.recipe);
        if (recipe) opts.stash.put({ name: e.name, fingerprint: e.fingerprint, recipe });
      }
    },
    async dispose() {
      if (opts.stash.size > 0 || opts.capture().length > 0) throw new Error(`Refusing to evict unsaved ${opts.studioId} edits`);
      opts.release();
    },
  };
}
