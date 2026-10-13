// Contract tests for the task-engine sidecar: the real bundled engine.mjs talks to a scripted loopback Ollama.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceAccess, ConflictError, ScopeError } from './workspace';
import { composePrompt, summarizeCall, answersSection } from './engineCore';
import type { EngineOut } from './contract';

const here = path.dirname(fileURLToPath(import.meta.url));
type Step = { chunks?: object[]; stall?: boolean; status?: number; raw?: string };
let server: http.Server; let port = 0;
let script: Step[] = []; let requests: any[] = [];

before(async () => {
  execFileSync(process.execPath, [path.join(here, 'build.mjs')], { stdio: 'pipe' });
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      if (req.url !== '/api/chat') { res.writeHead(404).end(); return; }
      requests.push(JSON.parse(body));
      const step = script.shift() ?? { chunks: [{ message: { content: 'fallback' }, done: true }] };
      if (step.status) { res.writeHead(step.status).end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      if (step.raw !== undefined) { res.end(step.raw); return; }
      for (const c of step.chunks ?? []) res.write(JSON.stringify(c) + '\n');
      if (!step.stall) res.end();
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});
after(() => { server.closeAllConnections(); server.close(); });

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'somnia-eng-'));
const toolCall = (name: string, args: object) => ({ message: { content: '', tool_calls: [{ function: { name, arguments: args } }] }, done: true, prompt_eval_count: 10, eval_count: 5 });
const finalText = (t: string, usage = { prompt_eval_count: 20, eval_count: 7 }) => ({ message: { content: t }, done: true, done_reason: 'stop', ...usage });

interface Result { events: EngineOut[]; code: number | null; stdoutNoise: string[] }
function run(cwd: string, over: Record<string, unknown> = {}, env: Record<string, string> = {}, cancelAfterMs?: number): Promise<Result> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(here, 'engine.mjs')], {
      cwd, stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', SOMNIA_ENGINE_PROVIDER: 'ollama', SOMNIA_ENGINE_MODEL: 'test-model', SOMNIA_ENGINE_OLLAMA_URL: `http://127.0.0.1:${port}`, ...env },
    });
    const task = { taskId: 't-test', prompt: 'make the page', cwd, allowedRoots: ['.'], bare: false, studio: null, maxTokens: null, maxCost: null, ...over };
    child.stdin.write(JSON.stringify({ op: 'start', contract: 'somnia.task-engine/1', task }) + '\n');
    let out = '';
    child.stdout.on('data', d => (out += d));
    if (cancelAfterMs) setTimeout(() => child.stdin.write('{"op":"cancel"}\n'), cancelAfterMs);
    child.on('close', code => {
      const events: EngineOut[] = []; const noise: string[] = [];
      for (const l of out.split('\n').filter(Boolean)) { try { events.push(JSON.parse(l)); } catch { noise.push(l); } }
      resolve({ events, code, stdoutNoise: noise });
    });
  });
}
const kinds = (r: Result) => r.events.map(e => e.event);
const terminals = (r: Result) => r.events.filter(e => ['done', 'failed', 'needs-input'].includes(e.event));
const reset = (s: (Step | object)[]) => { script = s.map(x => ('chunks' in x || 'raw' in x || 'status' in x ? x : { chunks: [x] }) as Step); requests = []; };

test('happy path: tool_call/tool_result/model/usage map, file is written, one terminal event', async () => {
  const cwd = tmp();
  fs.mkdirSync(path.join(cwd, 'site')); fs.writeFileSync(path.join(cwd, 'site/index.html'), '<h1>old</h1>\n');
  reset([toolCall('read_file', { path: 'site/index.html' }), toolCall('write_file', { path: 'site/index.html', content: '<h1>new</h1>\n' }), finalText('Updated the heading.\nAll done.')]);
  const r = await run(cwd);
  assert.equal(r.code, 0); assert.deepEqual(r.stdoutNoise, []);
  assert.equal(terminals(r).length, 1);
  const k = kinds(r);
  assert.equal(k[0], 'model'); assert.ok(k.indexOf('plan') > 0);
  const calls = r.events.filter(e => e.event === 'tool-call') as Extract<EngineOut, { event: 'tool-call' }>[];
  assert.deepEqual(calls.map(c => c.name), ['read_file', 'write_file']);
  assert.equal(calls[0].summary, 'site/index.html');
  assert.match(calls[1].summary, /^site\/index\.html \(\d+ chars\)$/);
  assert.ok(!JSON.stringify(r.events).includes('<h1>new</h1>'), 'file content is never forwarded');
  const results = r.events.filter(e => e.event === 'tool-result') as Extract<EngineOut, { event: 'tool-result' }>[];
  assert.deepEqual(results.map(x => [x.id, x.status]), calls.map(c => [c.id, 'ok']));
  const usage = r.events.filter(e => e.event === 'usage') as Extract<EngineOut, { event: 'usage' }>[];
  assert.equal(usage.at(-1)!.tokens, 15 + 15 + 27); assert.equal(usage.at(-1)!.cost, null);
  const m = r.events[0] as Extract<EngineOut, { event: 'model' }>;
  assert.deepEqual([m.provider, m.model], ['ollama', 'test-model']);
  const done = terminals(r)[0] as Extract<EngineOut, { event: 'done' }>;
  assert.equal(done.event, 'done'); assert.equal(done.tokens, 57); assert.match(done.summary, /Changed: site\/index\.html/);
  assert.equal(fs.readFileSync(path.join(cwd, 'site/index.html'), 'utf8'), '<h1>new</h1>\n');
  assert.ok(r.events.some(e => e.event === 'progress' && e.text.includes('Updated the heading.')));
});

test('--bare drops project notes and studio hint; default includes them', async () => {
  const cwd = tmp(); fs.writeFileSync(path.join(cwd, 'AGENTS.md'), 'Use tabs. NOTE-MARKER');
  reset([finalText('ok')]);
  const normal = await run(cwd, { studio: 'code' });
  const first = JSON.stringify(requests[0].messages);
  assert.match(first, /NOTE-MARKER/); assert.match(first, /Active studio: code/);
  assert.ok(normal.events.some(e => e.event === 'plan' && /project notes loaded/.test(e.text)));
  reset([finalText('ok')]);
  const bare = await run(cwd, { studio: 'code', bare: true });
  const bareMsgs = JSON.stringify(requests[0].messages);
  assert.ok(!bareMsgs.includes('NOTE-MARKER') && !bareMsgs.includes('Active studio'));
  assert.ok(bare.events.some(e => e.event === 'plan' && /bare run/.test(e.text)));
  assert.equal((terminals(bare)[0] as any).event, 'done');
});

test('scope: writes outside allowed roots fail as tool errors and nothing reaches disk', async () => {
  const cwd = tmp(); fs.mkdirSync(path.join(cwd, 'site'));
  reset([toolCall('write_file', { path: 'other.html', content: 'x' }), finalText('could not')]);
  const r = await run(cwd, { allowedRoots: ['site'] });
  const res = r.events.find(e => e.event === 'tool-result') as any;
  assert.equal(res.status, 'error'); assert.ok(!fs.existsSync(path.join(cwd, 'other.html')));
  assert.equal(terminals(r)[0].event, 'done');
  assert.equal((terminals(r)[0] as any).summary, 'could not');
});

test('blocked paths (.env, ..) are refused', async () => {
  const cwd = tmp();
  reset([toolCall('write_file', { path: '.env', content: 'x' }), toolCall('write_file', { path: '../x.html', content: 'x' }), finalText('done')]);
  const r = await run(cwd);
  const res = r.events.filter(e => e.event === 'tool-result') as any[];
  assert.deepEqual(res.map(x => x.status), ['error', 'error']);
  assert.ok(!fs.existsSync(path.join(cwd, '.env')) && !fs.existsSync(path.join(cwd, '..', 'x.html')));
});

test('error path: malformed provider stream is a typed failed event, nothing written', async () => {
  const cwd = tmp();
  reset([toolCall('write_file', { path: 'a.html', content: 'x' }), { raw: 'not json\n' }]);
  const r = await run(cwd);
  const t = terminals(r) as any[];
  assert.equal(t.length, 1); assert.equal(t[0].event, 'failed');
  assert.ok(['provider', 'internal'].includes(t[0].code), t[0].code);
  assert.ok(!fs.existsSync(path.join(cwd, 'a.html')));
  assert.equal(r.code, 0);
});

test('error path: unreachable provider and HTTP 500 fail cleanly', async () => {
  const cwd = tmp();
  const r = await run(cwd, {}, { SOMNIA_ENGINE_OLLAMA_URL: 'http://127.0.0.1:1' });
  assert.equal((terminals(r)[0] as any).event, 'failed');
});

test('config errors: no provider, unsupported provider, missing key, missing consent', async () => {
  const cwd = tmp();
  const none = await run(cwd, {}, { SOMNIA_ENGINE_PROVIDER: '' });
  assert.equal((terminals(none)[0] as any).code, 'config');
  const bad = await run(cwd, {}, { SOMNIA_ENGINE_PROVIDER: 'nope' });
  assert.equal((terminals(bad)[0] as any).code, 'config');
  const noConsent = await run(cwd, {}, { SOMNIA_ENGINE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k-not-real' });
  assert.equal((terminals(noConsent)[0] as any).code, 'consent');
  const noKey = await run(cwd, {}, { SOMNIA_ENGINE_PROVIDER: 'claude', SOMNIA_ENGINE_CLOUD_CONSENT: '1' });
  assert.equal((terminals(noKey)[0] as any).code, 'auth');
  assert.ok(!JSON.stringify([none, bad, noConsent, noKey]).includes('k-not-real'));
});

test('bad start message is a typed failure', async () => {
  const child = spawn(process.execPath, [path.join(here, 'engine.mjs')], { stdio: ['pipe', 'pipe', 'ignore'] });
  child.stdin.write('{"op":"start","contract":"somnia.task-engine/9","task":{}}\n');
  let out = ''; child.stdout.on('data', d => (out += d));
  await new Promise(r => child.on('close', r));
  const ev = JSON.parse(out.trim().split('\n')[0]);
  assert.equal(ev.event, 'failed'); assert.match(ev.message, /unsupported contract/);
});

test('budget: token budget exceeded aborts with code budget and writes nothing', async () => {
  const cwd = tmp();
  reset([toolCall('write_file', { path: 'a.html', content: 'x' }), finalText('never')]);
  const r = await run(cwd, { maxTokens: 10 });
  const t = terminals(r)[0] as any;
  assert.equal(t.event, 'failed'); assert.equal(t.code, 'budget');
  assert.ok(!fs.existsSync(path.join(cwd, 'a.html')));
});

test('abort: cancel op stops a stalled run, exits, and emits no terminal event', async () => {
  const cwd = tmp();
  reset([{ chunks: [{ message: { content: 'thinking' } }], stall: true }]);
  const t0 = Date.now();
  const r = await run(cwd, {}, {}, 600);
  assert.ok(Date.now() - t0 < 5000);
  assert.equal(terminals(r).length, 0);
  assert.equal(fs.readdirSync(cwd).length, 0);
});

test('workspace: symlinks are never read, apply rejects scope escapes and stale files', () => {
  const cwd = tmp(); const outside = tmp();
  fs.writeFileSync(path.join(outside, 'secret.html'), 'S');
  fs.symlinkSync(path.join(outside, 'secret.html'), path.join(cwd, 'link.html'));
  fs.writeFileSync(path.join(cwd, 'a.html'), 'A');
  const ws = new WorkspaceAccess(cwd, ['.'], 'p');
  assert.deepEqual(Object.keys(ws.files()), ['a.html']);
  assert.throws(() => ws.apply([{ path: 'link.html', before: null, after: 'x' }]), ScopeError);
  assert.throws(() => ws.apply([{ path: 'a.html', before: 'OLD', after: 'x' }]), ConflictError);
  assert.equal(fs.readFileSync(path.join(cwd, 'a.html'), 'utf8'), 'A');
  assert.throws(() => new WorkspaceAccess(cwd, ['../x'], 'p'), ScopeError);
  const ws2 = new WorkspaceAccess(cwd, ['sub'], 'p');
  assert.throws(() => ws2.apply([{ path: 'a.html', before: 'A', after: 'x' }]), ScopeError);
  ws.apply([{ path: 'new/dir/b.html', before: null, after: 'B' }]);
  assert.equal(fs.readFileSync(path.join(cwd, 'new/dir/b.html'), 'utf8'), 'B');
});

test('summaries never contain content', () => {
  assert.equal(summarizeCall({ id: '1', name: 'write_file', arguments: JSON.stringify({ path: 'a.html', content: 'SECRET'.repeat(10) }) }), 'a.html (60 chars)');
  assert.equal(composePrompt({ taskId: 't', prompt: 'p', cwd: '/nonexistent', allowedRoots: ['.'], bare: false }).prompt, 'Task:\np');
});

test('task.answers reach the model prompt (also with --bare); malformed entries are dropped and clipped', async () => {
  const cwd = tmp();
  reset([finalText('ok')]);
  const r = await run(cwd, { answers: [{ question: 'Which page?', answer: 'the pricing page' }, { question: 7, answer: 'x' }, { question: 'q', answer: '   ' }, 'junk'] });
  const msg = JSON.stringify(requests[0].messages);
  assert.match(msg, /Which page\?/); assert.match(msg, /the pricing page/);
  assert.ok(!msg.includes('junk'));
  assert.equal((terminals(r)[0] as any).event, 'done');
  reset([finalText('ok')]);
  await run(cwd, { bare: true, answers: [{ question: 'Q', answer: 'A'.repeat(9000) }] });
  const bare = JSON.stringify(requests[0].messages);
  assert.match(bare, /Answer: A+/);
  assert.ok(!bare.includes('A'.repeat(4001)), 'answer clipped to 4000 chars');
  reset([finalText('ok')]);
  await run(cwd, {});
  assert.ok(!JSON.stringify(requests[0].messages).includes('asked the user'), 'no answers, no section');
});

test('composePrompt without answers is unchanged; answersSection formats quoted user text', () => {
  assert.equal(composePrompt({ taskId: 't', prompt: 'p', cwd: '/nonexistent', allowedRoots: ['.'], bare: true, answers: [] }).prompt, 'p');
  assert.equal(answersSection(undefined), '');
  const s = answersSection([{ question: 'a\nb', answer: ' yes ' }]);
  assert.match(s, /1\. Question: a b\n   Answer: yes/);
});

test('model-written text is redacted: progress and the done summary never carry a secret the model repeats', async () => {
  const cwd = tmp();
  const secret = 'sk-live-ABCDEF0123456789';
  fs.writeFileSync(path.join(cwd, 'notes.txt'), `api_key=${secret}\n`);
  const text = `The key is ${secret}.\nAlso Authorization: Bearer ghp_abcdefghijklmnop1234 and password=hunter2hunter2\n${'x'.repeat(380)} ${secret}`;
  reset([toolCall('read_file', { path: 'notes.txt' }), finalText(text)]);
  const r = await run(cwd);
  assert.equal(r.code, 0);
  const dump = JSON.stringify(r.events);
  for (const leak of [secret, 'ghp_abcdefghijklmnop1234', 'hunter2hunter2', 'ABCDEF0123456789']) assert.ok(!dump.includes(leak), `leaked: ${leak}`);
  assert.ok(r.events.some(e => e.event === 'progress' && e.text.includes('[redacted]')), 'redaction marker present in progress');
  const done = terminals(r)[0] as Extract<EngineOut, { event: 'done' }>;
  assert.equal(done.event, 'done');
  assert.ok(done.summary.includes('[redacted]') && !done.summary.includes('sk-live'));
});
