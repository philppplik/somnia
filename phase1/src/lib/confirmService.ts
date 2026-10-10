/**
 * App-level async confirmation (S9 ConfirmAction for intake approvals, D3
 * destructive-delete confirmation). One request at a time, Cancel is the
 * default: a superseding request resolves the pending one with `false`.
 * Rendering lives in ConfirmHost; this module stays React-free.
 */
import type {ConfirmRequest} from './studios/openIntake';

type Entry = { req: ConfirmRequest; resolve: (ok: boolean) => void };
let current: Entry | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const fn of listeners) fn(); };

export function subscribeConfirm(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getConfirmSnapshot(): ConfirmRequest | null { return current?.req ?? null; }

export function requestConfirm(req: ConfirmRequest): Promise<boolean> {
 return new Promise(resolve => {
  current?.resolve(false);
  current = { req, resolve };
  emit();
 });
}

export function answerConfirm(ok: boolean): void {
 const entry = current;
 current = null;
 emit();
 entry?.resolve(ok);
}
