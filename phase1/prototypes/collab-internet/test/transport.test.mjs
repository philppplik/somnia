import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendFrame, signalingUrl, MAX_BUFFER_BYTES, InternetPeer } from '../src/transport.mjs'

test('only WSS or explicit loopback WS; no credentials in URL', () => {
  assert.equal(signalingUrl('wss://signal.example/room'), 'wss://signal.example/room')
  assert.ok(signalingUrl('ws://127.0.0.1:8080'))
  for (const url of ['ws://remote.example', 'https://remote.example', 'wss://u:p@remote.example', 'wss://remote.example/?token=secret', 'wss://remote.example/#secret']) assert.throws(() => signalingUrl(url))
})
test('bounded binary frames and backpressure', () => {
  const sent = [], c = { readyState: 'open', bufferedAmount: 0, send: x => sent.push(x) }
  sendFrame(c, Uint8Array.of(1, 2))
  assert.equal(sent.length, 1)
  for (const bytes of [new Uint8Array(0), new Uint8Array(16385), 'secret']) assert.throws(() => sendFrame(c, bytes))
  c.bufferedAmount = MAX_BUFFER_BYTES
  assert.throws(() => sendFrame(c, Uint8Array.of(1)), /Backpressure/)
  c.readyState = 'closed'; assert.throws(() => sendFrame(c, Uint8Array.of(1)), /not open/)
})
test('relay privacy setting is passed through; ICE is queued before SDP', async () => {
  const added = []
  class FakePC {
    constructor(config) { this.config = config }
    async setRemoteDescription(d) { this.remoteDescription = d }
    async addIceCandidate(c) { added.push(c) }
    close() {}
  }
  const p = new InternetPeer({ url: 'wss://signal.example', role: 'host', token: 'x', relayOnly: true, PeerConnection: FakePC })
  assert.equal(p.pc.config.iceTransportPolicy, 'relay')
  await p.receive({ type: 'candidate', candidate: { candidate: 'candidate:1' } })
  assert.equal(added.length, 0)
  await p.receive({ type: 'description', description: { type: 'answer', sdp: 'v=0' } })
  assert.equal(added.length, 1)
  p.close(); assert.equal(p.token, undefined)
})
