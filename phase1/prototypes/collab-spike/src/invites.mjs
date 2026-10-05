// Invite codes: many per session, individually revocable, rotatable, with expiry and use limits.
// Only a SHA-256 hash of each code is kept, so a memory dump or log of the store does not leak usable codes.
import crypto from 'node:crypto'

const hash = c => crypto.createHash('sha256').update(String(c)).digest('hex')

export class InviteStore {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.byHash = new Map(); this.byId = new Map() }

  /** @returns {{id:string, code:string, role:string, expiresAt:number|null}} the code is shown once and not stored. */
  create(role, { ttlMs = 3600_000, maxUses = Infinity, label = '' } = {}) {
    if (!['host', 'editor', 'viewer'].includes(role)) throw new Error('bad role')
    const code = crypto.randomBytes(16).toString('base64url'), id = crypto.randomBytes(6).toString('hex')
    const rec = { id, role, label, uses: 0, maxUses, revoked: false, expiresAt: Number.isFinite(ttlMs) ? this.now() + ttlMs : null, hash: hash(code) }
    this.byHash.set(rec.hash, rec); this.byId.set(id, rec)
    return { id, code, role, expiresAt: rec.expiresAt }
  }

  /** Looks a code up. Does not count a use; call consume() once the connection is accepted. */
  check(code) {
    const rec = this.byHash.get(hash(code ?? '')) // hash lookup: no early exit on the secret itself
    if (!rec || rec.revoked) return null
    if (rec.expiresAt !== null && this.now() > rec.expiresAt) return null
    if (rec.uses >= rec.maxUses) return null
    return rec
  }
  consume(rec) { rec.uses++ }

  revoke(id) { const r = this.byId.get(id); if (!r) return false; r.revoked = true; return true }
  /** Revokes every live invite of a role. Returns their ids. */
  revokeRole(role) { const ids = []; for (const r of this.byId.values()) if (r.role === role && !r.revoked) { r.revoked = true; ids.push(r.id) } return ids }
  revokeAll() { const ids = []; for (const r of this.byId.values()) if (!r.revoked) { r.revoked = true; ids.push(r.id) } return ids }
  /** Replaces an invite: old one dies, a fresh one with the same role/limits is returned. */
  rotate(id, opts = {}) {
    const r = this.byId.get(id); if (!r) throw new Error('unknown invite')
    this.revoke(id)
    return this.create(r.role, { ttlMs: opts.ttlMs ?? (r.expiresAt === null ? Infinity : Math.max(60_000, r.expiresAt - this.now())), maxUses: opts.maxUses ?? r.maxUses, label: r.label })
  }
  list() { return [...this.byId.values()].map(({ hash: _h, ...r }) => ({ ...r, active: !r.revoked && (r.expiresAt === null || this.now() <= r.expiresAt) && r.uses < r.maxUses })) }
}
