// Self-signed certificate for a host-run relay, built with node:crypto only (no openssl, works on Windows).
// The certificate is not trusted by any CA. Guests trust it by fingerprint pinning (see pinning.mjs).
import crypto from 'node:crypto'
import net from 'node:net'

const len = n => n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255])
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(body.length), body]) }
const seq = (...p) => tlv(0x30, ...p)
const set = (...p) => tlv(0x31, ...p)
const oid = s => {
  const a = s.split('.').map(Number); const out = [a[0] * 40 + a[1]]
  for (const n of a.slice(2)) { const b = [n & 127]; let v = n >> 7; while (v) { b.unshift((v & 127) | 128); v >>= 7 } out.push(...b) }
  return tlv(0x06, Buffer.from(out))
}
const utc = d => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'))
const ECDSA_SHA256 = oid('1.2.840.10045.4.3.2')

/**
 * @param {object} [o]
 * @param {string[]} [o.hosts]  DNS names and IP addresses the certificate is valid for.
 * @param {number} [o.days=2]   Validity. Short on purpose: one cert per session.
 * @returns {{cert:string,key:string,fingerprint:string}} PEM cert, PEM key, SHA-256 fingerprint as lowercase hex (no colons)
 */
export function generateSelfSigned({ hosts = ['localhost', '127.0.0.1'], days = 2 } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const name = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from('somnia-relay')))))
  const san = seq(...hosts.map(h => net.isIP(h)
    ? tlv(0x87, Buffer.from(net.isIPv4(h) ? h.split('.').map(Number) : ipv6(h)))
    : tlv(0x82, Buffer.from(h))))
  const ext = seq(
    seq(oid('2.5.29.19'), tlv(0x01, Buffer.from([0xff])), tlv(0x04, seq())),                  // basicConstraints CA:false (critical)
    seq(oid('2.5.29.17'), tlv(0x04, san)))                                                    // subjectAltName
  const now = Date.now()
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),                                                   // v3
    tlv(0x02, Buffer.concat([Buffer.from([0x01]), crypto.randomBytes(15)])),                  // positive serial
    seq(ECDSA_SHA256), name,
    seq(utc(new Date(now - 60_000)), utc(new Date(now + days * 86400_000))),
    name, Buffer.from(publicKey.export({ type: 'spki', format: 'der' })),
    tlv(0xa3, ext))
  const sig = crypto.sign('sha256', tbs, { key: privateKey, dsaEncoding: 'der' })
  const der = seq(tbs, seq(ECDSA_SHA256), tlv(0x03, Buffer.concat([Buffer.from([0]), sig])))
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`
  return { cert: pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }), fingerprint: fingerprintOf(der) }
}

function ipv6(h) {
  const [l, r = ''] = h.split('::'); const L = l ? l.split(':') : [], R = r ? r.split(':') : []
  const all = [...L, ...Array(8 - L.length - R.length).fill('0'), ...R]
  return all.flatMap(g => { const v = parseInt(g, 16); return [v >> 8, v & 255] })
}

/** SHA-256 over the DER certificate, lowercase hex. Accepts DER bytes. */
export const fingerprintOf = der => crypto.createHash('sha256').update(der).digest('hex')
