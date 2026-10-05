import test from 'node:test'
import assert from 'node:assert/strict'
import { start, until } from './helpers.mjs'
import { Session } from '../src/session.mjs'
import { assertSafePath, resolveInside } from '../src/paths.mjs'

test('viewer reads but cannot write', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()); host.file('i.html').insert(0, 'ok')
    const v = await join(relay.invite('viewer'))
    await until(() => v.text('i.html') === 'ok')
    v.file('i.html').insert(2, ' HACK')           // local only
    host.file('i.html').insert(2, '!')            // a later host edit must still arrive
    await until(() => v.text('i.html')?.includes('!'))
    await new Promise(r => setTimeout(r, 150))
    assert.equal(host.text('i.html'), 'ok!')
    assert.equal(relay.doc.getMap('files').get('i.html').toString(), 'ok!')
  } finally { await stop() }
})

test('wrong code is refused, repeated failures block that address', async () => {
  const { relay, stop } = await start({ maxAuthFailures: 3 })
  try {
    for (let i = 0; i < 3; i++) await assert.rejects(new Session(`ws://127.0.0.1:${relay.port}/?code=nope`).connect(), /401/)
    await assert.rejects(new Session(relay.hostUrl()).connect(), /429/) // even the right code, address is blocked
  } finally { await stop() }
})

test('expired invite is refused', async () => {
  const { relay, stop } = await start({ inviteTtlMs: 1 })
  try { await new Promise(r => setTimeout(r, 10)); await assert.rejects(new Session(relay.hostUrl()).connect(), /401/) } finally { await stop() }
})

test('session size limit', async () => {
  const { relay, join, stop } = await start({ maxClients: 1 })
  try { await join(relay.hostUrl()); await assert.rejects(new Session(relay.invite('editor')).connect(), /503/) } finally { await stop() }
})

test('oversized message closes the connection', async () => {
  const { relay, join, stop } = await start()
  try {
    const a = await join(relay.hostUrl())
    const closed = new Promise(r => a.ws.on('close', r))
    a.ws.send(Buffer.alloc(6 * 1024 * 1024, 1))
    await closed
  } finally { await stop() }
})

test('path validation', () => {
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'a\\b', '', 'a//b', './a', 'a\0b']) assert.throws(() => assertSafePath(bad), /invalid/, bad)
  for (const ok of ['index.html', 'css/site.css', 'a/b/c.js']) assert.equal(assertSafePath(ok), ok)
  assert.throws(() => resolveInside('/tmp/proj', '../x'))
})
