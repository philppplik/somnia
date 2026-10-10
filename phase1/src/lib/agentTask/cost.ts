import { TaskError } from './errors';
import type { CostTotals, TaskBudget } from './schema';
import { emptyCost } from './schema';

export interface Usage { inputTokens?: number; outputTokens?: number; costUsd?: number }
export type BudgetState = 'ok' | 'warn' | 'exceeded';

/** Per-task token/cost meter. Local models report costUsd 0; BYOK users see real numbers. */
export class CostMeter {
  readonly totals: CostTotals;
  constructor(private readonly budget: TaskBudget = {}, start?: CostTotals, private readonly warnAt = 0.8) { this.totals = { ...(start ?? emptyCost()) }; }
  private clean(n: number | undefined): number { return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0; }
  add(u: Usage): BudgetState {
    this.totals.inputTokens += this.clean(u.inputTokens);
    this.totals.outputTokens += this.clean(u.outputTokens);
    this.totals.costUsd += this.clean(u.costUsd);
    this.totals.calls += 1;
    return this.state();
  }
  get tokens(): number { return this.totals.inputTokens + this.totals.outputTokens; }
  state(): BudgetState {
    const { maxTokens, maxCost } = this.budget;
    const ratios: number[] = [];
    if (maxTokens && maxTokens > 0) ratios.push(this.tokens / maxTokens);
    if (maxCost && maxCost > 0) ratios.push(this.totals.costUsd / maxCost);
    const r = ratios.length ? Math.max(...ratios) : 0;
    return r >= 1 ? 'exceeded' : r >= this.warnAt ? 'warn' : 'ok';
  }
  assertWithin(requestId?: string): void { if (this.state() === 'exceeded') throw new TaskError('budget-exceeded', requestId); }
}

export interface WatchdogVerdict { stalled: boolean; overWall: boolean; idleMs: number }
/** Pure stall check; the engine (or a timer owned by the caller) invokes it. */
export function watchdogCheck(budget: TaskBudget, startedAtMs: number, lastActivityMs: number, nowMs: number): WatchdogVerdict {
  const idleMs = Math.max(0, nowMs - lastActivityMs);
  return {
    idleMs,
    stalled: !!budget.stallMs && idleMs >= budget.stallMs,
    overWall: !!budget.maxWallMs && nowMs - startedAtMs >= budget.maxWallMs,
  };
}
