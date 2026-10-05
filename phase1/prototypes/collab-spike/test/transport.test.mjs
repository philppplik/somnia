import test from 'node:test'
import assert from 'node:assert/strict'
import tls from 'node:tls'
import crypto from 'node:crypto'
import WebSocket from 'ws'
import { X509Certificate } from 'node:crypto'
import { SecureRelay, CLOSE_REVOKED } from '../src/secure-relay.mjs'
import { Session } from '../src/session.mjs'
import { pinnedPrepare, parseInvite } from '../src/pinning.mjs'
import { generateSelfSigned } from '../src/cert.mjs'
import { InviteStore } from '../src/invites.mjs'
import { TokenBucket, ConnectionLimiter, TrafficLimiter } from '../src/limits.mjs'
import { until } from './helpers.mjs'
import { encodeSyncStep1 } from '../src/protocol.mjs'

async function boot(o) {
  const relay = new SecureRelay(o); await relay.ready
  const all = []
  const join = async url => { const s = new Session(url, { prepare: pinnedPrepare(url) }); all.push(s); await s.connect(); return s }
  const stop = async () => { all.forEach(s => { s.ws?.terminate(); s.awareness.destroy() }); await relay.close() }
  return { relay, join, stop }
}

test('generated certificate parses, matches fingerprint and SANs', () => {
  const c = generateSelfSigned({ hosts: ['localhost', '127.0.0.1', '::1', '192.168.1.20'] })
  const x = new X509Certificate(c.cert)
  assert.equal(crypto.createHash('sha256').update(x.raw).digest('hex'), c.fingerprint)
  assert.match(x.subjectAltName, /DNS:localhost/); assert.match(x.subjectAltName, /IP Address:192\.168\.1\.20/)
  assert.ok(x.publicKey && x.verify(x.publicKey)) // self-signature valid
  assert.equal(x.ca, false)
})

test('wss works end to end with pinning, TLS 1.3', async () => {
  const { relay, join, stop } = await boot()
  try {
    assert.match(relay.hostUrl(), /^wss:\/\/127\.0\.0\.1:\d+\/\?code=.+&fp=[0-9a-f]{64}$/)
    const host = await join(relay.hostUrl()); host.file('a.html').insert(0, 'hi')
    const g = await join(relay.invite('editor'))
    await until(() => g.text('a.html') === 'hi')
    assert.equal(g.ws._socket.getProtocol(), 'TLSv1.3')
  } finally { await stop() }
})

test('wrong fingerprint is refused before the invite code is sent', async () => {
  const { relay, stop } = await boot()
  try {
    const seen = []
    relay.wss.on('headers', () => seen.push('upgrade')) // would fire only after a completed upgrade
    relay.server.on('upgrade', () => seen.push('upgrade-request'))
    const bad = relay.invite('editor').replace(/fp=[0-9a-f]{64}/, 'fp=' + '0'.repeat(64))
    await assert.rejects(new Session(bad, { prepare: pinnedPrepare(bad) }).connect(), /fingerprint mismatch/)
    assert.deepEqual(seen, [])
  } finally { await stop() }
})

test('wss invite without a pin is rejected by the parser; plain tls without pin cannot connect', async () => {
  assert.throws(() => parseInvite('wss://127.0.0.1:1/?code=x'), /fp/)
  const { relay, stop } = await boot()
  try {
    const url = relay.invite('editor').replace(/&fp=.*/, '')
    await assert.rejects(new Session(url).connect()) // default ws verification: self-signed, not trusted
  } finally { await stop() }
})

test('plain ws is refused on non-loopback, and TLS below 1.3 is refused', async () => {
  assert.throws(() => new SecureRelay({ tls: false, host: '0.0.0.0' }), /non-loopback/)
  const { relay, stop } = await boot()
  try {
    await assert.rejects(new Promise((res, rej) => { const s = tls.connect({ port: relay.port, host: '127.0.0.1', rejectUnauthorized: false, maxVersion: 'TLSv1.2' }); s.on('secureConnect', res); s.on('error', rej) }))
  } finally { await stop() }
})

test('revoking an invite disconnects its guests and refuses new joins; others stay', async () => {
  const { relay, join, stop } = await boot()
  try {
    const a = relay.createInvite('editor'), b = relay.createInvite('viewer')
    const ga = await join(a.url), gb = await join(b.url)
    const closed = new Promise(r => ga.ws.on('close', (code) => r(code)))
    assert.equal(relay.revoke(a.id), 1)
    assert.equal(await closed, CLOSE_REVOKED)
    await assert.rejects(new Session(a.url, { prepare: pinnedPrepare(a.url) }).connect(), /401/)
    assert.equal(gb.ws.readyState, 1)
  } finally { await stop() }
})

test('rotate replaces the code; old code dead, new code works', async () => {
  const { relay, join, stop } = await boot()
  try {
    const a = relay.createInvite('editor'); const g = await join(a.url)
    const closed = new Promise(r => g.ws.on('close', r))
    const n = relay.rotate(a.id)
    await closed
    await assert.rejects(new Session(a.url, { prepare: pinnedPrepare(a.url) }).connect(), /401/)
    assert.equal((await join(n.url)).synced, true)
    assert.notEqual(n.id, a.id)
  } finally { await stop() }
})

test('revokeAllGuests kicks everyone but the host keeps working, with a fresh host code', async () => {
  const { relay, join, stop } = await boot()
  try {
    const host = await join(relay.hostUrl()); const g = await join(relay.invite('editor'))
    const gone = new Promise(r => g.ws.on('close', r))
    assert.equal(relay.revokeAllGuests(), 1); await gone
    assert.equal(host.ws.readyState, 1)
    assert.ok((await join(relay.hostUrl())).synced) // new host url works
  } finally { await stop() }
})

test('invite expiry and use limit', async () => {
  const { relay, join, stop } = await boot()
  try {
    const once = relay.createInvite('viewer', { maxUses: 1 }); await join(once.url)
    await assert.rejects(new Session(once.url, { prepare: pinnedPrepare(once.url) }).connect(), /401/)
    const short = relay.createInvite('viewer', { ttlMs: 1 }); await new Promise(r => setTimeout(r, 10))
    await assert.rejects(new Session(short.url, { prepare: pinnedPrepare(short.url) }).connect(), /401/)
  } finally { await stop() }
})

test('repeated bad codes lock the address temporarily', async () => {
  const { relay, stop } = await boot({ connectionLimits: { maxFailures: 3 } })
  try {
    const bad = relay.invite('editor').replace(/code=[^&]+/, 'code=nope')
    for (let i = 0; i < 3; i++) await assert.rejects(new Session(bad, { prepare: pinnedPrepare(bad) }).connect(), /401/)
    const good = relay.invite('editor')
    await assert.rejects(new Session(good, { prepare: pinnedPrepare(good) }).connect(), /429/)
  } finally { await stop() }
})

test('message flood closes the connection', async () => {
  const { relay, join, stop } = await boot({ trafficLimits: { msgBurst: 20, msgsPerSec: 1 } })
  try {
    const a = await join(relay.hostUrl())
    const closed = new Promise(r => a.ws.on('close', c => r(c)))
    for (let i = 0; i < 200; i++) a.ws.send(encodeSyncStep1(a.doc))
    assert.equal(await closed, 1008)
  } finally { await stop() }
})

test('browser Origin allow-list', async () => {
  const { relay, stop } = await boot({ allowedOrigins: ['https://somnia.philipp-paulik.de'] })
  try {
    const url = relay.invite('viewer'); const fp = parseInvite(url).fp
    const prep = await pinnedPrepare(url)()
    const tryOrigin = origin => new Promise(res => { const ws = new WebSocket(url, { ...prep, origin }); ws.on('open', () => { ws.terminate(); res('open') }); ws.on('unexpected-response', (_q, r) => res(r.statusCode)); ws.on('error', () => res('err')) })
    assert.equal(await tryOrigin('https://evil.example'), 403)
    // pinned socket is single use: fresh one per attempt
    const prep2 = await pinnedPrepare(url)()
    const ok = await new Promise(res => { const ws = new WebSocket(url, { ...prep2, origin: 'https://somnia.philipp-paulik.de' }); ws.on('open', () => { ws.terminate(); res('open') }); ws.on('error', () => res('err')) })
    assert.equal(ok, 'open'); assert.ok(fp)
  } finally { await stop() }
})

test('plain HTTPS request gets 404, no information', async () => {
  const { relay, stop } = await boot()
  try {
    const body = await new Promise((res, rej) => { import('node:https').then(h => h.get({ port: relay.port, host: '127.0.0.1', rejectUnauthorized: false }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res([r.statusCode, d])) }).on('error', rej)) })
    assert.deepEqual(body, [404, 'not found'])
  } finally { await stop() }
})

test('InviteStore: only hashes stored, list never shows code', () => {
  const s = new InviteStore(); const i = s.create('editor')
  assert.ok(![...s.byHash.keys()].includes(i.code))
  assert.ok(!JSON.stringify(s.list()).includes(i.code))
  assert.equal(s.check('wrong'), null)
})

test('limits: token bucket, lockout grows, sweep', () => {
  let t = 0; const now = () => t
  const b = new TokenBucket(1, 2, now); assert.ok(b.take() && b.take() && !b.take()); t += 1000; assert.ok(b.take())
  const c = new ConnectionLimiter({ maxFailures: 2, lockoutMs: 1000, now })
  c.failure('a'); c.failure('a'); assert.equal(c.gate('a').status, 429)
  t += 1001; assert.equal(c.gate('a'), null)
  c.failure('a'); c.failure('a'); t += 1001; assert.equal(c.gate('a').status, 429) // second strike: 2s
  t += 1001; assert.equal(c.gate('a'), null)
  const tr = new TrafficLimiter({ bytesPerSec: 10, byteBurst: 100, now }); assert.ok(tr.allow(100)); assert.ok(!tr.allow(100))
  t += 3_600_000; c.sweep(); assert.equal(c.addrs.size, 0)
})
