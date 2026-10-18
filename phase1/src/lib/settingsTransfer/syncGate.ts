/**
 * Sync interlock. While a setup import is being reviewed or applied, and afterwards until the user resumes it,
 * "Sync now" and folder linking are blocked, so a sync cannot race the import or copy imported values to the
 * linked folder unseen. In-memory only: a restart resumes sync, as the import review does not survive one either.
 */
type Listener = () => void;
let paused = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
export const isSyncPaused = (): boolean => paused;
export function pauseSync(): void { if (!paused) { paused = true; emit(); } }
export function resumeSync(): void { if (paused) { paused = false; emit(); } }
export function subscribeSyncGate(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
