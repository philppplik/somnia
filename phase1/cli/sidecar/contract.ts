/**
 * Task-engine contract "somnia.task-engine/1" (sidecar side). The Rust side lives in `cli/src/engine.rs`.
 * One JSON object per line on stdio.
 *
 *   host -> engine:  {"op":"start","contract":"somnia.task-engine/1","task":{...}}   (first line, once)
 *                    {"op":"cancel"}                                                 (any time; engine aborts and exits)
 *   engine -> host:  see `EngineOut`. Exactly one terminal event (done | failed | needs-input) ends a run.
 *
 * Credentials are never part of this channel. Provider, model and keys come from the engine's own environment
 * (see `config.ts`). Tool arguments and results are summarised, never forwarded verbatim.
 */
export const ENGINE_CONTRACT = 'somnia.task-engine/1';

export interface EngineTask {
  taskId: string;
  prompt: string;
  cwd: string;
  allowedRoots: string[];
  bare: boolean;
  studio?: string | null;
  maxTokens?: number | null;
  maxCost?: number | null;
}

export type FailureCode = 'config' | 'consent' | 'auth' | 'budget' | 'scope' | 'conflict' | 'limit' | 'provider' | 'timeout' | 'internal';

export type EngineOut =
  | { event: 'progress'; text: string }
  | { event: 'plan'; text: string }
  | { event: 'model'; provider: string; model: string }
  /** Cumulative for the whole run. `cost` is null while no provider has reported a price (unknown, never zero). */
  | { event: 'usage'; tokens: number; cost: number | null }
  | { event: 'tool-call'; id: string; name: string; summary: string }
  | { event: 'tool-result'; id: string; status: 'ok' | 'error'; summary: string }
  | { event: 'needs-input'; reason: string }
  | { event: 'done'; summary: string; tokens: number; cost: number | null; verification?: unknown }
  | { event: 'failed'; message: string; code: FailureCode; retryable: boolean };

export const isTerminal = (e: EngineOut): boolean => e.event === 'done' || e.event === 'failed' || e.event === 'needs-input';
