import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as Y from 'yjs'
import { start, until } from './helpers.mjs'
import { saveProject, loadProject, watchValidity } from '../src/host-save.mjs'
import { checkHtml } from '../src/html-check.mjs'

test('host loads a folder, guest edits, host saves; traversal names are skipped', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'somnia-collab-'))
  const outside = path.join(path.dirname(root), 'escaped.txt')
  await fs.writeFile(path.join(root, 'index.html'), '<p>x</p>')
  await fs.mkdir(path.join(root, 'css')); await fs.writeFile(path.join(root, 'css/a.css'), 'a{}')
  const { relay, join, stop } = await start()
  try {
    const host = await join(relay.hostUrl())
    assert.deepEqual((await loadProject(host, root)).sort(), ['css/a.css', 'index.html'])
    const g = await join(relay.invite('editor'))
    await until(() => g.text('index.html') === '<p>x</p>')
    g.file('index.html').insert(8, '<p>y</p>')
    // a hostile guest writes a bad file name straight into the shared map (bypassing the client check)
    const evil = new Y.Text(); g.files.set('../escaped.txt', evil); evil.insert(0, 'pwn')
    await until(() => host.text('index.html') === '<p>x</p><p>y</p>' && host.files.has('../escaped.txt'))
    const r = await saveProject(host.files, root)
    assert.deepEqual(r.skipped, ['../escaped.txt'])
    assert.equal(await fs.readFile(path.join(root, 'index.html'), 'utf8'), '<p>x</p><p>y</p>')
    await assert.rejects(fs.access(outside))
  } finally { await stop(); await fs.rm(root, { recursive: true, force: true }) }
})

test('concurrent edits that break structure are flagged, not silently fixed', async () => {
  const { relay, join, stop } = await start()
  try {
    const a = await join(relay.hostUrl()), b = await join(relay.invite('editor'))
    a.file('p.html').insert(0, '<div><b>text</b></div>')
    await until(() => b.text('p.html'))
    const seen = []; watchValidity(a, (p, issues) => seen.push(issues))
    // a deletes the closing tag while b wraps text with a new element that depends on it
    b.ws.terminate(); await until(() => !b.synced)
    a.file('p.html').delete(a.text('p.html').length - 6, 6)          // removes </div>
    b.file('p.html').insert(5, '<i>')                                  // opens <i> never closed
    const { Session } = await import('../src/session.mjs')
    const b2 = new Session(relay.invite('editor'), { doc: b.doc }); await b2.connect()
    await until(() => a.text('p.html') === b2.text('p.html') && seen.length)
    assert.ok(seen.at(-1).some(i => i.kind === 'unclosed'))
    assert.equal(a.text('p.html'), '<div><i><b>text</b>')            // source untouched
  } finally { await stop() }
})

test('html check basics', () => {
  assert.deepEqual(checkHtml('<!doctype html><html><body><p>a<p>b<img src="x"><br/></body></html>'), [])
  assert.deepEqual(checkHtml('<div><script>if(a<b){"</div>"}</script></div>'), [])
  assert.equal(checkHtml('<div><span></div>')[0].kind, 'unclosed')
  assert.equal(checkHtml('</b>')[0].kind, 'stray-close')
  assert.equal(checkHtml('<a href="x')[0].kind, 'unterminated-tag')
  assert.equal(checkHtml('<!-- x')[0].kind, 'unterminated-comment')
})
