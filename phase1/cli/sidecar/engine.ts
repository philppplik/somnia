// Task-engine sidecar entry ("somnia.task-engine/1"). Bundled to engine.mjs by build.mjs and started by `somnia run`.
import readline from 'node:readline';
import { ENGINE_CONTRACT, isTerminal } from './contract';
import type { EngineOut, EngineTask } from './contract';
import { ConfigError, resolveEngine } from './config';
import { runTask } from './engineCore';

const write = (o: EngineOut) => process.stdout.write(JSON.stringify(o) + '\n');
let terminal = false;
const emit = (e: EngineOut) => { if (terminal) return; if (isTerminal(e)) terminal = true; write(e); };

function parseStart(line: string): EngineTask | string {
  let m: { op?: string; contract?: string; task?: Partial<EngineTask> };
  try { m = JSON.parse(line); } catch { return 'first line is not JSON'; }
  if (m.op !== 'start') return 'expected a start message first';
  if (m.contract !== ENGINE_CONTRACT) return `unsupported contract ${String(m.contract).slice(0, 40)}; this engine speaks ${ENGINE_CONTRACT}`;
  const t = m.task;
  if (!t || typeof t.taskId !== 'string' || typeof t.prompt !== 'string' || !t.prompt.trim() || typeof t.cwd !== 'string' || !Array.isArray(t.allowedRoots)) return 'malformed task';
  return { taskId: t.taskId, prompt: t.prompt, cwd: t.cwd, allowedRoots: t.allowedRoots.filter((r): r is string => typeof r === 'string'), bare: t.bare === true, studio: t.studio ?? null, maxTokens: t.maxTokens ?? null, maxCost: t.maxCost ?? null };
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin });
  const abort = new AbortController();
  let started = false;
  rl.on('line', line => {
    if (!line.trim()) return;
    if (started) {
      try { if (JSON.parse(line).op === 'cancel') { abort.abort(); setTimeout(() => process.exit(0), 50); } } catch { /* ignore noise */ }
      return;
    }
    started = true;
    const task = parseStart(line);
    if (typeof task === 'string') { emit({ event: 'failed', message: task, code: 'config', retryable: false }); process.exit(1); }
    void (async () => {
      try {
        const eng = resolveEngine(process.env);
        const t = process.env.SOMNIA_ENGINE_TIMEOUT_MS ? Number(process.env.SOMNIA_ENGINE_TIMEOUT_MS) : undefined;
        await runTask(task, { ...eng, emit, signal: abort.signal, timeoutMs: t && t > 0 ? t : undefined });
      } catch (e) {
        if (e instanceof ConfigError) emit({ event: 'failed', message: e.message, code: e.code, retryable: false });
        else emit({ event: 'failed', message: 'engine crashed', code: 'internal', retryable: false });
      }
      if (!terminal && !abort.signal.aborted) emit({ event: 'failed', message: 'engine ended without a result', code: 'internal', retryable: false });
      process.exit(terminal ? 0 : 1);
    })();
  });
  rl.on('close', () => { if (!started) process.exit(1); abort.abort(); });
}
void main();
