// Real Chromium WebRTC, two independent contexts, loopback only. Not TURN validation.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { SignalingRoom } from '../src/signaling.mjs'
const room = new SignalingRoom()
await room.ready
const source = await readFile(new URL('../src/transport.mjs', import.meta.url))
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/transport.mjs' ? 'text/javascript' : 'text/html')
  res.end(req.url === '/transport.mjs' ? source : '<!doctype html><title>Somnia transport test</title>')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
let browser
try {
  browser = await chromium.launch({ headless: true })
  const host = await browser.newPage(), guest = await browser.newPage()
  for (const page of [host, guest]) await page.goto(`http://127.0.0.1:${server.address().port}`)
  for (const [page, role] of [[host, 'host'], [guest, 'guest']]) await page.evaluate(async config => {
    const { InternetPeer } = await import('/transport.mjs')
    window.framesReceived = []; window.states = []
    window.peer = new InternetPeer({ ...config, onFrame: bytes => window.framesReceived.push(Array.from(bytes)), onStatus: s => window.states.push(s) }).connect()
  }, { url: room.url, role, token: room.tokens[role] })
  for (const page of [host, guest]) await page.waitForFunction(() => window.peer.channel?.readyState === 'open')
  await host.evaluate(() => window.peer.send(Uint8Array.of(1, 7, 42)))
  await guest.waitForFunction(() => window.framesReceived.length === 1)
  assert.deepEqual(await guest.evaluate(() => window.framesReceived[0]), [1, 7, 42])
  await guest.evaluate(() => window.peer.send(Uint8Array.of(255, 9)))
  await host.waitForFunction(() => window.framesReceived.length === 1)
  assert.deepEqual(await host.evaluate(() => window.framesReceived[0]), [255, 9])
  await host.evaluate(() => window.peer.close())
  await guest.waitForFunction(() => window.peer.closed)
  console.log('PASS: real Chromium bidirectional data channel; peer disconnect cleanup')
  const isolated = await browser.newPage()
  await isolated.goto(`http://127.0.0.1:${server.address().port}`)
  await isolated.evaluate(async config => {
    const { InternetPeer } = await import('/transport.mjs')
    window.finalStatus = ''
    window.peer = new InternetPeer({ ...config, relayOnly: true, timeoutMs: 250, onStatus: s => window.finalStatus = s }).connect()
  }, { url: room.url, role: 'host', token: room.tokens.host })
  await isolated.waitForFunction(() => window.peer.closed)
  assert.match(await isolated.evaluate(() => window.finalStatus), /timed out/)
  console.log('PASS: absent peer yields a bounded timeout')
} finally {
  await browser?.close()
  await room.close()
  await new Promise(r => server.close(r))
}
