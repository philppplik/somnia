import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import WebSocket from 'ws'
import { SignalingRoom, validSignal, MAX_SIGNAL_BYTES } from '../src/signaling.mjs'

async function room(t, options) { const r = new SignalingRoom(options); await r.ready; t.after(() => r.close()); return r }
async function socket(t, r) { const s = new WebSocket(r.url); s.on('error', () => {}); await once(s, 'open'); t.after(() => s.terminate()); return s }
async function auth(s, r, role, token = r.tokens[role]) { const reply = once(s, 'message'); s.send(JSON.stringify({ type: 'auth', role, token })); return JSON.parse((await reply)[0]) }
const offer = { type: 'description', description: { type: 'offer', sdp: 'v=0' } }

test('distinct high entropy tokens; two authenticated peers forward only signaling', async t => {
  const r = await room(t)
  assert.notEqual(r.tokens.host, r.tokens.guest)
  assert.equal(Buffer.from(r.tokens.host, 'base64url').length, 32)
  const h = await socket(t, r), g = await socket(t, r)
  assert.equal((await auth(h, r, 'host')).type, 'authenticated')
  const ready = once(h, 'message')
  await auth(g, r, 'guest')
  assert.equal(JSON.parse((await ready)[0]).type, 'ready')
  const got = new Promise(resolve => g.on('message', data => { const m = JSON.parse(data); if (m.type === 'description') resolve(m) }))
  h.send(JSON.stringify(offer))
  assert.deepEqual(await got, offer)
})
test('bad token rejected', async t => {
  const r = await room(t), s = await socket(t, r), closed = once(s, 'close')
  s.send(JSON.stringify({ type: 'auth', role: 'host', token: r.tokens.guest }))
  assert.equal((await closed)[0], 1008)
})
test('no query string bearer credentials accepted as authentication', async t => {
  const r = await room(t, { authTimeoutMs: 30 }), s = new WebSocket(`${r.url}/?token=${r.tokens.host}`)
  s.on('error', () => {}); t.after(() => s.terminate())
  assert.equal((await once(s, 'close'))[0], 1008)
})
test('expired room rejects authentication', async t => {
  let clock = 0
  const r = await room(t, { now: () => clock }), s = await socket(t, r)
  clock = r.expiresAt
  const closed = once(s, 'close')
  s.send(JSON.stringify({ type: 'auth', role: 'host', token: r.tokens.host }))
  assert.equal((await closed)[0], 1008)
})
test('duplicate host cannot displace the authenticated host', async t => {
  const r = await room(t), first = await socket(t, r)
  await auth(first, r, 'host')
  const second = await socket(t, r), closed = once(second, 'close')
  second.send(JSON.stringify({ type: 'auth', role: 'host', token: r.tokens.host }))
  assert.equal((await closed)[0], 1008)
  assert.equal(r.peers.get('host').readyState, WebSocket.OPEN)
})
test('project data cannot be smuggled through signaling', async t => {
  const r = await room(t), s = await socket(t, r)
  await auth(s, r, 'host')
  const closed = once(s, 'close')
  s.send(JSON.stringify({ type: 'update', data: '<html>private</html>' }))
  assert.equal((await closed)[0], 1008)
})
test('oversize frame rejected by websocket library', async t => {
  const r = await room(t), s = await socket(t, r), closed = once(s, 'close')
  s.send('x'.repeat(MAX_SIGNAL_BYTES + 1))
  assert.equal((await closed)[0], 1009)
})
test('role-specific offer/answer and candidate schemas', () => {
  assert.ok(validSignal(offer, 'host'))
  assert.equal(validSignal(offer, 'guest'), false)
  assert.equal(validSignal({ ...offer, token: 'leak' }, 'host'), false)
  assert.ok(validSignal({ type: 'candidate', candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } }, 'host'))
  assert.equal(validSignal({ type: 'candidate', candidate: { candidate: 3 } }, 'host'), false)
})
test('burst rate limit closes the offender with an authenticated peer present', async t => {
  const r = await room(t, { now: () => 0 }), h = await socket(t, r), g = await socket(t, r)
  await auth(h, r, 'host'); await auth(g, r, 'guest')
  const closed = once(h, 'close')
  for (let i = 0; i < 110; i++) h.send(JSON.stringify(offer))
  const [code, reason] = await closed
  assert.equal(code, 1008)
  assert.equal(reason.toString(), 'Rate limit')
})
test('binary signaling and malformed JSON are rejected', async t => {
  const r = await room(t)
  for (const data of [Buffer.from([1, 2]), '{broken']) {
    const s = await socket(t, r), closed = once(s, 'close')
    s.send(data)
    assert.equal((await closed)[0], 1008)
  }
})
test('room TTL shuts down an already authenticated connection', async t => {
  const r = await room(t, { ttlMs: 100 }), s = await socket(t, r)
  await auth(s, r, 'host')
  await once(s, 'close')
  assert.equal(s.readyState, WebSocket.CLOSED)
})
