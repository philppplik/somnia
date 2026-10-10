import type { TaskStatus } from './schema';

/** Typed task errors (R5-C4). Fixed text only: raw git/provider output may carry secrets and is never surfaced. */
export type TaskErrorCode =
  | 'git-missing' | 'identity' | 'auth' | 'sso' | 'protection' | 'stale-plan' | 'dirty' | 'diverged' | 'uncertain-outcome'
  | 'unsaved-buffer' | 'review-required' | 'gate-denied' | 'budget-exceeded' | 'watchdog-timeout'
  | 'invalid-transition' | 'invalid-record' | 'scope-violation' | 'duplicate-request' | 'not-found' | 'private-storage';

export const TASK_ERROR_CODES: readonly TaskErrorCode[] = [
  'git-missing', 'identity', 'auth', 'sso', 'protection', 'stale-plan', 'dirty', 'diverged', 'uncertain-outcome',
  'unsaved-buffer', 'review-required', 'gate-denied', 'budget-exceeded', 'watchdog-timeout',
  'invalid-transition', 'invalid-record', 'scope-violation', 'duplicate-request', 'not-found', 'private-storage',
];

const MESSAGES: Record<TaskErrorCode, string> = {
  'git-missing': 'Git is not available.',
  identity: 'No Git identity or attribution identity is configured.',
  auth: 'Authentication is required or was rejected.',
  sso: 'The organisation requires single sign-on authorisation.',
  protection: 'A branch protection rule blocks this operation.',
  'stale-plan': 'The reviewed content changed after approval; review again.',
  dirty: 'The working tree has unexpected changes.',
  diverged: 'The branch has diverged from its base or remote.',
  'uncertain-outcome': 'The outcome of a remote operation is unknown; check the remote before retrying.',
  'unsaved-buffer': 'There are unsaved editor buffers; save or discard them first.',
  'review-required': 'This step needs a review before it can continue.',
  'gate-denied': 'This gate is not permitted for this task.',
  'budget-exceeded': 'The task budget was reached.',
  'watchdog-timeout': 'The task stopped making progress.',
  'invalid-transition': 'That status change is not allowed.',
  'invalid-record': 'The task record is invalid.',
  'scope-violation': 'The path is outside the task allowed roots.',
  'duplicate-request': 'This request was already handled.',
  'not-found': 'Task not found.',
  'private-storage': 'Session records must live in private app storage, not in the repository.',
};

const RETRYABLE = new Set<TaskErrorCode>(['watchdog-timeout', 'dirty', 'stale-plan']);
/** Errors where the user must act (review/input) rather than the task having failed. */
const NEEDS_INPUT = new Set<TaskErrorCode>(['review-required', 'unsaved-buffer', 'stale-plan', 'identity', 'auth', 'sso', 'uncertain-outcome', 'dirty', 'diverged']);

export class TaskError extends Error {
  readonly retryable: boolean;
  constructor(public readonly code: TaskErrorCode, public readonly requestId?: string, public readonly detail?: string) {
    super(MESSAGES[code]);
    this.name = 'TaskError';
    this.retryable = RETRYABLE.has(code);
  }
  get needsInput(): boolean { return NEEDS_INPUT.has(this.code); }
  toJSON() { return { code: this.code, message: this.message, retryable: this.retryable, needsInput: this.needsInput, requestId: this.requestId ?? null }; }
}

/** CLI exit codes: 0 done, 1 failed/cancelled, 2 needs input or review required. */
export type ExitCode = 0 | 1 | 2;
export function exitCodeForStatus(status: TaskStatus): ExitCode {
  if (status === 'done') return 0;
  if (status === 'waiting-input' || status === 'review') return 2;
  return 1;
}
export function exitCodeForError(e: unknown): ExitCode {
  return e instanceof TaskError && e.needsInput ? 2 : 1;
}

let counter = 0;
/** Request id: time-sortable + random; opaque to callers. */
export function newRequestId(now: number = Date.now(), rnd: () => number = Math.random): string {
  counter = (counter + 1) % 0xffff;
  const r = Array.from({ length: 8 }, () => Math.floor(rnd() * 36).toString(36)).join('');
  return `req_${now.toString(36)}${counter.toString(36)}_${r}`;
}
