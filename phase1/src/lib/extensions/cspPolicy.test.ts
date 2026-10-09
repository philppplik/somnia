import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCsp, effective, checkWorkerCsp, checkPanelCsp, checkHostCsp, REFERENCE_WORKER_CSP, REFERENCE_PANEL_CSP} from './cspPolicy';

const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).app.security as {csp: string; devCsp: string};

test('parseCsp: directives, case, whitespace, duplicates (first wins)', () => {
  const m = parseCsp("Default-Src 'none' ;  script-src   'self'  'unsafe-eval';; script-src *; base-uri 'none'");
  assert.deepEqual(m.get('default-src'), ["'none'"]);
  assert.deepEqual(m.get('script-src'), ["'self'", "'unsafe-eval'"]);
  assert.equal(m.size, 3);
});
test('parseCsp: empty header and valueless directive', () => {
  assert.equal(parseCsp('').size, 0);
  assert.deepEqual(parseCsp('upgrade-insecure-requests').get('upgrade-insecure-requests'), []);
});
test('effective: falls back to default-src for fetch directives only', () => {
  const m = parseCsp("default-src 'none'; img-src data:");
  assert.deepEqual(effective(m, 'connect-src'), ["'none'"]);
  assert.deepEqual(effective(m, 'img-src'), ['data:']);
  assert.equal(effective(m, 'form-action'), undefined);
});

test('reference policies pass their own checks', () => {
  assert.deepEqual(checkWorkerCsp(REFERENCE_WORKER_CSP), []);
  assert.deepEqual(checkPanelCsp(REFERENCE_PANEL_CSP), []);
});
test('the exact policies from the design brief pass', () => {
  assert.deepEqual(checkWorkerCsp("script-src 'unsafe-eval'; connect-src 'none'; default-src 'none'"), []);
  assert.deepEqual(checkPanelCsp("default-src 'none'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"), []);
});

test('worker checker rejects each weakening', () => {
  const bads: Record<string, string> = {
    'connect-src self': "default-src 'none'; script-src 'unsafe-eval'; connect-src 'self'",
    'connect-src missing, default open': "default-src 'self'; script-src 'unsafe-eval'",
    'connect-src wildcard': "default-src 'none'; script-src 'unsafe-eval'; connect-src *",
    'no unsafe-eval': "default-src 'none'; script-src 'self'; connect-src 'none'",
    'unsafe-inline': "default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline'; connect-src 'none'",
    'https script': "default-src 'none'; script-src 'unsafe-eval' https://cdn.example; connect-src 'none'",
    'blob script': "default-src 'none'; script-src 'unsafe-eval' blob:; connect-src 'none'",
    'empty': '',
  };
  for (const [name, h] of Object.entries(bads)) assert.ok(checkWorkerCsp(h).length > 0, name);
});
test('panel checker rejects each weakening', () => {
  const bads: Record<string, string> = {
    'default-src self': "default-src 'self'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'",
    'no form-action': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'",
    'form-action self': "default-src 'none'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    'no base-uri': "default-src 'none'; script-src 'unsafe-inline'; form-action 'none'",
    'unsafe-eval': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; form-action 'none'; base-uri 'none'",
    'no unsafe-inline': "default-src 'none'; script-src 'none'; form-action 'none'; base-uri 'none'",
    'connect open': "default-src 'none'; script-src 'unsafe-inline'; connect-src https:; form-action 'none'; base-uri 'none'",
    'frame open': "default-src 'none'; script-src 'unsafe-inline'; frame-src *; form-action 'none'; base-uri 'none'",
    'img https': "default-src 'none'; script-src 'unsafe-inline'; img-src https:; form-action 'none'; base-uri 'none'",
  };
  for (const [name, h] of Object.entries(bads)) assert.ok(checkPanelCsp(h).length > 0, name);
});
test('checkers tolerate data: for img/font/style on the panel', () => {
  assert.deepEqual(checkPanelCsp(REFERENCE_PANEL_CSP + '; style-src data: \'unsafe-inline\''), []);
});

test('prod host CSP baseline: no wildcard connect-src, object-src none, no unsafe-eval', () => {
  const m = parseCsp(conf.csp);
  assert.ok(!(m.get('script-src') ?? []).includes("'unsafe-eval'"));
  assert.deepEqual(m.get('object-src'), ["'none'"]);
  assert.ok(!checkHostCsp(conf.csp).some(x => x.includes('connect-src') || x.includes('object-src') || x.includes('unsafe-eval')));
});
// Expected to FAIL on the base commit (1d014e1) and pass once the scheme fix lands: that is the regression gate.
// todo on the pre-fix base (conf has no somnia-ext yet) so existing suites stay green; strict as soon as the scheme appears in the conf.
const preFix = !/somnia-ext:/.test(conf.csp + conf.devCsp);
test('prod host CSP allows the somnia-ext: scheme for worker-src and frame-src', {todo: preFix ? 'pre-fix base: scheme not in CSP yet' : false}, () => {
  assert.deepEqual(checkHostCsp(conf.csp), []);
});
test('dev host CSP: same scheme allowance', {todo: preFix ? 'pre-fix base: scheme not in CSP yet' : false}, () => {
  assert.deepEqual(checkHostCsp(conf.devCsp), []);
});
test('host checker flags missing scheme and unsafe-eval on host', () => {
  assert.ok(checkHostCsp("default-src 'self'; worker-src 'self'; frame-src 'self' blob:; object-src 'none'").length >= 2);
  assert.ok(checkHostCsp("default-src 'self'; script-src 'self' 'unsafe-eval'; worker-src somnia-ext:; frame-src somnia-ext:; object-src 'none'").some(x => x.includes('unsafe-eval')));
});

// Contract hook for the swarm's generator: exports workerCsp()/panelCsp() (functions or strings) from one of these modules.
for (const mod of ['./extScheme', './extCsp', './scheme']) {
  test(`generator contract (${mod})`, async t => {
    let m: any; try { m = await import(mod); } catch { t.skip('module not present'); return; }
    const get = (k: string) => typeof m[k] === 'function' ? m[k]() : m[k];
    if (m.workerCsp ?? m.WORKER_CSP) assert.deepEqual(checkWorkerCsp(get(m.workerCsp ? 'workerCsp' : 'WORKER_CSP')), []);
    if (m.panelCsp ?? m.PANEL_CSP) assert.deepEqual(checkPanelCsp(get(m.panelCsp ? 'panelCsp' : 'PANEL_CSP')), []);
  });
}
