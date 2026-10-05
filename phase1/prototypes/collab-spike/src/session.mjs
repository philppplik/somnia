// Client side: one Y.Doc per project. files = Y.Map<path, Y.Text>.
import WebSocket from 'ws'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import { encodeSyncStep1, encodeUpdate, encodeAwareness, handleMessage, peekSyncType } from './protocol.mjs'
import { MSG_IDENTITY, encodeIdentity, readIdentity } from './identity-protocol.mjs'
import { UserUndo } from './user-undo.mjs'
import { assertSafePath } from './paths.mjs'

export class Session {
  constructor(url, { doc = new Y.Doc(), WebSocketImpl = WebSocket, prepare = null } = {}) {
    this.prepare = prepare // async () => ws options (TLS pinning). Runs before anything is sent.
    this.doc = doc
    this.awareness = new awarenessProtocol.Awareness(doc)
    this.awareness.setLocalState({}) // clock > 0, so the relay accepts initial presence
    this.files = doc.getMap('files')
    this.url = url
    this.WS = WebSocketImpl
    this.ws = null
    this.synced = false
    this.identity = null
    this.people = []
    this.undoHistory = new UserUndo(this.files, () => this.identity?.role === 'host' || this.identity?.role === 'editor')
    this.#wire()
  }

  #wire() {
    this.doc.on('update', (u, origin) => { if (origin !== this && this.#open()) this.ws.send(encodeUpdate(u)) })
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin !== this && this.#open()) this.ws.send(encodeAwareness(this.awareness, added.concat(updated, removed)))
    })
  }
  #open() { return this.ws && this.ws.readyState === 1 }

  /** Resolves once the first sync with the relay is complete. Rejects if the relay refuses the code. */
  async connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) throw new Error('Already connecting or connected')
    this.synced = false
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
        const bytes = new Uint8Array(data)
        if (bytes[0] === MSG_IDENTITY) {
          const message = readIdentity(bytes)
          if (message.type === 'identity') {
            if (this.identity?.role !== message.identity.role) this.undoHistory.manager.clear()
            this.identity = message.identity
          }
          if (message.type === 'presence') this.people = message.people
          return
        }
        const reply = handleMessage(new Uint8Array(data), this.doc, this.awareness, this)
        if (reply) ws.send(reply)
        if (!this.synced && peekSyncType(bytes) === 1) { this.synced = true; resolve(this) }
      })
      ws.on('close', () => { if (this.ws !== ws) return; const wasSynced = this.synced; this.synced = false; this.people = []; if (!wasSynced) reject(new Error('Connection closed')) })
    })
  }

  disconnect() { awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'local'); this.ws?.close(); this.awareness.destroy(); this.undoHistory.destroy() }

  /** Get or create the Y.Text for a project file. */
  file(path) {
    assertSafePath(path)
    let t = this.files.get(path)
    if (!t) { t = new Y.Text(); this.files.set(path, t) }
    return t
  }
  text(path) { return this.files.get(path)?.toString() }
  edit(edit) { this.undoHistory.transact(edit) }
  undo() { return this.undoHistory.undo() }
  redo() { return this.undoHistory.redo() }
  setGuestRole(id, role) { this.#hostCommand({ type: 'set-role', id, role }) }
  revokeGuest(id) { this.#hostCommand({ type: 'revoke', id }) }
  kickGuest(id) { this.revokeGuest(id) }
  #hostCommand(command) {
    if (this.identity?.role !== 'host' || !this.#open()) throw new Error('Host connection required')
    this.ws.send(encodeIdentity(command))
  }
  setCursor(path, index) { this.awareness.setLocalStateField('cursor', { path, index }) }
}
