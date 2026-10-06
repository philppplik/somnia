import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as sync from "y-protocols/sync";
import type * as Y from "yjs";
/** Opaque relay subchannel. Version 1 carries a separate RAM-only Y.Doc, not project files. */
export const MSG_CHAT_SYNC = 5;
export const CHAT_WIRE_VERSION = 1;
export function chatStep1(doc: Y.Doc) {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_CHAT_SYNC);
  encoding.writeVarUint(e, CHAT_WIRE_VERSION);
  sync.writeSyncStep1(e, doc);
  return encoding.toUint8Array(e);
}
export function chatUpdate(update: Uint8Array) {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_CHAT_SYNC);
  encoding.writeVarUint(e, CHAT_WIRE_VERSION);
  sync.writeUpdate(e, update);
  return encoding.toUint8Array(e);
}
export function handleChatFrame(
  bytes: Uint8Array,
  doc: Y.Doc,
  origin: unknown,
) {
  const d = decoding.createDecoder(bytes);
  if (
    decoding.readVarUint(d) !== MSG_CHAT_SYNC ||
    decoding.readVarUint(d) !== CHAT_WIRE_VERSION
  )
    return null;
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, MSG_CHAT_SYNC);
  encoding.writeVarUint(e, CHAT_WIRE_VERSION);
  sync.readSyncMessage(d, e, doc, origin);
  return encoding.length(e) > 2 ? encoding.toUint8Array(e) : null;
}
