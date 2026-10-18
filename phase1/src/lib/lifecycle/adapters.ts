import type { StudioLifecycleAdapter } from './types';

/**
 * Runtime registry for lifecycle adapters. Studio session modules register
 * their factory at load time; the manifest field resolves it lazily. This
 * keeps heavy session code out of the manifest import graph (and avoids
 * import cycles through the studio index).
 */
const factories = new Map<string, () => StudioLifecycleAdapter>();

export function registerLifecycleAdapter(studioId: string, factory: () => StudioLifecycleAdapter): () => void {
  if (factories.has(studioId)) throw new Error(`Lifecycle adapter already registered: ${studioId}`);
  factories.set(studioId, factory);
  return () => {
    if (factories.get(studioId) === factory) factories.delete(studioId);
  };
}

/** Resolve a registered adapter, or undefined when the studio module is not loaded yet. */
export function getRegisteredLifecycleAdapter(studioId: string): StudioLifecycleAdapter | undefined {
  return factories.get(studioId)?.();
}
