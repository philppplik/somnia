// Rate limiting for the relay. Pure logic with an injectable clock, so tests do not sleep.

export class TokenBucket {
  constructor(ratePerSec, burst, now = () => Date.now()) { this.rate = ratePerSec; this.burst = burst; this.tokens = burst; this.now = now; this.last = now() }
  take(n = 1) {
    const t = this.now(); this.tokens = Math.min(this.burst, this.tokens + (t - this.last) / 1000 * this.rate); this.last = t
    if (this.tokens < n) return false
    this.tokens -= n; return true
  }
}

/** Per-address limits on handshakes: attempt rate, failed-code lockout (temporary, grows on repeat), open connections. */
export class ConnectionLimiter {
  constructor({ attemptsPerMin = 30, maxFailures = 5, lockoutMs = 5 * 60_000, maxLockoutMs = 60 * 60_000, maxPerAddress = 4, now = () => Date.now() } = {}) {
    Object.assign(this, { attemptsPerMin, maxFailures, lockoutMs, maxLockoutMs, maxPerAddress, now })
    this.addrs = new Map()
  }
  #a(addr) { let a = this.addrs.get(addr); if (!a) this.addrs.set(addr, a = { attempts: [], failures: 0, lockedUntil: 0, strikes: 0, open: 0 }); return a }

  /** Call at handshake start. Returns null to proceed or { status, reason }. */
  gate(addr) {
    const a = this.#a(addr), t = this.now()
    if (t < a.lockedUntil) return { status: 429, reason: 'blocked' }
    a.attempts = a.attempts.filter(x => t - x < 60_000); a.attempts.push(t)
    if (a.attempts.length > this.attemptsPerMin) return { status: 429, reason: 'too many attempts' }
    if (a.open >= this.maxPerAddress) return { status: 429, reason: 'too many connections from this address' }
    return null
  }
  failure(addr) {
    const a = this.#a(addr)
    if (++a.failures >= this.maxFailures) {
      a.failures = 0; a.strikes++
      a.lockedUntil = this.now() + Math.min(this.maxLockoutMs, this.lockoutMs * 2 ** (a.strikes - 1))
    }
  }
  success(addr) { this.#a(addr).failures = 0 }
  opened(addr) { this.#a(addr).open++ }
  closed(addr) { const a = this.#a(addr); a.open = Math.max(0, a.open - 1) }
  /** Drops idle entries so the map cannot grow without bound. */
  sweep() { const t = this.now(); for (const [k, a] of this.addrs) if (!a.open && t >= a.lockedUntil && !a.attempts.some(x => t - x < 60_000)) this.addrs.delete(k) }
}

/** Per-connection traffic budget: messages/s and bytes/s. */
export class TrafficLimiter {
  constructor({ msgsPerSec = 100, msgBurst = 300, bytesPerSec = 1_000_000, byteBurst = 5_000_000, now = () => Date.now() } = {}) {
    this.m = new TokenBucket(msgsPerSec, msgBurst, now); this.b = new TokenBucket(bytesPerSec, byteBurst, now)
  }
  allow(bytes) { return this.m.take(1) && this.b.take(bytes) }
}
