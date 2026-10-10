import { invoke, isTauri } from '@tauri-apps/api/core';
import { getRing, versionInfo, redactText, toSafeLogEvent } from './log';

/** Apply the shared export projection, then reject malformed identity fields. */
export function reportEvent(value: unknown): Record<string, unknown> | null {
  const e = toSafeLogEvent(value);
  if (!e || !Number.isSafeInteger(e.seq) || e.seq < 0 || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(e.ts)) return null;
  return e as unknown as Record<string, unknown>;
}
export function mergeReportEntries(native: readonly unknown[], renderer: readonly unknown[]): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const item of [...native, ...renderer]) {
    const e = reportEvent(item);
    if (e) merged.set(JSON.stringify([e.session, e.source, e.seq, e.window ?? null]), e);
  }
  return [...merged.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
export interface ReportSources {
  nativeTail: (() => Promise<string>) | null;
  renderer: () => readonly unknown[];
  header: () => string;
  now: () => string;
}
/** Best-effort native collection never throws away the renderer ring on rejection. */
export async function collectErrorReport(lines: number, sources: ReportSources): Promise<string> {
  const limit = Math.max(1, Math.min(500, Number.isFinite(lines) ? Math.floor(lines) : 150));
  let health = sources.nativeTail ? 'complete' : 'unavailable';
  let native: unknown[] = [];
  if (sources.nativeTail) {
    try { native = (await sources.nativeTail()).split('\n').flatMap(line => { try { return [JSON.parse(line) as unknown]; } catch { return []; } }); }
    catch { health = 'partial'; }
  }
  const entries = mergeReportEntries(native, sources.renderer()).slice(-limit);
  return redactText(`${sources.header()}\nCreated ${sources.now()}\nCollection: ${health}\nLegacy free-text entries omitted.\n\n--- last ${limit} log lines ---\n${entries.map(e => JSON.stringify(e)).join('\n')}\n`);
}
export function buildErrorReport(lines = 150): Promise<string> {
  return collectErrorReport(lines, {
    nativeTail: isTauri() ? () => invoke<string>('log_tail', { lines: Math.max(1, Math.min(500, Math.floor(lines) || 150)) }) : null,
    renderer: getRing,
    // A user-agent can contain local extensions/device details; export only app identity.
    header: () => versionInfo().split(' · ')[0],
    now: () => new Date().toISOString(),
  });
}
