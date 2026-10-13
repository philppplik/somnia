/** Pure view models for the Publish panels. No React, no store access, no secrets: everything comes from PublishState. */
import type { DeployPlan, DeployTarget, DeployTargetStatus } from '../deploy/contract';
import type { PublishState } from '../deploy/publishStore';
import { isDomain, nextStep } from '../deploy/publishModel';
import type { FrameworkDetection } from '../frameworks/detect';

export interface TargetRow { id: string; name: string; address: string; state: DeployTargetStatus['state']; selected: boolean; next: ReturnType<typeof nextStep> }
export function targetRows(state: Pick<PublishState, 'targets' | 'selectedId'>): TargetRow[] {
  return state.targets.map(s => ({
    id: s.target.id, name: s.target.name, state: s.state, selected: s.target.id === state.selectedId, next: nextStep(s.state),
    address: `${s.target.user}@${s.target.host}${s.target.port !== 22 ? `:${s.target.port}` : ''}`,
  }));
}

export interface LogLine { key: string; params?: Record<string, number>; status: 'done' | 'active' | 'waiting' }
const STEP_KEY: Record<string, string> = { connect: 'deploy.progress.connect', check: 'deploy.progress.check', upload: 'deploy.progress.upload', switch: 'deploy.progress.switch', health: 'deploy.progress.health' };
const BUILD_KEY = { installing: 'deploy.progress.build.installing', building: 'deploy.progress.build.building', collecting: 'deploy.progress.build.collecting' } as const;
/** Live log of a running publish, rollback or dry run: build phase first, then the engine steps in order. */
export function liveLog(state: Pick<PublishState, 'busy' | 'build' | 'progress'>): LogLine[] {
  const lines: LogLine[] = [];
  const b = state.build;
  if (b.phase === 'done' && b.summary) lines.push({ key: 'deploy.progress.build.done', params: { count: b.summary.fileCount }, status: 'done' });
  else if (b.phase && b.phase !== 'done') lines.push({ key: BUILD_KEY[b.phase], status: 'active' });
  const seen = state.progress.seen, latest = state.progress.latest;
  for (const info of seen) {
    if (info.step === 'other') continue;
    const active = state.busy !== null && latest?.step === info.step;
    const withCount = info.step === 'upload' && info.total !== undefined && info.done !== undefined;
    lines.push({ key: withCount ? 'deploy.progress.upload.count' : STEP_KEY[info.step], params: withCount ? { done: info.done!, total: info.total! } : undefined, status: active ? 'active' : 'done' });
  }
  if ((state.busy === 'publish' || state.busy === 'rollback') && lines.length === 0) lines.push({ key: 'deploy.progress.waiting', status: 'waiting' });
  return lines;
}

export interface DryRunView { counts: { added: number; changed: number; removed: number; unchanged: number }; rows: { path: string; change: 'added' | 'changed' | 'removed'; size: number }[]; hidden: number; uploadBytes: number; empty: boolean }
const MAX_ROWS = 40;
export function dryRunView(plan: DeployPlan): DryRunView {
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  let uploadBytes = 0;
  const moving: DryRunView['rows'] = [];
  for (const f of plan.files) {
    counts[f.change]++;
    if (f.change === 'added' || f.change === 'changed') uploadBytes += f.size;
    if (f.change !== 'unchanged') moving.push({ path: f.path, change: f.change, size: f.size });
  }
  const order = { added: 0, changed: 1, removed: 2 } as const;
  moving.sort((a, b) => order[a.change] - order[b.change] || a.path.localeCompare(b.path));
  return { counts, rows: moving.slice(0, MAX_ROWS), hidden: Math.max(0, moving.length - MAX_ROWS), uploadBytes, empty: moving.length === 0 };
}

export type FrameworkAdviceKind = 'none' | 'match' | 'needs-node' | 'node-not-needed' | 'upload-only';
/** Does the target kind fit what the detected framework builds? Detection reads package.json only. */
export function frameworkAdvice(detected: Pick<FrameworkDetection, 'output'> | null, target: Pick<DeployTarget, 'kind'> | null): FrameworkAdviceKind {
  if (!detected || !target) return 'none';
  if (target.kind === 'upload-only' || target.kind === 'ftp') return detected.output === 'node' ? 'upload-only' : 'match';
  if (detected.output === 'node') return target.kind === 'node' ? 'match' : 'needs-node';
  return target.kind === 'node' ? 'node-not-needed' : 'match';
}

export type DomainCheck = { ok: true; value: string } | { ok: false; reason: 'invalid' };
/** Empty means "no domain". Anything else must be a plain host name (no scheme, path or port). */
export function checkDomain(input: string): DomainCheck | { ok: true; value: '' } {
  const v = input.trim().toLowerCase();
  if (v === '') return { ok: true, value: '' };
  return isDomain(v) ? { ok: true, value: v } : { ok: false, reason: 'invalid' };
}
export const canPublish = (s: DeployTargetStatus | undefined | null, busy: PublishState['busy']) => !!s && s.state === 'ready' && busy === null;
