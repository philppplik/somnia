/**
 * React-free state for the deploy confirmation dialogs. One request at a time; a new request
 * resolves the pending one with `null` (cancel is always the default). The presenter that the
 * commands use is built here, the dialog component only renders the snapshot and answers it.
 */
import type { DeployHostKeyInfo, DeployPlan, DeployTarget } from './contract';
import type { DeployConfirmPresenter, UserGesture } from './confirmation';

export type DeployDialogRequest =
  | { kind: 'plan'; plan: DeployPlan; target: DeployTarget }
  | { kind: 'hostkey'; target: DeployTarget; info: DeployHostKeyInfo }
  | { kind: 'replace'; target: DeployTarget; oldFingerprint: string; info: DeployHostKeyInfo };

export type DeployDialogAnswer = { gesture: UserGesture; acknowledged?: boolean } | null;
type Entry = { req: DeployDialogRequest; resolve: (a: DeployDialogAnswer) => void };

let current: Entry | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const fn of [...listeners]) fn(); };

export function subscribeDeployDialog(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getDeployDialogSnapshot(): DeployDialogRequest | null { return current?.req ?? null; }

function ask(req: DeployDialogRequest): Promise<DeployDialogAnswer> {
  return new Promise(resolve => { current?.resolve(null); current = { req, resolve }; emit(); });
}
export function answerDeployDialog(answer: DeployDialogAnswer): void {
  const entry = current; current = null; emit(); entry?.resolve(answer);
}

export const dialogPresenter: DeployConfirmPresenter = {
  confirmPlan: async (plan, target) => (await ask({ kind: 'plan', plan, target }))?.gesture ?? null,
  confirmHostKey: async (target, info) => (await ask({ kind: 'hostkey', target, info }))?.gesture ?? null,
  confirmHostKeyReplace: async (target, oldFingerprint, info) => {
    const a = await ask({ kind: 'replace', target, oldFingerprint, info });
    return a ? { gesture: a.gesture, acknowledged: a.acknowledged === true } : null;
  },
};

export function summarizePlan(plan: DeployPlan): { added: number; changed: number; removed: number; unchanged: number } {
  const n = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const f of plan.files) n[f.change]++;
  return n;
}
