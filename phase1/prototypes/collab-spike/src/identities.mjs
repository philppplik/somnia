// An identity is a session-local bearer credential, not a verified human account.
import crypto from 'node:crypto'
export const ROLES = ['host', 'editor', 'viewer']
const token = () => crypto.randomBytes(16).toString('base64url')
export const cleanName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64) : ''
export class Identities {
  constructor(ttlMs = 3600_000) {
    this.ttlMs = ttlMs
    this.records = new Map()
    this.host = this.create('host', 'Host')
  }
  create(role, name = '') {
    if (!ROLES.includes(role)) throw new Error('invalid role')
    const record = { id: crypto.randomUUID(), code: token(), role, name: cleanName(name) || (role === 'host' ? 'Host' : 'Guest'), expiresAt: Date.now() + this.ttlMs, revoked: false }
    this.records.set(record.id, record)
    return record
  }
  authenticate(code) {
    const supplied = Buffer.from(String(code ?? ''))
    let found = null
    for (const record of this.records.values()) {
      const expected = Buffer.from(record.code)
      if (supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected) && !record.revoked && Date.now() <= record.expiresAt) found = record
    }
    return found
  }
  guest(id) {
    const record = this.records.get(id)
    if (!record || record.role === 'host' || record.revoked) throw new Error('unknown guest')
    return record
  }
  setRole(id, role) {
    if (!['editor', 'viewer'].includes(role)) throw new Error('guest role must be editor or viewer')
    this.guest(id).role = role
  }
  revoke(id) { this.guest(id).revoked = true }
}
export const publicIdentity = record => ({ id: record.id, role: record.role, name: record.name })
