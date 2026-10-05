// Local relay for one session (ADR-005 option 2). Runs on the host machine.
// The relay keeps its own Y.Doc so late joiners get the full state, and it enforces roles:
// viewers can read but every update they send is dropped.
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import { MAX_MESSAGE_BYTES, MSG_SYNC, MSG_AWARENESS, encodeSyncStep1, encodeUpdate, encodeAwareness, handleMessage, peekSyncType } from './protocol.mjs'

export { ROLES } from './identities.mjs'
import { Identities, publicIdentity } from './identities.mjs'
import { MSG_IDENTITY, encodeIdentity, readIdentity } from './identity-protocol.mjs'
import { applyOwnedAwareness } from './owned-awareness.mjs'

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
    this.identities = new Identities(o.inviteTtlMs ?? 3600_000)
    this.maxClients = o.maxClients ?? 8
    this.maxAuthFailures = o.maxAuthFailures ?? 5
    this.failures = new Map()
    this.conns = new Map() // ws -> { identity, awarenessId, awarenessIds:Set, inviteId, addr }
    // Extension points used by SecureRelay (transport-security slice). All optional; defaults keep the spike behaviour.
    this.server = o.server ?? null          // pre-built http/https server (TLS). Caller listens.
    this.scheme = o.scheme ?? 'ws'          // 'wss' when a TLS server is passed
    this.authenticate = o.authenticate      // (code, info) => { role, id } | null, replaces the identity store lookup. The id becomes the guest id.
    this.verifyGate = o.verifyGate          // (info) => { status, reason } | null, runs before auth (rate limits, origin)
    this.messageGate = o.messageGate        // (ws, byteLength, role) => boolean, false closes the socket
    this.onAuthFailure = o.onAuthFailure    // (addr) => void
    const wssOpts = { maxPayload: MAX_MESSAGE_BYTES, verifyClient: (info, cb) => this.#verify(info, cb) }
    this.wss = new WebSocketServer(this.server ? { ...wssOpts, server: this.server } : { ...wssOpts, host: o.host ?? '127.0.0.1', port: o.port ?? 0 })
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
  get ready() { return new Promise(r => this.wss.address() ? r() : (this.server ?? this.wss).once('listening', r)) }

  /** Each call creates a separate guest credential. Keep the returned URL for reconnect. */
  invite(role, hostname = '127.0.0.1', name = '') {
    if (!['editor', 'viewer'].includes(role)) throw new Error('invite role must be editor or viewer')
    const identity = this.identities.create(role, name)
    return `${this.scheme}://${hostname}:${this.port}/?code=${identity.code}`
  }
  hostUrl() { return `${this.scheme}://127.0.0.1:${this.port}/?code=${this.identities.host.code}` }

  presence() {
    return [...this.conns.values()].map(c => ({ ...publicIdentity(c.identity), connected: true, awarenessId: c.awarenessId ?? null }))
  }

  // Local host-only control API. Guest network requests have a separate authority check.
  setRole(id, role) {
    this.identities.setRole(id, role)
    for (const [ws, c] of this.conns) if (c.identity.id === id) {
      ws.send(encodeIdentity({ type: 'identity', identity: publicIdentity(c.identity) }))
      const state = this.awareness.getStates().get(c.awarenessId)
      if (state) {
        state.user = publicIdentity(c.identity)
        this.awareness.meta.get(c.awarenessId).clock++
      }
    }
    this.#publishPresence()
    const ids = [...this.conns.values()].filter(c => c.identity.id === id && c.awarenessId !== undefined && this.awareness.meta.has(c.awarenessId)).map(c => c.awarenessId)
    if (ids.length) this.#broadcast(encodeAwareness(this.awareness, ids))
  }

  revoke(id) {
    this.identities.revoke(id)
    for (const [ws, c] of this.conns) if (c.identity.id === id) {
      this.conns.delete(ws)
      if (c.awarenessIds.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...c.awarenessIds], null)
      ws.close(4003, 'Guest access revoked')
    }
    this.#publishPresence()
  }
  kick(id) { this.revoke(id) } // kick also blocks reconnect with that credential
  #publishPresence() { this.#broadcast(encodeIdentity({ type: 'presence', people: this.presence() })) }

  #verify(info, cb) {
    const addr = info.req.socket.remoteAddress
    const gate = this.verifyGate?.(info)
    if (gate) return cb(false, gate.status, gate.reason)
    if ((this.failures.get(addr) ?? 0) >= this.maxAuthFailures) return cb(false, 429, 'blocked')
    if (this.conns.size >= this.maxClients) return cb(false, 503, 'session full')
    const code = new URL(info.req.url, 'http://x').searchParams.get('code')
    let identity
    if (this.authenticate) {
      const hit = this.authenticate(code, info)
      if (!hit) { this.onAuthFailure?.(addr); return cb(false, 401, 'bad code') }
      // Register the hook's guest in the identity store so roles, presence and revoke work the same way. Reuse it on reconnect so a role change sticks.
      identity = this.identities.records.get(hit.id)
      if (!identity) { identity = { id: hit.id, code: '', role: hit.role, name: hit.role === 'host' ? 'Host' : 'Guest', expiresAt: Infinity, revoked: false }; this.identities.records.set(hit.id, identity) }
      info.req.somniaInvite = hit.id
    } else {
      identity = this.identities.authenticate(code)
      if (!identity) { this.failures.set(addr, (this.failures.get(addr) ?? 0) + 1); return cb(false, 401, 'bad code') }
    }
    if ([...this.conns.values()].some(c => c.identity.id === identity.id)) return cb(false, 409, 'identity already connected')
    info.req.somniaIdentity = identity
    cb(true)
  }

  #onConnection(ws, req) {
    const identity = req.somniaIdentity
    const c = { identity, awarenessIds: new Set(), inviteId: req.somniaInvite ?? null, addr: req.socket.remoteAddress }
    this.conns.set(ws, c)
    ws.binaryType = 'nodebuffer'
    ws.on('error', () => {}) // oversized or malformed frames: ws closes the socket itself
    ws.on('message', data => {
      const bytes = new Uint8Array(data)
      if (this.messageGate && !this.messageGate(ws, bytes.length, identity.role)) { ws.close(1008, 'rate limit'); return }
      try {
        if (identity.revoked || !this.conns.has(ws)) return
        if (![MSG_SYNC, MSG_AWARENESS, MSG_IDENTITY].includes(bytes[0])) throw new Error('unknown frame')
        if (bytes[0] === MSG_IDENTITY) {
          if (identity.role !== 'host') throw new Error('host control required')
          const command = readIdentity(bytes)
          if (command.type === 'set-role') this.setRole(command.id, command.role)
          else if (command.type === 'revoke') this.revoke(command.id)
          else throw new Error('unknown host command')
          return
        }
        if (bytes[0] === MSG_AWARENESS) {
          applyOwnedAwareness(bytes, this.awareness, c, this.conns, ws)
          this.#publishPresence()
          return
        }
        if (bytes[0] === MSG_SYNC && identity.role === 'viewer') {
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
      this.#publishPresence()
    })
    ws.send(encodeIdentity({ type: 'identity', identity: publicIdentity(identity) }))
    this.#publishPresence()
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
