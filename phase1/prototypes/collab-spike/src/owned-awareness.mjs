// Validate the entire frame before applying it. One socket owns one awareness id.
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import { cleanName, publicIdentity } from './identities.mjs'
import { assertSafePath } from './paths.mjs'
export function applyOwnedAwareness(bytes, awareness, connection, connections, origin) {
  const outer = decoding.createDecoder(bytes)
  if (decoding.readVarUint(outer) !== 1) throw new Error('bad awareness frame')
  const decoder = decoding.createDecoder(decoding.readVarUint8Array(outer))
  if (outer.pos !== bytes.length || decoding.readVarUint(decoder) !== 1) throw new Error('one awareness id required')
  const id = decoding.readVarUint(decoder), clock = decoding.readVarUint(decoder)
  const state = JSON.parse(decoding.readVarString(decoder))
  if (decoder.pos !== decoder.arr.length || (state !== null && (typeof state !== 'object' || Array.isArray(state)))) throw new Error('bad awareness state')
  if (connection.awarenessId !== undefined && connection.awarenessId !== id) throw new Error('awareness id changed')
  for (const c of connections.values()) if (c !== connection && c.awarenessId === id) throw new Error('awareness id belongs to another guest')
  if (connection.awarenessId === undefined && awareness.getStates().has(id)) throw new Error('awareness id already exists')
  connection.awarenessId = id
  connection.awarenessIds.add(id)
  let safeState = null
  if (state !== null) {
    // Labels are self-reported, never authentication. id and role always come from the credential.
    const name = cleanName(state.user?.name)
    if (name) connection.identity.name = name
    safeState = { user: publicIdentity(connection.identity) }
    if (state.cursor && Number.isSafeInteger(state.cursor.index) && state.cursor.index >= 0) {
      try { assertSafePath(state.cursor.path); safeState.cursor = { path: state.cursor.path, index: state.cursor.index } } catch { /* invalid cursor omitted */ }
    }
  }
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, 1)
  encoding.writeVarUint(encoder, id)
  encoding.writeVarUint(encoder, clock)
  encoding.writeVarString(encoder, JSON.stringify(safeState))
  awarenessProtocol.applyAwarenessUpdate(awareness, encoding.toUint8Array(encoder), origin)
}
