/** Applied AI content stays in editor memory until explicit save. No draft/journal leakage. */
const held = new Set<string>();
let backend: ((paths: string[]) => Promise<void>) | null = null;
export function installHoldBackend(fn: typeof backend) { backend = fn; return () => { if (backend === fn) backend = null; }; }
export async function holdAgentAutosave(paths: string[]) { await backend?.(paths); paths.forEach(p => held.add(p)); }
export function isAgentAutosaveHeld(path: string) { return held.has(path); }
export function heldAgentPaths() { return [...held]; }
export function releaseAgentAutosave(path: string) { held.delete(path); }
export function clearAgentAutosaveHolds() { held.clear(); }
