import { AgentError } from './errors';
export interface CatalogEntry {id: string; name: string}
/** No seeded IDs or stale fallback. A catalog is metadata, not a capability grant. */
export function catalogEntries(value: unknown): CatalogEntry[] {
  const data = (value as {data?: unknown})?.data;
  if (!Array.isArray(data) || data.length > 10000) throw new AgentError('provider-error', 'protocol', 'Invalid model catalog.');
  const entries = new Map<string, CatalogEntry>();
  for (const item of data) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 512 || /[\x00-\x1f\x7f]/.test(item.id)) throw new AgentError('provider-error', 'protocol', 'Invalid model catalog.');
    if (!entries.has(item.id)) entries.set(item.id, {id: item.id, name: typeof item.name === 'string' && item.name.trim() && item.name.length <= 512 && !/[\x00-\x1f\x7f]/.test(item.name) ? item.name : item.id});
  }
  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
}
