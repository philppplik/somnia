// Deliberately loopback-only. Public use needs TLS termination, Origin policy,
// per-principal rate limiting and an approved deployment (see README).
import { WebSocketServer } from 'ws'
import { randomBytes, timingSafeEqual } from 'node:crypto'

export const MAX_SIGNAL_BYTES = 32 * 1024
const token = () => randomBytes(32).toString('base64url')
const equal = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export class SignalingRoom {
  constructor({ port = 0, ttlMs = 10 * 60_000, authTimeoutMs = 5_000, now = Date.now } = {}) {
    this.now = now
    this.expiresAt = now() + ttlMs
    this.tokens = { host: token(), guest: token() }
    this.peers = new Map()
    this.wss = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: MAX_SIGNAL_BYTES, perMessageDeflate: false })
    this.expiry = setTimeout(() => this.close(), ttlMs)
    this.expiry.unref()
    this.wss.on('connection', ws => {
      if (this.wss.clients.size > 16) { ws.close(1008, 'Connection limit'); return }
      let role = null, frames = 0, windowStart = now()
      const timer = setTimeout(() => ws.close(1008, 'Authentication required'), authTimeoutMs)
      timer.unref()
      ws.on('error', () => {})
      ws.on('message', (data, binary) => {
        if (now() >= this.expiresAt) return ws.close(1008, 'Room expired')
        if (now() - windowStart >= 1000) { windowStart = now(); frames = 0 }
        if (++frames > 100) return ws.close(1008, 'Rate limit')
        try {
          if (binary) throw new Error('JSON required')
          const message = JSON.parse(data.toString())
          if (!role) {
            if (message.type !== 'auth' || !['host', 'guest'].includes(message.role) || !equal(message.token, this.tokens[message.role])) throw new Error('Bad authentication')
            if (this.peers.has(message.role)) throw new Error('Role occupied')
            role = message.role
            this.peers.set(role, ws)
            clearTimeout(timer)
            ws.send(JSON.stringify({ type: 'authenticated', role }))
            if (this.peers.size === 2) for (const p of this.peers.values()) p.send(JSON.stringify({ type: 'ready' }))
            return
          }
          if (!validSignal(message, role)) throw new Error('Invalid signal')
          const other = this.peers.get(role === 'host' ? 'guest' : 'host')
          if (!other || other.readyState !== 1) throw new Error('Peer unavailable')
          if (other.bufferedAmount > MAX_SIGNAL_BYTES * 4) throw new Error('Peer too slow')
          other.send(JSON.stringify(message))
        } catch { ws.close(1008, 'Rejected') }
      })
      ws.on('close', () => {
        clearTimeout(timer)
        if (role && this.peers.get(role) === ws) {
          this.peers.delete(role)
          // No automatic retry with stale SDP. Start a new room to rejoin.
          for (const p of this.peers.values()) p.close(1000, 'Peer left')
        }
      })
    })
  }
  get ready() { return new Promise((resolve, reject) => this.wss.address() ? resolve() : (this.wss.once('listening', resolve), this.wss.once('error', reject))) }
  get url() { return `ws://127.0.0.1:${this.wss.address().port}` }
  close() {
    clearTimeout(this.expiry)
    for (const ws of this.wss.clients) ws.terminate()
    return new Promise(resolve => this.wss.close(resolve))
  }
}

export function validSignal(m, role) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false
  if (m.type === 'description') {
    const d = m.description
    return d && Object.keys(m).length === 2 && d.type === (role === 'host' ? 'offer' : 'answer') && typeof d.sdp === 'string' && d.sdp.length > 0 && d.sdp.length < 24 * 1024
  }
  if (m.type === 'candidate') {
    const c = m.candidate
    return Object.keys(m).length === 2 && c && typeof c.candidate === 'string' && c.candidate.length < 4096 && (c.sdpMid === null || typeof c.sdpMid === 'string') && (c.sdpMLineIndex === null || Number.isInteger(c.sdpMLineIndex))
  }
  return false
}
