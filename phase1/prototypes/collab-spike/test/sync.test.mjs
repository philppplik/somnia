import test from 'node:test'
import assert from 'node:assert/strict'
import { start, until } from './helpers.mjs'
import { Session } from '../src/session.mjs'

test('two editors converge on one HTML file', async () => {
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl())
    host.file('index.html').insert(0, '<h1>Hi</h1>')
    const ed = await join(relay.invite('editor'))
    await until(() => ed.text('index.html') === '<h1>Hi</h1>')
    ed.file('index.html').insert(11, '<p>from editor</p>')
    host.file('index.html').insert(0, '<!doctype html>')
    await until(() => host.text('index.html') === ed.text('index.html') && host.text('index.html').includes('from editor') && host.text('index.html').startsWith('<!doctype'))
  } finally { await stop() }
})

test('late joiner gets full state; offline edits merge on reconnect', async () => {
  const { relay, join, stop } = await start()
  try {
    const a = await join(relay.hostUrl())
    a.file('a.css').insert(0, 'body{}')
    const b = await join(relay.invite('editor'))
    await until(() => b.text('a.css') === 'body{}')
    b.ws.terminate() // b goes offline
    await until(() => !b.synced)
    b.file('a.css').insert(6, '/*b*/')
    a.file('a.css').insert(0, '/*a*/')
    const b2 = new Session(relay.invite('editor'), { doc: b.doc }); await b2.connect()
    await until(() => a.text('a.css') === b2.text('a.css') && a.text('a.css') === '/*a*/body{}/*b*/')
  } finally { await stop() }
})

test('remote cursors arrive via awareness and vanish on disconnect', async () => {
  const { relay, join, stop } = await start()
  try {
    const a = await join(relay.hostUrl()), b = await join(relay.invite('editor'))
    b.awareness.setLocalStateField('user', { name: 'Bea' }); b.setCursor('index.html', 3)
    await until(() => [...a.awareness.getStates().values()].some(s => s.user?.name === 'Bea' && s.cursor?.index === 3))
    b.ws.terminate()
    await until(() => ![...a.awareness.getStates().values()].some(s => s.user?.name === 'Bea'))
  } finally { await stop() }
})
