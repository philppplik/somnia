import type { IncidentId, RequestId } from './uiTypes';
export interface RetryCapability { requestId: RequestId; ordinal: number; token: string; expiresAt: string }
export type RetryExecutor = (requestId: RequestId, ordinal: number, token: string) => Promise<{ status: 'opened' | 'rejected' | 'failed' | 'cancelled' | 'expired' }>;
const capabilities = new Map<IncidentId, RetryCapability>();
const busy = new Set<IncidentId>();
const listeners = new Set<() => void>();
let executor: RetryExecutor | undefined;
const notify = () => { for (const fn of listeners) fn(); };
export const subscribeRetries = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function registerIntakeRetryExecutor(run: RetryExecutor): () => void { executor = run; notify(); return () => { if (executor === run) { executor = undefined; capabilities.clear(); notify(); } }; }
export function attachRetryCapability(id: IncidentId, cap: RetryCapability): void { for (const [key, value] of capabilities) if (Date.parse(value.expiresAt) <= Date.now()) capabilities.delete(key); while (capabilities.size >= 100) capabilities.delete(capabilities.keys().next().value!); if (Number.isFinite(Date.parse(cap.expiresAt)) && Date.parse(cap.expiresAt) > Date.now()) { capabilities.set(id, { ...cap }); notify(); } }
export function canRetryNotice(id: IncidentId): boolean { const cap = capabilities.get(id); return !!executor && !!cap && Date.parse(cap.expiresAt) > Date.now() && !busy.has(id); }
export function retryBusy(id: IncidentId): boolean { return busy.has(id); }
/** Consume BEFORE awaiting; tokens never enter any public snapshot, export or log. */
export async function retryNoticeItem(id: IncidentId): Promise<void> {
 const cap = capabilities.get(id), run = executor;
 if (!run || !cap || !canRetryNotice(id)) return;
 capabilities.delete(id); busy.add(id); notify();
 try { const result = await run(cap.requestId, cap.ordinal, cap.token); if (result.status === 'opened') { const { acknowledgeNotice } = await import('./noticePresenter'); acknowledgeNotice(id); } }
 finally { busy.delete(id); notify(); }
}
