import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { COMMAND_ARGS, COMMAND_META, COMMAND_NAMES, type CommandName } from '../generated/commandNames';
import {
  __testing, CommandError, getLegacyUntypedCounts, invokeCmd, isCommandError, setCommandReporter,
} from './invokeCmd';

type Call = { name: string; args?: Record<string, unknown> };
let calls: Call[] = [];
let now = 0;

beforeEach(() => {
  __testing.reset();
  calls = [];
  now = 1_000_000;
  __testing.setClock(() => now);
});
afterEach(() => __testing.setTransport(null));

const sample = (key: string): unknown => (key.toLowerCase().includes('id') ? 'id-1' : 'v');

describe('invokeCmd: one mock test per command', () => {
  for (const name of COMMAND_NAMES) {
    it(`${name}: camelCase args out, result through, typed failure`, async () => {
      const args = Object.fromEntries(COMMAND_ARGS[name].map((k) => [k, sample(k)]));
      __testing.setTransport(async (n, a) => { calls.push({ name: n, args: a }); return { ok: n }; });
      const hasArgs = COMMAND_ARGS[name].length > 0;
      const res = await (invokeCmd as (n: CommandName, a?: Record<string, unknown>) => Promise<unknown>)(name, hasArgs ? args : undefined);
      assert.deepEqual(res, { ok: name });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, name);
      for (const key of Object.keys(calls[0].args ?? {})) {
        assert.ok(!key.includes('_'), `${name} sends snake_case key ${key}`);
        assert.ok(COMMAND_ARGS[name].includes(key), `${name} sends undeclared key ${key}`);
      }
      if (!COMMAND_META[name].raw) assert.deepEqual(Object.keys(calls[0].args ?? {}).sort(), [...COMMAND_ARGS[name]].sort());

      const wire = { id: 'SOM-FS-006', code: 'locked', message: 'Locked', incident_id: '', expected: true };
      __testing.setTransport(async () => { throw wire; });
      await assert.rejects(() => (invokeCmd as (n: CommandName) => Promise<unknown>)(name), (e: unknown) => {
        assert.ok(isCommandError(e));
        const ce = e as CommandError;
        assert.equal(ce.id, 'SOM-FS-006');
        assert.equal(ce.cmd, name);
        assert.equal(ce.expected, true);
        return true;
      });
    });
  }
});

const fail = async (p: Promise<unknown>): Promise<CommandError> => {
  try { await p; } catch (e) { return e as CommandError; }
  throw new Error('expected rejection');
};
type WithOpts = (n: CommandName, a: undefined, o: { window?: string; corr?: string }) => Promise<unknown>;

describe('invokeCmd: error normalization', () => {
  const run = (cmd: CommandName = 'read_file') => fail((invokeCmd as (n: CommandName) => Promise<unknown>)(cmd));

  it('keeps the full AppCommandError wire shape', async () => {
    const wire = { id: 'SOM-APP-002', code: 'item_failed', message: 'm', detail: 'd', incident_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', expected: false };
    __testing.setTransport(async () => { throw wire; });
    const e = await run('claim_open_request');
    assert.deepEqual({ id: e.id, code: e.code, message: e.message, detail: e.detail, incident_id: e.incident_id, expected: e.expected },
      { id: wire.id, code: wire.code, message: wire.message, detail: wire.detail, incident_id: wire.incident_id, expected: wire.expected });
  });
  it('treats null detail from serde as absent', async () => {
    __testing.setTransport(async () => { throw { id: 'SOM-FS-006', code: 'locked', message: 'm', detail: null, incident_id: '', expected: true }; });
    assert.equal((await run()).detail, undefined);
  });
  it('maps strings to SOM-APP-099 and counts them per command', async () => {
    __testing.setTransport(async () => { throw 'boom'; });
    const e = await run('save_file');
    assert.equal(e.id, 'SOM-APP-099');
    assert.equal(e.message, 'boom');
    await run('save_file');
    await run('read_file');
    assert.deepEqual(getLegacyUntypedCounts(), { save_file: 2, read_file: 1 });
  });
  it('maps legacy { code, message } (old AppError) to SOM-APP-099 and keeps the code', async () => {
    __testing.setTransport(async () => { throw { code: 'conflict', message: 'changed' }; });
    const e = await run('save_file');
    assert.equal(e.id, 'SOM-APP-099');
    assert.equal(e.code, 'conflict');
  });
  it('rejects an id that is not a registry id', async () => {
    __testing.setTransport(async () => { throw { id: 'nope', code: 'x', message: 'm', incident_id: '', expected: false }; });
    assert.equal((await run()).id, 'SOM-APP-099');
  });
  it('maps Error instances', async () => {
    __testing.setTransport(async () => { throw new Error('kaput'); });
    assert.equal((await run()).message, 'kaput');
  });
  it('reports ACL denials once per minute per cmd+window, with SOM-ACL-001', async () => {
    const seen: string[] = [];
    setCommandReporter({ aclDenied: (i) => seen.push(`${i.cmd}@${i.window}`) });
    __testing.setTransport(async () => { throw 'read_file not allowed on window "ext"'; });
    const e = await fail((invokeCmd as WithOpts)('read_file', undefined, { window: 'ext' }));
    assert.equal(e.id, 'SOM-ACL-001');
    const again = () => (invokeCmd as WithOpts)('read_file', undefined, { window: 'ext' }).catch(() => undefined);
    await again();
    assert.equal(seen.length, 1);
    now += 61_000;
    await again();
    assert.equal(seen.length, 2);
    await (invokeCmd as WithOpts)('list_files', undefined, { window: 'ext' }).catch(() => undefined);
    assert.equal(seen.length, 3);
    assert.equal(Object.keys(getLegacyUntypedCounts()).length, 0);
  });
  it('detects "not found in ACL" text', async () => {
    __testing.setTransport(async () => { throw 'Command foo not found in ACL'; });
    assert.equal((await run()).id, 'SOM-ACL-001');
  });
  it('passes corr through to the error', async () => {
    __testing.setTransport(async () => { throw 'x'; });
    const e = await fail((invokeCmd as WithOpts)('read_file', undefined, { corr: 'req-1' }));
    assert.equal(e.corr, 'req-1');
  });
});

describe('typed contracts (compile-time + runtime)', () => {
  it('typed call sites compile and return the DTO', async () => {
    __testing.setTransport(async () => ({ accepted: [0], retryTokens: [{ ordinal: 1, token: 't', expiresAt: 1_700_000_060_000 }] }));
    const r = await invokeCmd('ack_open_request', { requestId: 'r', outcomes: [{ ordinal: 0, status: 'opened' }] }, { corr: 'r' });
    assert.deepEqual(r.accepted, [0]);
    assert.equal(r.retryTokens[0].expiresAt, 1_700_000_060_000);
    __testing.setTransport(async () => ({ allowUnc: false }));
    assert.equal((await invokeCmd('get_intake_policy')).allowUnc, false);
    // @ts-expect-error missing required arg
    await invokeCmd('claim_open_request').catch(() => undefined);
    // @ts-expect-error snake_case key is not part of the JS contract
    await invokeCmd('claim_open_request', { request_id: 'x' }).catch(() => undefined);
  });
  it('the 8 intake commands and the diagnostics commands are wrapped', () => {
    const wrapped = COMMAND_NAMES.filter((n) => COMMAND_META[n].wrapped).sort();
    assert.deepEqual(wrapped, [
      'ack_open_request', 'build_diagnostic_zip', 'claim_open_request', 'delete_crash_reports', 'discard_diagnostic_snapshot',
      'drain_open_requests', 'get_intake_policy', 'list_crash_reports', 'mark_crash_reports_reviewed', 'read_by_grant',
      'record_frontend_fatal', 'release_candidate', 'retry_open_item', 'set_intake_policy', 'write_diagnostic_zip',
    ]);
    for (const n of wrapped) assert.ok(['intake', 'diagnostics'].includes(COMMAND_META[n].domain));
    for (const n of wrapped.filter((x) => COMMAND_META[x].domain === 'intake')) assert.equal(COMMAND_META[n].boundary, 'B7');
  });
  it('write_diagnostic_zip takes only snapshotId (no grant/path)', () => {
    assert.deepEqual(COMMAND_ARGS.write_diagnostic_zip, ['snapshotId']);
  });
});
