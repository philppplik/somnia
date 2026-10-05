// SecureRelay (invites, TLS, limits) combined with identity roles (host sets roles, revoke).
import test from 'node:test'
import assert from 'node:assert/strict'
import { SecureRelay } from '../src/secure-relay.mjs'
import { Session } from '../src/session.mjs'
import { pinnedPrepare } from '../src/pinning.mjs'
import { until } from './helpers.mjs'

test('host can switch a SecureRelay guest to viewer and revoke the invite', async () => {
  const relay = new SecureRelay(); await relay.ready
  const all = []
  const join = async url => { const s = new Session(url, { prepare: pinnedPrepare(url) }); all.push(s); await s.connect(); return s }
  try {
    const host = await join(relay.hostUrl()); host.file('a.html').insert(0, 'one')
    const inv = relay.createInvite('editor')
    const guest = await join(inv.url)
    await until(() => guest.text('a.html') === 'one')
    assert.equal(guest.identity.role, 'editor')
    host.setGuestRole(inv.id, 'viewer')
    await until(() => guest.identity.role === 'viewer')
    guest.file('a.html').insert(0, 'X') // dropped by the relay
    await new Promise(r => setTimeout(r, 100))
    assert.equal(host.text('a.html'), 'one')
    host.revokeGuest(inv.id)
    await until(() => !guest.synced)
    await assert.rejects(join(inv.url))
  } finally { all.forEach(s => { s.ws?.terminate(); s.awareness.destroy() }); await relay.close() }
})
