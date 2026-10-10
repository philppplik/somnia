// Typed Tauri command boundary. Every command call goes through invokeCmd(); raw `invoke` is only
// allowed in this file (lint rule no-raw-invoke lands with D1-F).
//
// Rejections from wrapped commands have the shape { id, code, message, detail?, incident_id, expected }
// (Rust AppCommandError). Anything else (string, { code, message } of legacy AppError, Error) becomes a
// CommandError with id SOM-APP-099 and bumps legacyUntyped[cmd] so migration progress is measurable.
import { invoke } from '@tauri-apps/api/core';
import type { CommandName } from '../generated/commandNames';
import type { CommandContracts } from './commandContracts';

export type { CommandName } from '../generated/commandNames';
/** Registry id such as SOM-FS-006. Narrowed to the generated union once phase1/src/generated/errorIds.ts lands. */
export type CommandErrorId = `SOM-${string}-${string}`;

export const LEGACY_UNTYPED_ID: CommandErrorId = 'SOM-APP-099';
export const ACL_DENIED_ID: CommandErrorId = 'SOM-ACL-001';

export interface CommandErrorWire {
  id: string;
  code: string;
  message: string;
  detail?: string;
  incident_id: string;
  expected: boolean;
}

export class CommandError extends Error {
  readonly id: CommandErrorId;
  readonly code: string;
  readonly detail?: string;
  /** Empty for expected outcomes: they never create an incident. */
  readonly incident_id: string;
  readonly expected: boolean;
  readonly cmd: string;
  readonly corr?: string;
  constructor(cmd: string, wire: CommandErrorWire, corr?: string) {
    super(wire.message);
    this.name = 'CommandError';
    this.id = wire.id as CommandErrorId;
    this.code = wire.code;
    this.detail = wire.detail;
    this.incident_id = wire.incident_id;
    this.expected = wire.expected;
    this.cmd = cmd;
    this.corr = corr;
  }
}

export function isCommandError(e: unknown): e is CommandError {
  return e instanceof CommandError;
}

export interface InvokeOpts { corr?: string; window?: string }

type Rest<N extends CommandName> = N extends keyof CommandContracts
  ? CommandContracts[N]['args'] extends undefined
    ? [args?: undefined, opts?: InvokeOpts]
    : [args: CommandContracts[N]['args'], opts?: InvokeOpts]
  : [args?: Record<string, unknown>, opts?: InvokeOpts];
type Result<N extends CommandName> = N extends keyof CommandContracts ? CommandContracts[N]['result'] : unknown;

/** Receives boundary facts the logger (log.ts, D1-B) turns into events. invokeCmd itself never logs. */
export interface CommandReporter {
  /** ACL/capability denial. Already rate-limited to 1/min per cmd+window. */
  aclDenied(info: { cmd: string; window: string; message: string }): void;
}
let reporter: CommandReporter = { aclDenied() {} };
export function setCommandReporter(r: CommandReporter): void { reporter = r; }

const legacyCounts: Record<string, number> = {};
export function getLegacyUntypedCounts(): Readonly<Record<string, number>> { return { ...legacyCounts }; }

type Transport = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
let transport: Transport = (name, args) => invoke(name, args);
let clock: () => number = () => Date.now();
const aclSeen = new Map<string, number>();
const ACL_WINDOW_MS = 60_000;

/** Test seams: swap the IPC transport/clock, reset counters. Not for app code. */
export const __testing = {
  setTransport(t: Transport | null) { transport = t ?? ((n, a) => invoke(n, a)); },
  setClock(c: (() => number) | null) { clock = c ?? (() => Date.now()); },
  reset() {
    for (const k of Object.keys(legacyCounts)) delete legacyCounts[k];
    aclSeen.clear();
    reporter = { aclDenied() {} };
  },
};

const ACL_RE = /not allowed|not found in acl/i;

function currentWindowLabel(opts?: InvokeOpts): string {
  if (opts?.window) return opts.window;
  const meta = (globalThis as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__;
  return meta?.metadata?.currentWindow?.label ?? 'unknown';
}

function isWire(x: unknown): x is CommandErrorWire {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && /^SOM-[A-Z]+-\d+$/.test(o.id) && typeof o.code === 'string'
    && typeof o.message === 'string' && typeof o.expected === 'boolean'
    && (typeof o.incident_id === 'string')
    && (o.detail === undefined || o.detail === null || typeof o.detail === 'string');
}

function normalize(name: string, raw: unknown, opts?: InvokeOpts): CommandError {
  if (isWire(raw)) {
    const w = raw as CommandErrorWire;
    return new CommandError(name, { ...w, detail: w.detail ?? undefined }, opts?.corr);
  }
  const text = typeof raw === 'string' ? raw
    : raw instanceof Error ? raw.message
    : typeof raw === 'object' && raw !== null && typeof (raw as { message?: unknown }).message === 'string' ? (raw as { message: string }).message
    : 'Command failed';
  if (ACL_RE.test(text)) {
    const window = currentWindowLabel(opts);
    const key = `${name}\u0000${window}`;
    const now = clock();
    const last = aclSeen.get(key);
    if (last === undefined || now - last >= ACL_WINDOW_MS) {
      aclSeen.set(key, now);
      reporter.aclDenied({ cmd: name, window, message: text });
    }
    return new CommandError(name, { id: ACL_DENIED_ID, code: 'acl_denied', message: text, incident_id: '', expected: false }, opts?.corr);
  }
  legacyCounts[name] = (legacyCounts[name] ?? 0) + 1;
  const legacyCode = typeof raw === 'object' && raw !== null && typeof (raw as { code?: unknown }).code === 'string'
    ? (raw as { code: string }).code : 'legacy_untyped';
  return new CommandError(name, { id: LEGACY_UNTYPED_ID, code: legacyCode, message: text, incident_id: '', expected: false }, opts?.corr);
}

/** Calls a Tauri command. `args` use JS camelCase keys (Rust snake_case params are mapped by Tauri). */
export async function invokeCmd<N extends CommandName>(name: N, ...rest: Rest<N>): Promise<Result<N>> {
  const [args, opts] = rest as [Record<string, unknown> | undefined, InvokeOpts | undefined];
  try {
    return (await transport(name, args)) as Result<N>;
  } catch (raw) {
    throw normalize(name, raw, opts);
  }
}
