/**
 * Human confirmation for deploy commands (concept section 11.1).
 *
 * The dialog component captures a [[UserGesture]] from the click that approves; commands refuse to
 * continue without one. A gesture is: created only here, from a trusted DOM event inside user
 * activation, valid for a short time, and usable once. The token that Rust checks is minted after
 * this gesture, bound to the plan hash.
 *
 * There is no "don't ask again": every publish and rollback asks.
 */
import type { DeployHostKeyInfo, DeployPlan, DeployTarget } from './contract';

declare const gestureBrand: unique symbol;
export interface UserGesture { readonly [gestureBrand]: true }

const GESTURE_TTL_MS = 60_000;
const issued = new WeakMap<object, number>();
let clock: () => number = () => Date.now();
export function __setGestureClock(fn: () => number): void { clock = fn; }

export class DeployConfirmationError extends Error {
  readonly name = 'DeployConfirmationError';
  readonly expected = true;
  constructor(readonly code: 'no-confirmation-ui' | 'not-a-gesture' | 'gesture-expired' | 'cancelled') { super(`deploy:${code}`); }
}

type EventLike = { isTrusted: boolean };
/** Call from the click handler of the approving button. Synthetic events and idle pages are refused. */
export function captureGesture(event: EventLike): UserGesture {
  if (!event || event.isTrusted !== true) throw new DeployConfirmationError('not-a-gesture');
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { isActive: boolean } }) : undefined;
  if (nav?.userActivation && !nav.userActivation.isActive) throw new DeployConfirmationError('not-a-gesture');
  const g = Object.freeze({}) as UserGesture;
  issued.set(g, clock());
  return g;
}

/** Consumes the gesture. A second use, a forged object or an old gesture all fail. */
export function consumeGesture(g: unknown): void {
  if (!g || typeof g !== 'object') throw new DeployConfirmationError('not-a-gesture');
  const at = issued.get(g);
  if (at === undefined) throw new DeployConfirmationError('not-a-gesture');
  issued.delete(g);
  if (clock() - at > GESTURE_TTL_MS) throw new DeployConfirmationError('gesture-expired');
}

export interface DeployConfirmPresenter {
  /** Shows target, pinned fingerprint and the exact file list or diff. Resolves null on cancel. */
  confirmPlan(plan: DeployPlan, target: DeployTarget): Promise<UserGesture | null>;
  /** First-connection dialog with the fingerprint the server presented. */
  confirmHostKey(target: DeployTarget, info: DeployHostKeyInfo): Promise<UserGesture | null>;
  /** Changed-key flow: second explicit confirmation plus checkbox. */
  confirmHostKeyReplace(target: DeployTarget, oldFingerprint: string, info: DeployHostKeyInfo): Promise<{ gesture: UserGesture; acknowledged: boolean } | null>;
}

let presenter: DeployConfirmPresenter | null = null;
export function registerDeployConfirmPresenter(p: DeployConfirmPresenter): () => void {
  presenter = p;
  return () => { if (presenter === p) presenter = null; };
}
export function getDeployConfirmPresenter(): DeployConfirmPresenter {
  if (!presenter) throw new DeployConfirmationError('no-confirmation-ui');
  return presenter;
}
