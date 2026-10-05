// Local relay for one session (ADR-005 option 2). Runs on the host machine.
// The relay keeps its own Y.Doc so late joiners get the full state, and it enforces roles:
// viewers can read but every update they send is dropped.
import { WebSocketServer } from 'ws'
import crypto from 'node:crypto'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import { MAX_MESSAGE_BYTES, MSG_SYNC, encodeSyncStep1, encodeUpdate, encodeAwareness, handleMessage, peekSyncType } from './protocol.mjs'

export const ROLES = ['host', 'editor', 'viewer']
const newCode = () => crypto.randomBytes(16).toString('base64url')

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export class Relay {
  /**
   * @param {object} o
   * @param {string} [o.host='127.0.0.1']  bind address. Use 0.0.0.0 only for a LAN session the host started on purpose.
   * @param {number} [o.port=0]
   * @param {number} [o.inviteTtlMs=3600000]
   * @param {number} [o.maxClients=8]
   * @param {number} [o.maxAuthFailures=5]  per remote address, then it is blocked for the rest of the session
   * @param {Y.Doc} [o.doc]
   */
  constructor(o = {}) {
    this.doc = o.doc ?? new Y.Doc()
    this.awareness = new awarenessProtocol.Awareness(this.doc)
    this.awareness.setLocalState(null)
    this.codes = { host: newCode(), editor: newCode(), viewer: newCode() }
    this.expiresAt = Date.now() + (o.inviteTtlMs ?? 3600_000)
    this.maxClients = o.maxClients ?? 8
    this.maxAuthFailures = o.maxAuthFailures ?? 5
    this.failures = new Map()
    this.conns = new Map() // ws -> { role, awarenessIds:Set }
    this.wss = new WebSocketServer({ host: o.host ?? '127.0.0.1', port: o.port ?? 0, maxPayload: MAX_MESSAGE_BYTES, verifyClient: (info, cb) => this.#verify(info, cb) })
    this.doc.on('update', (u, origin) => { this.#broadcast(encodeUpdate(u), origin) })
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const ids = added.concat(updated, removed)
      const msg = encodeAwareness(this.awareness, ids)
      for (const ws of this.conns.keys()) if (ws !== origin && ws.readyState === 1) ws.send(msg)
      const c = this.conns.get(origin)
      if (c) { added.forEach(i => c.awarenessIds.add(i)); removed.forEach(i => c.awarenessIds.delete(i)) }
    })
    this.wss.on('connection', (ws, req) => this.#onConnection(ws, req))
  }

  get port() { return this.wss.address().port }
  get ready() { return new Promise(r => this.wss.address() ? r() : this.wss.once('listening', r)) }

  /** Invite = what the host hands out. The code is the only credential. */
  invite(role, hostname = '127.0.0.1') {
    if (!ROLES.includes(role) || role === 'host') throw new Error('invite role must be editor or viewer')
    return `ws://${hostname}:${this.port}/?code=${this.codes[role]}`
  }
  hostUrl() { return `ws://127.0.0.1:${this.port}/?code=${this.codes.host}` }

  #roleFor(code) {
    let found = null
    for (const r of ROLES) if (safeEqual(code ?? '', this.codes[r])) found = r // no early exit: constant-ish time
    return found
  }

  #verify(info, cb) {
    const addr = info.req.socket.remoteAddress
    if ((this.failures.get(addr) ?? 0) >= this.maxAuthFailures) return cb(false, 429, 'blocked')
    if (Date.now() > this.expiresAt) return cb(false, 401, 'invite expired')
    if (this.conns.size >= this.maxClients) return cb(false, 503, 'session full')
    const code = new URL(info.req.url, 'http://x').searchParams.get('code')
    const role = this.#roleFor(code)
    if (!role) { this.failures.set(addr, (this.failures.get(addr) ?? 0) + 1); return cb(false, 401, 'bad code') }
    info.req.somniaRole = role
    cb(true)
  }

  #onConnection(ws, req) {
    const role = req.somniaRole
    this.conns.set(ws, { role, awarenessIds: new Set() })
    ws.binaryType = 'nodebuffer'
    ws.on('error', () => {}) // oversized or malformed frames: ws closes the socket itself
    ws.on('message', data => {
      const bytes = new Uint8Array(data)
      try {
        if (bytes[0] === MSG_SYNC && role === 'viewer') {
          // sync step 1 (a request for state) is read-only; step 2 and update carry writes
          if (peekSyncType(bytes) !== 0) return
        }
        const reply = handleMessage(bytes, this.doc, this.awareness, ws)
        if (reply) ws.send(reply)
      } catch { ws.close(1003, 'bad message') }
    })
    ws.on('close', () => {
      const c = this.conns.get(ws); this.conns.delete(ws)
      if (c?.awarenessIds.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...c.awarenessIds], null)
    })
    ws.send(encodeSyncStep1(this.doc))
    if (this.awareness.getStates().size) ws.send(encodeAwareness(this.awareness, [...this.awareness.getStates().keys()]))
  }

  #broadcast(msg, origin) {
    for (const ws of this.conns.keys()) if (ws !== origin && ws.readyState === 1) ws.send(msg)
  }

  close() {
    this.awareness.destroy()
    for (const ws of this.conns.keys()) ws.terminate()
    return new Promise(r => this.wss.close(r))
  }
}
