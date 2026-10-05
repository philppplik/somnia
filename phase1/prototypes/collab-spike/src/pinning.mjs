// Guest side of TLS: trust exactly the certificate whose fingerprint is in the invite.
// The check happens after the TLS handshake and BEFORE the HTTP upgrade request (which carries the invite code)
// is written, so a man in the middle never sees the code.
import tls from 'node:tls'
import crypto from 'node:crypto'

export function parseInvite(url) {
  const u = new URL(url)
  const fp = (u.searchParams.get('fp') ?? '').toLowerCase()
  if (u.protocol === 'wss:' && !/^[0-9a-f]{64}$/.test(fp)) throw new Error('wss invite needs a 64-hex fp parameter')
  return { secure: u.protocol === 'wss:', host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port || 443), fp }
}

const sameFp = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Opens a TLS socket and verifies the pin. Rejects (and destroys the socket) on mismatch. */
export function connectPinned({ host, port, fp }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: /^[\d.:]+$/.test(host) ? undefined : host, rejectUnauthorized: false, minVersion: 'TLSv1.3' })
    sock.once('error', reject)
    sock.once('secureConnect', () => {
      const got = crypto.createHash('sha256').update(sock.getPeerCertificate().raw).digest('hex')
      if (!sameFp(got, fp)) { sock.destroy(); return reject(new Error('certificate fingerprint mismatch')) }
      sock.removeListener('error', reject); resolve(sock)
    })
  })
}

/** Returns a `prepare` function for Session: async () => ws options (or undefined for plain ws://). */
export function pinnedPrepare(inviteUrl) {
  const inv = parseInvite(inviteUrl)
  if (!inv.secure) return async () => undefined
  return async () => { const sock = await connectPinned(inv); return { createConnection: () => sock } }
}
