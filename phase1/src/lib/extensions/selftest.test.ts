import test from 'node:test';
import assert from 'node:assert/strict';
import {runExtSelftest, evaluateReport, RAW_WORKER_PROBE, PANEL_PROBE_SCRIPT, PROBE_EXTENSION_CODE, type ProbeReport, type SelftestPorts} from './selftest';

const good = (over: Partial<ProbeReport> = {}): ProbeReport => ({started: true, api_roundtrip: true, network_blocked: true, dom_blocked: true, evalWorks: true,
  attempts: {fetch: 'blocked', xhr: 'blocked'}, violations: [{directive: 'connect-src', blocked: 'https://evil.invalid/fetch'}], ...over});
const navOk = {targets: {a: {navigated: true, api_after_navigation_denied: true}, b: {navigated: false, api_after_navigation_denied: false}}};
const mk = (o: Partial<SelftestPorts> = {}, exits: number[] = [], files: Record<string, string> = {}): SelftestPorts => ({platform: 'test', appVersion: '0', runWorkerProbe: async () => good(), runPanelProbe: async () => good({evalWorks: undefined}), runNavigationProbe: async () => navOk,
  writeFile: async (p, c) => { files[p] = c; }, exit: c => { exits.push(c); }, ...o});

test('probe sources are syntactically valid JS', () => {
  new Function(RAW_WORKER_PROBE('https://evil.invalid'));
  new Function(PANEL_PROBE_SCRIPT('https://evil.invalid'));
  new (Object.getPrototypeOf(async function () {}).constructor)('somnia', PROBE_EXTENSION_CODE('https://evil.invalid'));
});
test('disabled without env var: returns null, writes nothing, never exits', async () => {
  const exits: number[] = [], files = {};
  assert.equal(await runExtSelftest({}, mk({}, exits, files)), null);
  assert.deepEqual(exits, []); assert.deepEqual(files, {});
});
test('all green: writes out.json and exits 0', async () => {
  const exits: number[] = [], files: Record<string, string> = {};
  const r = await runExtSelftest({SOMNIA_EXT_SELFTEST: 'out.json'}, mk({}, exits, files));
  assert.equal(r!.ok, true); assert.deepEqual(exits, [0]); assert.equal(JSON.parse(files['out.json']!).ok, true);
});
test('each failure mode fails the run', async () => {
  const cases: Record<string, Partial<SelftestPorts>> = {
    'worker did not start': {runWorkerProbe: async () => good({started: false})},
    'api roundtrip': {runPanelProbe: async () => good({api_roundtrip: false})},
    'network open': {runWorkerProbe: async () => good({network_blocked: false, attempts: {fetch: 'open'}})},
    'dom reachable': {runPanelProbe: async () => good({dom_blocked: false})},
    'eval blocked': {runWorkerProbe: async () => good({evalWorks: false})},
    'inline blocked': {runPanelProbe: async () => good({violations: [{directive: 'script-src-elem', blocked: 'inline'}]})},
    'nav keeps authority': {runNavigationProbe: async () => ({targets: {x: {navigated: true, api_after_navigation_denied: false}}})},
    'probe throws': {runWorkerProbe: async () => { throw new Error('boom'); }},
    'no nav report': {runNavigationProbe: async () => { throw new Error('x'); }},
  };
  for (const [name, o] of Object.entries(cases)) {
    const exits: number[] = [];
    const r = await runExtSelftest({SOMNIA_EXT_SELFTEST: 'o'}, mk(o, exits));
    assert.equal(r!.ok, false, name); assert.deepEqual(exits, [1], name);
  }
});
test('unwritable output exits 2', async () => {
  const exits: number[] = [];
  await runExtSelftest({SOMNIA_EXT_SELFTEST: 'o'}, mk({writeFile: async () => { throw new Error('ro'); }}, exits));
  assert.deepEqual(exits, [2]);
});
test('a refused navigation that did not navigate is not a failure', () => {
  assert.deepEqual(evaluateReport({schema: 1, platform: 'x', app_version: '', csp_mode: 'prod', started_at: '', worker: good(), panel: good(), navigation: {targets: {x: {navigated: false, api_after_navigation_denied: false}}}}), []);
});
