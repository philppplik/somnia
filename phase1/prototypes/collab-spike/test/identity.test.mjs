import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { start, until } from './helpers.mjs'
import { Session } from '../src/session.mjs'
import { encodeAwareness, encodeUpdate } from '../src/protocol.mjs'
import { encodeIdentity } from '../src/identity-protocol.mjs'
import { UserUndo } from '../src/user-undo.mjs'

const delay = () => new Promise(r => setTimeout(r, 70))
test('individual credentials, public presence and stable reconnect identity', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl())
    const url = relay.invite('editor', '127.0.0.1', 'Bea')
    assert.notEqual(url, relay.invite('editor'))
    const guest = await join(url), id = guest.identity.id
    await until(() => host.people.some(p => p.id === id && p.role === 'editor'))
    assert.equal(host.people.find(p => p.id === id).name, 'Bea')
    assert.ok(!JSON.stringify(host.people).includes('code'))
    const duplicate = new Session(url)
    try { await assert.rejects(duplicate.connect(), /409/) } finally { duplicate.disconnect() }
    guest.ws.terminate()
    await until(() => !host.people.some(p => p.id === id))
    const again = await join(url)
    assert.equal(again.identity.id, id)
  } finally { await stop() }
})

test('host role change takes effect immediately at relay and client', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()); host.edit(() => host.file('a').insert(0, 'A'))
    const guest = await join(relay.invite('editor'))
    await until(() => guest.text('a') === 'A')
    host.setGuestRole(guest.identity.id, 'viewer')
    await until(() => guest.identity.role === 'viewer' && host.people.some(p => p.id === guest.identity.id && p.role === 'viewer'))
    assert.throws(() => guest.edit(() => guest.file('a').insert(1, 'B')), /not allowed/)
    assert.throws(() => guest.undo(), /not allowed/)
    const attack = new Y.Doc(); attack.getMap('files').set('attack', new Y.Text('bad'))
    guest.ws.send(encodeUpdate(Y.encodeStateAsUpdate(attack)))
    await delay()
    assert.equal(relay.doc.getMap('files').has('attack'), false)
    host.setGuestRole(guest.identity.id, 'editor')
    await until(() => guest.identity.role === 'editor')
    guest.edit(() => guest.file('a').insert(1, 'B'))
    await until(() => host.text('a') === 'AB')
    assert.throws(() => relay.setRole(guest.identity.id, 'host'), /editor or viewer/)
  } finally { await stop() }
})

test('kick revokes just one guest and prevents replay/reconnect', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()), url = relay.invite('editor')
    const guest = await join(url), other = await join(relay.invite('editor'))
    host.kickGuest(guest.identity.id)
    await until(() => !guest.synced && !host.people.some(p => p.id === guest.identity.id))
    const retry = new Session(url)
    try { await assert.rejects(retry.connect(), /401/) } finally { retry.disconnect() }
    other.edit(() => other.file('a').insert(0, 'still here'))
    await until(() => host.text('a') === 'still here')
    assert.throws(() => relay.revoke(host.identity.id), /unknown guest/)
  } finally { await stop() }
})

test('guest cannot send host controls even with forged awareness role', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()), guest = await join(relay.invite('editor'))
    guest.awareness.setLocalStateField('user', { name: 'Impersonated', role: 'host', id: host.identity.id })
    await until(() => host.people.some(p => p.id === guest.identity.id && p.name === 'Impersonated'))
    const state = [...relay.awareness.getStates().values()].find(s => s.user.id === guest.identity.id)
    assert.equal(state.user.role, 'editor')
    assert.throws(() => guest.revokeGuest(host.identity.id), /Host connection/)
    guest.ws.send(encodeIdentity({ type: 'revoke', id: host.identity.id }))
    await until(() => !guest.synced)
    assert.equal(host.synced, true)
  } finally { await stop() }
})

test('guest cannot overwrite/remove another person awareness', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()), guest = await join(relay.invite('editor'))
    host.setCursor('index.html', 4)
    await until(() => relay.awareness.getStates().get(host.doc.clientID)?.cursor?.index === 4)
    guest.ws.send(encodeAwareness(host.awareness, [host.doc.clientID]))
    await until(() => !guest.synced)
    assert.equal(relay.awareness.getStates().get(host.doc.clientID).cursor.index, 4)
  } finally { await stop() }
})

test('viewer cannot bypass role checks with noncanonical message header', async () => {
  const { relay, join, stop } = await start()
  try {
    await join(relay.hostUrl()); const viewer = await join(relay.invite('viewer'))
    const doc = new Y.Doc(); doc.getMap('files').set('evil', new Y.Text('bad'))
    const frame = encodeUpdate(Y.encodeStateAsUpdate(doc))
    viewer.ws.send(Uint8Array.from([128, 0, ...frame.slice(1)]))
    await until(() => !viewer.synced)
    assert.equal(relay.doc.getMap('files').has('evil'), false)
  } finally { await stop() }
})

test('per-user undo removes only own edits and redo preserves remote changes', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()); host.file('a').insert(0, 'seed')
    const guest = await join(relay.invite('editor'))
    await until(() => guest.text('a') === 'seed')
    host.edit(() => host.file('a').insert(4, '-host'))
    await until(() => guest.text('a') === 'seed-host')
    guest.edit(() => guest.file('a').insert(9, '-guest'))
    await until(() => host.text('a') === 'seed-host-guest')
    host.undo()
    await until(() => guest.text('a') === 'seed-guest')
    host.redo()
    await until(() => guest.text('a') === 'seed-host-guest')
    guest.undo()
    await until(() => host.text('a') === 'seed-host')
  } finally { await stop() }
})

test('undo tracks created files but excludes system transactions', () => {
  const doc = new Y.Doc(), files = doc.getMap('files'), undo = new UserUndo(files)
  files.set('system', new Y.Text('generated'))
  undo.transact(() => files.set('local', new Y.Text('created')))
  undo.undo()
  assert.equal(files.has('local'), false)
  assert.equal(files.get('system').toString(), 'generated')
  undo.redo()
  assert.equal(files.get('local').toString(), 'created')
  undo.destroy(); doc.destroy()
})

test('role downgrade clears undo history and viewer sync step2 is refused', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl()), guest = await join(relay.invite('editor'))
    guest.edit(() => guest.file('a').insert(0, 'guest'))
    await until(() => host.text('a') === 'guest')
    assert.equal(guest.undoHistory.manager.undoStack.length, 1)
    host.setGuestRole(guest.identity.id, 'viewer')
    await until(() => guest.identity.role === 'viewer')
    assert.equal(guest.undoHistory.manager.undoStack.length, 0)
    const doc = new Y.Doc(); doc.getMap('files').set('step2-attack', new Y.Text('bad'))
    const update = encodeUpdate(Y.encodeStateAsUpdate(doc))
    update[1] = 1 // sync step2 has the same update payload encoding
    guest.ws.send(update)
    await delay()
    assert.equal(relay.doc.getMap('files').has('step2-attack'), false)
    host.edit(() => host.file('a').insert(5, '-host'))
    await until(() => guest.text('a') === 'guest-host')
  } finally { await stop() }
})

test('revocation also covers a not-yet-connected guest invite', async () => {
  const { relay, stop } = await start()
  try {
    const url = relay.invite('viewer'), code = new URL(url).searchParams.get('code')
    const identity = relay.identities.authenticate(code)
    relay.revoke(identity.id)
    const s = new Session(url)
    try { await assert.rejects(s.connect(), /401/) } finally { s.disconnect() }
  } finally { await stop() }
})
