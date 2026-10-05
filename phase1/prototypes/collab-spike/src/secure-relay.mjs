// SecureRelay = Relay + transport security (ADR-005 slice "transport-security").
//  - wss (TLS 1.3) with a per-session self-signed certificate; invites carry the fingerprint (pinning.mjs)
//  - many individually revocable / rotatable invites with expiry and use limits (invites.mjs)
//  - rate limits per address and per connection (limits.mjs)
//  - Origin allow-list, refusal of plain ws:// on non-loopback addresses, heartbeat
// Threat model: ../../notes/ADR-005-threat-model.md
import http from 'node:http'
import https from 'node:https'
import { Relay } from './relay.mjs'
import { InviteStore } from './invites.mjs'
import { ConnectionLimiter, TrafficLimiter } from './limits.mjs'
import { generateSelfSigned } from './cert.mjs'

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost'])
export const CLOSE_REVOKED = 4001

export class SecureRelay extends Relay {
  /**
   * @param {object} [o]
   * @param {string} [o.host='127.0.0.1']
   * @param {number} [o.port=0]
   * @param {boolean|{cert:string,key:string,fingerprint:string}} [o.tls=true]  true = generate a session certificate
   * @param {boolean} [o.allowInsecureLan=false]  permit plain ws:// on a non-loopback address (never recommended)
   * @param {string[]|null} [o.allowedOrigins=null]  if set, browser requests (Origin header) must match; clients without Origin pass
   * @param {object} [o.connectionLimits]  see ConnectionLimiter
   * @param {object} [o.trafficLimits]     see TrafficLimiter
   * @param {number} [o.heartbeatMs=30000]
   */
  constructor(o = {}) {
    const host = o.host ?? '127.0.0.1'
    const tlsOpt = o.tls ?? true
    if (!tlsOpt && !LOOPBACK.has(host) && !o.allowInsecureLan) throw new Error('refusing plain ws:// on a non-loopback address; enable tls')
    const identity = tlsOpt === true ? generateSelfSigned({ hosts: ['localhost', '127.0.0.1', ...(LOOPBACK.has(host) ? [] : [host])] }) : tlsOpt || null
    const notFound = (_req, res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found') }
    const server = identity ? https.createServer({ cert: identity.cert, key: identity.key, minVersion: 'TLSv1.3' }, notFound) : http.createServer(notFound)
    server.headersTimeout = 10_000; server.requestTimeout = 10_000
    server.listen(o.port ?? 0, host)

    const invites = new InviteStore(o.invites)
    const conn = new ConnectionLimiter(o.connectionLimits)
    const traffic = new WeakMap()
    const origins = o.allowedOrigins ? new Set(o.allowedOrigins) : null

    super({
      server, scheme: identity ? 'wss' : 'ws', maxClients: o.maxClients, doc: o.doc,
      inviteTtlMs: Infinity, maxAuthFailures: Infinity, // expiry and lockouts are handled per invite / per address below
      verifyGate: info => {
        const origin = info.req.headers.origin
        if (origins && origin && !origins.has(origin)) return { status: 403, reason: 'origin not allowed' }
        return conn.gate(info.req.socket.remoteAddress)
      },
      authenticate: (code, info) => {
        const rec = invites.check(code)
        if (!rec) return null
        invites.consume(rec); conn.success(info.req.socket.remoteAddress)
        return { role: rec.role, id: rec.id }
      },
      onAuthFailure: addr => conn.failure(addr),
      messageGate: (ws, n) => {
        let t = traffic.get(ws); if (!t) traffic.set(ws, t = new TrafficLimiter(o.trafficLimits))
        return t.allow(n)
      },
    })
    this.identity = identity
    this.invites = invites
    this.limiter = conn
    this.hostInvite = invites.create('host', { ttlMs: Infinity })
    this.wss.on('connection', (ws, req) => {
      const addr = req.socket.remoteAddress
      conn.opened(addr); ws.isAlive = true
      ws.on('pong', () => { ws.isAlive = true })
      ws.on('close', () => conn.closed(addr))
    })
    this.timer = setInterval(() => {
      conn.sweep()
      for (const ws of this.conns.keys()) { if (!ws.isAlive) { ws.terminate(); continue } ws.isAlive = false; ws.ping() }
    }, o.heartbeatMs ?? 30_000)
    this.timer.unref()
  }

  get fingerprint() { return this.identity?.fingerprint ?? null }

  #url(code, hostname) {
    const fp = this.fingerprint ? `&fp=${this.fingerprint}` : ''
    return `${this.scheme}://${hostname}:${this.port}/?code=${code}${fp}`
  }

  /** The host's own connection (full rights, loopback). */
  hostUrl() { return this.#url(this.hostInvite.code, '127.0.0.1') }

  /** Creates a fresh invite. Returns { id, role, url, expiresAt }. Hand out the url; keep the id to revoke. */
  createInvite(role, { hostname = '127.0.0.1', ...opts } = {}) {
    if (role === 'host') throw new Error('invite role must be editor or viewer')
    const r = this.invites.create(role, opts)
    return { id: r.id, role, url: this.#url(r.code, hostname), expiresAt: r.expiresAt }
  }
  invite(role, hostname = '127.0.0.1') { return this.createInvite(role, { hostname }).url }

  /** Revokes one invite and disconnects everyone who joined with it. Returns the number of sockets closed. */
  revoke(id) { const ok = this.invites.revoke(id); return ok ? this.#kick(new Set([id])) : 0 }
  revokeRole(role) { return this.#kick(new Set(this.invites.revokeRole(role))) }
  /** Panic button: every invite except the host's, all guests out. */
  revokeAllGuests() { const ids = new Set(this.invites.revokeAll()); this.invites.revoke(this.hostInvite.id); ids.delete(this.hostInvite.id); this.hostInvite = this.invites.create('host', { ttlMs: Infinity }); return this.#kick(ids) }
  /** Replaces an invite with a fresh code, same role. Old guests are disconnected. */
  rotate(id, hostname = '127.0.0.1', opts = {}) {
    const fresh = this.invites.rotate(id, opts); this.#kick(new Set([id]))
    return { id: fresh.id, role: fresh.role, url: this.#url(fresh.code, hostname), expiresAt: fresh.expiresAt }
  }
  #kick(ids) { let n = 0; for (const [ws, c] of this.conns) if (ids.has(c.inviteId)) { ws.close(CLOSE_REVOKED, 'invite revoked'); n++ } return n }

  close() { clearInterval(this.timer); const p = super.close(); this.server.close(); this.server.closeAllConnections?.(); return p }
}
