// Local-only acceptance walkthrough. No folder writes and no LAN listener.
import assert from 'node:assert/strict'
import { Relay } from './src/relay.mjs'
import { Session } from './src/session.mjs'
const until = async check => {
  const end = Date.now() + 2000
  while (!check()) { if (Date.now() > end) throw new Error('Timed out'); await new Promise(r => setTimeout(r, 10)) }
}
const relay = new Relay(), sessions = []
const join = async url => { const s = new Session(url); sessions.push(s); await s.connect(); return s }
try {
  await relay.ready
  const host = await join(relay.hostUrl())
  host.file('index.html').insert(0, 'Hello')
  const guestUrl = relay.invite('editor', '127.0.0.1', 'Bea')
  const editor = await join(guestUrl)
  const viewer = await join(relay.invite('viewer', '127.0.0.1', 'Chris'))
  await until(() => host.people.length === 3 && editor.text('index.html') === 'Hello')
  console.table(host.people)
  host.edit(() => host.file('index.html').insert(5, ' from host'))
  await until(() => editor.text('index.html') === 'Hello from host')
  editor.edit(() => editor.file('index.html').insert(15, ' and Bea'))
  await until(() => host.text('index.html') === 'Hello from host and Bea')
  host.undo()
  await until(() => editor.text('index.html') === 'Hello and Bea')
  console.log('PASS: host undo kept Bea\'s edit')
  host.setGuestRole(editor.identity.id, 'viewer')
  await until(() => editor.identity.role === 'viewer')
  assert.throws(() => editor.edit(() => {}), /not allowed/)
  console.log('PASS: editor downgraded to viewer, editing blocked')
  host.kickGuest(editor.identity.id)
  await until(() => !editor.synced && host.people.length === 2)
  const retry = new Session(guestUrl); sessions.push(retry)
  await assert.rejects(retry.connect(), /401/)
  assert.equal(viewer.synced, true)
  console.log('PASS: kicked guest cannot reconnect, other viewer stays connected')
} finally {
  for (const s of sessions) s.disconnect()
  await relay.close()
}
