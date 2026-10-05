// Client side: one Y.Doc per project. files = Y.Map<path, Y.Text>.
import WebSocket from 'ws'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import { encodeSyncStep1, encodeUpdate, encodeAwareness, handleMessage } from './protocol.mjs'
import { assertSafePath } from './paths.mjs'

export class Session {
  constructor(url, { doc = new Y.Doc(), WebSocketImpl = WebSocket, prepare = null } = {}) {
    this.prepare = prepare // async () => ws options (TLS pinning). Runs before anything is sent.
    this.doc = doc
    this.awareness = new awarenessProtocol.Awareness(doc)
    this.files = doc.getMap('files')
    this.url = url
    this.WS = WebSocketImpl
    this.ws = null
    this.synced = false
    this.#wire()
  }

  #wire() {
    this.doc.on('update', (u, origin) => { if (origin !== this && this.#open()) this.ws.send(encodeUpdate(u)) })
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin !== 'remote' && this.#open()) this.ws.send(encodeAwareness(this.awareness, added.concat(updated, removed)))
    })
  }
  #open() { return this.ws && this.ws.readyState === 1 }

  /** Resolves once the first sync with the relay is complete. Rejects if the relay refuses the code. */
  async connect() {
    const wsOptions = this.prepare ? await this.prepare() : undefined
    return new Promise((resolve, reject) => {
      const ws = this.ws = wsOptions ? new this.WS(this.url, wsOptions) : new this.WS(this.url)
      ws.binaryType = 'nodebuffer'
      ws.on('unexpected-response', (_req, res) => reject(new Error(`refused: ${res.statusCode}`)))
      ws.on('error', reject)
      ws.on('open', () => {
        ws.send(encodeSyncStep1(this.doc))
        if (this.awareness.getLocalState()) ws.send(encodeAwareness(this.awareness, [this.doc.clientID]))
      })
      ws.on('message', data => {
        const reply = handleMessage(new Uint8Array(data), this.doc, this.awareness, this)
        if (reply) ws.send(reply)
        if (!this.synced) { this.synced = true; resolve(this) }
      })
      ws.on('close', () => { this.synced = false })
    })
  }

  disconnect() { awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'local'); this.ws?.close(); this.awareness.destroy() }

  /** Get or create the Y.Text for a project file. */
  file(path) {
    assertSafePath(path)
    let t = this.files.get(path)
    if (!t) { t = new Y.Text(); this.files.set(path, t) }
    return t
  }
  text(path) { return this.files.get(path)?.toString() }
  setCursor(path, index) { this.awareness.setLocalStateField('cursor', { path, index }) }
}
