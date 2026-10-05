// Separate extension frame: core Yjs sync framing is unchanged.
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
export const MSG_IDENTITY = 2
export function encodeIdentity(payload) {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MSG_IDENTITY)
  encoding.writeVarString(encoder, JSON.stringify(payload))
  return encoding.toUint8Array(encoder)
}
export function readIdentity(bytes) {
  const decoder = decoding.createDecoder(bytes)
  if (decoding.readVarUint(decoder) !== MSG_IDENTITY) return null
  const value = JSON.parse(decoding.readVarString(decoder))
  if (decoder.pos !== bytes.length || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad identity frame')
  return value
}
