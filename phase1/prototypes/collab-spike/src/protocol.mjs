// Wire format follows the y-websocket convention: first varuint is the message type.
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'

export const MSG_SYNC = 0
export const MSG_AWARENESS = 1
export const MAX_MESSAGE_BYTES = 5 * 1024 * 1024

export function encodeSyncStep1(doc) {
  const e = encoding.createEncoder()
  encoding.writeVarUint(e, MSG_SYNC)
  syncProtocol.writeSyncStep1(e, doc)
  return encoding.toUint8Array(e)
}

export function encodeAwareness(awareness, clients) {
  const e = encoding.createEncoder()
  encoding.writeVarUint(e, MSG_AWARENESS)
  encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(awareness, clients))
  return encoding.toUint8Array(e)
}

export function encodeUpdate(update) {
  const e = encoding.createEncoder()
  encoding.writeVarUint(e, MSG_SYNC)
  syncProtocol.writeUpdate(e, update)
  return encoding.toUint8Array(e)
}

/** Peek at a sync message: returns the sub-type (0 step1, 1 step2, 2 update) without applying it. */
export function peekSyncType(bytes) {
  const d = decoding.createDecoder(bytes)
  if (decoding.readVarUint(d) !== MSG_SYNC) return -1
  return decoding.readVarUint(d)
}

/** Apply an incoming message to doc/awareness. Returns a reply (Uint8Array) or null. */
export function handleMessage(bytes, doc, awareness, origin) {
  const d = decoding.createDecoder(bytes)
  const type = decoding.readVarUint(d)
  if (type === MSG_SYNC) {
    const e = encoding.createEncoder()
    encoding.writeVarUint(e, MSG_SYNC)
    syncProtocol.readSyncMessage(d, e, doc, origin)
    return encoding.length(e) > 1 ? encoding.toUint8Array(e) : null
  }
  if (type === MSG_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(d), origin)
  }
  return null
}
