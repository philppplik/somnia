import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign, createHash} from 'node:crypto';
import {verifySignedCatalog, SignedCatalogError, type CatalogState, type CatalogStateStore} from './signedCatalog.ts';

// Test keys are generated per run. No real signing key exists in this repo.
function key(id: string) {const {publicKey, privateKey} = generateKeyPairSync('ed25519'); const der = publicKey.export({type: 'spki', format: 'der'}); return {id, pub: new Uint8Array(der.subarray(der.length - 32)), priv: privateKey};}
const sig = (k: ReturnType<typeof key>, p: string) => sign(null, Buffer.from(p), k.priv).toString('base64');
const H = createHash('sha256').update('x').digest('hex');
const entry = {id: 'acme.palette', name: 'Palette', version: '1.0.0', author: 'a', description: 'd', repo: 'https://github.com/philppplik/somnia-extensions', download: 'https://raw.githubusercontent.com/philppplik/somnia/main/p.zip', sha256: H, apiVersion: 1, permissions: []};
const NOW = Date.parse('2026-10-13T12:00:00Z');
const doc = (o: Record<string, unknown> = {}) => JSON.stringify({schemaVersion: 2, serial: 5, issuedAt: '2026-10-12T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z', keyId: 'k1', extensions: [entry], revoked: [], ...o});
const mem = (s: CatalogState | null = null): CatalogStateStore & {s: CatalogState | null} => ({s, async read() {return this.s;}, async write(v) {this.s = v;}});
const code = async (p: Promise<unknown>) => {try {await p;} catch (e) {return (e as SignedCatalogError).code;} return 'ok';};
const k1 = key('k1'), k2 = key('k2'), evil = key('k1');
const keys = [{keyId: 'k1', publicKey: k1.pub}, {keyId: 'k2', publicKey: k2.pub}];
const run = (payload: string, signer: ReturnType<typeof key>, st = mem(), ks = keys) => verifySignedCatalog({payload, signature: sig(signer, payload)}, {keys: ks, state: st, now: () => NOW});

test('valid index verifies and persists serial', async () => {const st = mem(); const r = await run(doc(), k1, st); assert.equal(r.entries.length, 1); assert.equal(st.s?.serial, 5);});
test('no keys configured fails closed', async () => assert.equal(await code(run(doc(), k1, mem(), [])), 'no-keys'));
test('wrong signer rejected even with same keyId', async () => assert.equal(await code(run(doc(), evil)), 'bad-signature'));
test('tampered payload rejected', async () => {const p = doc(); assert.equal(await code(verifySignedCatalog({payload: p.replace('1.0.0', '1.0.1'), signature: sig(k1, p)}, {keys, state: mem(), now: () => NOW})), 'bad-signature');});
test('malformed signature rejected', async () => assert.equal(await code(verifySignedCatalog({payload: doc(), signature: 'abc'}, {keys, state: mem(), now: () => NOW})), 'bad-signature'));
test('rotation: next key verifies if pinned and named', async () => {const p = doc({keyId: 'k2'}); await run(p, k2);});
test('index naming unpinned keyId rejected', async () => assert.equal(await code(run(doc({keyId: 'zz'}), k1)), 'unknown-key'));
test('expired index rejected', async () => assert.equal(await code(run(doc({expiresAt: '2026-10-13T11:00:00Z'}), k1)), 'expired'));
test('validity over 30 days rejected', async () => assert.equal(await code(run(doc({expiresAt: '2026-12-31T00:00:00Z'}), k1)), 'invalid'));
test('future-dated index rejected', async () => assert.equal(await code(run(doc({issuedAt: '2026-10-14T00:00:00Z', expiresAt: '2026-10-20T00:00:00Z'}), k1)), 'future'));
test('rollback to lower serial rejected, state unchanged', async () => {const st = mem({serial: 9, payloadSha256: 'a', verifiedAtMs: NOW - 1000}); assert.equal(await code(run(doc(), k1, st)), 'rollback'); assert.equal(st.s?.serial, 9);});
test('same serial different bytes rejected, identical bytes ok', async () => {const st = mem(); await run(doc(), k1, st); await run(doc(), k1, st); assert.equal(await code(run(doc({extensions: []}), k1, st)), 'conflict');});
test('higher serial accepted and advances', async () => {const st = mem({serial: 4, payloadSha256: 'a', verifiedAtMs: NOW - 1000}); await run(doc(), k1, st); assert.equal(st.s?.serial, 5);});
test('clock rollback rejected', async () => assert.equal(await code(run(doc(), k1, mem({serial: 1, payloadSha256: 'a', verifiedAtMs: NOW + 3_600_000}))), 'clock-rollback'));
test('revoked versions are removed from entries', async () => {const r = await run(doc({revoked: [{id: 'acme.palette', versions: ['1.0.0'], reason: 'malware'}]}), k1); assert.equal(r.entries.length, 0); assert.equal(r.catalog.revoked.length, 1);});
test('invalid entry (non-github download) rejected', async () => assert.equal(await code(run(doc({extensions: [{...entry, download: 'https://evil.example/p.zip'}]}), k1)), 'invalid'));
test('schema 1 (legacy) payload is not accepted as signed', async () => assert.equal(await code(run(doc({schemaVersion: 1}), k1)), 'invalid'));

import {CATALOG_KEYS, SIGNED_CATALOG_REQUIRED, SIGNED_INDEX_URL} from './catalogTrust.ts';
test('trust config: keys pinned only from bundled constants; URL is the somnia-extensions repo', () => {
  assert.equal(SIGNED_CATALOG_REQUIRED, CATALOG_KEYS.length > 0);
  assert.ok(SIGNED_INDEX_URL.startsWith('https://raw.githubusercontent.com/philppplik/somnia-extensions/'));
  for (const k of CATALOG_KEYS) assert.equal(k.publicKey.length, 32);
});
test('pinned key k1 is present, 32 bytes, and signed index is required', () => {
  assert.equal(SIGNED_CATALOG_REQUIRED, true);
  assert.deepEqual(CATALOG_KEYS.map(k => k.keyId), ['k1']);
  assert.equal(CATALOG_KEYS[0].publicKey.length, 32);
});
