import { invoke } from '@tauri-apps/api/core';
export type ActivityDecision = 'allowed' | 'denied' | 'prompted' | 'changed';
export type ActivityKind = 'permission' | 'network' | 'lifecycle' | 'consent';
export interface ActivityEvent {
  id: string; ts: string; extensionId: string; extensionName: string; api: string;
  target: string | null; decision: ActivityDecision; kind: ActivityKind;
  latencyMs: number | null; scope: string | null;
}
export interface ActivityFilter { extensionId?: string; decision?: ActivityDecision; kind?: ActivityKind; search?: string; before?: string; after?: string }
export interface ActivityPage { events: ActivityEvent[]; nextOffset: number | null; total: number }
/** No renderer append endpoint: only trusted host dispatchers write permission/lifecycle events. */
export const queryExtensionActivity = (filter: ActivityFilter = {}, offset = 0, limit = 100): Promise<ActivityPage> => invoke('extension_activity_query', { filter, offset, limit });
/** Filtered local save dialog owned by the host. null means user cancelled. */
export const exportExtensionActivity = (filter: ActivityFilter = {}): Promise<string | null> => invoke('extension_activity_export', { filter });
