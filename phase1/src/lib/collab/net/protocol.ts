/**
 * Collab wire format (v11/collab-protocol). Binary frames, y-websocket convention: the first varuint is the message type.
 * Compatible with the ADR-005 spike relay (prototypes/collab-spike/src/protocol.mjs + identity-protocol.mjs):
 * a guest built on this module talks to that relay unchanged.
 *
 *   MSG_SYNC (0)      varuint 0, then a y-protocols sync sub-message (0 = step1, 1 = step2, 2 = update)
 *   MSG_AWARENESS (1) varuint 1, then varuint8array with a y-protocols awareness update
 *   MSG_IDENTITY (2)  varuint 2, then a varstring JSON payload (roles, presence, host commands). Never encrypted.
 *   MSG_ENCRYPTED (3) varuint 3, then varuint8array(nonce + AES-GCM ciphertext). The plaintext is a MSG_SYNC or
 *                     MSG_AWARENESS frame. Used when the invite link carries an E2E link key (see crypto.ts):
 *                     a relay on the path - including a self-hosted one - cannot read or merge the content.
 */
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type {Awareness} from 'y-protocols/awareness';

export const MSG_SYNC=0;
export const MSG_AWARENESS=1;
export const MSG_IDENTITY=2;
export const MSG_ENCRYPTED=3;
/** Media blob transfer (v11/collab-files): request/chunk frames, see blobProtocol.ts. Always travels inside MSG_ENCRYPTED when the link has a key. */
export const MSG_BLOB=4;
/** Liveness (collab core fix 9.1): application-level ping/pong so a silently dead TCP connection is noticed.
 *  Peers that predate these frames ignore them (unknown types are dropped), which only means no pong.
 *  5 is MSG_CHAT_SYNC (chatProtocol.ts) - the chat layer took it first. */
export const MSG_PING=6;
export const MSG_PONG=7;
/** Chunked MSG_SYNC (collab core fix 9.2): one transaction over the relay cap travels as ordered parts.
 *  The payload of part 0..count-1 concatenated is the original MSG_SYNC frame, type byte included. */
export const MSG_SYNC_CHUNK=8;
/** Hard frame cap, same as the spike relay enforces. */
export const MAX_MESSAGE_BYTES=5*1024*1024;
/**
 * Relay-Wire-Contract v0 (self-hosted relay): frames over 2 MiB are kicked with close 1009.
 * Oversized MSG_SYNC frames are split into MSG_SYNC_CHUNK parts (encodeSyncChunk) so a big edit or
 * the initial sync of a big project no longer breaks the connection. The smaller limit wins in relay mode.
 */
export const MAX_RELAY_FRAME_BYTES=2*1024*1024;
/** Payload per MSG_SYNC_CHUNK part: comfortably under the relay cap with crypto envelope and framing. */
export const SYNC_CHUNK_BYTES=1024*1024;
/** Most parts a receiver buffers per batch (16 MiB reassembled); bigger syncs are refused, not held. */
export const SYNC_CHUNK_MAX_PARTS=16;

export type CollabRole='host'|'editor'|'viewer';
/** Session-local credential projection. Names are self-reported; only id and role come from the invite credential. */
export interface PublicIdentity{id:string;role:CollabRole;name:string}
export interface PresencePerson extends PublicIdentity{connected:boolean;awarenessId:number|null}
/** Relay -> client: your own credential. */
export interface IdentityAssign{type:'identity';identity:PublicIdentity}
/** Relay -> client: who is here. */
export interface PresenceUpdate{type:'presence';people:PresencePerson[]}
/** Client(host) -> relay only. A guest socket sending one of these is dropped by the relay. */
export interface SetRoleCommand{type:'set-role';id:string;role:'editor'|'viewer'}
export interface RevokeCommand{type:'revoke';id:string}
export type IdentityMessage=IdentityAssign|PresenceUpdate|SetRoleCommand|RevokeCommand;

export function encodeSyncStep1(doc:Y.Doc):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_SYNC);syncProtocol.writeSyncStep1(e,doc);return encoding.toUint8Array(e);}
export function encodeUpdate(update:Uint8Array):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_SYNC);syncProtocol.writeUpdate(e,update);return encoding.toUint8Array(e);}
export function encodeAwareness(awareness:Awareness,clients:number[]):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_AWARENESS);
 encoding.writeVarUint8Array(e,awarenessProtocol.encodeAwarenessUpdate(awareness,clients));return encoding.toUint8Array(e);}
export function encodePing():Uint8Array{return new Uint8Array([MSG_PING]);}
export function encodePong():Uint8Array{return new Uint8Array([MSG_PONG]);}

export function encodeSyncChunk(batch:string,index:number,count:number,payload:Uint8Array):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_SYNC_CHUNK);encoding.writeVarString(e,batch);
 encoding.writeVarUint(e,index);encoding.writeVarUint(e,count);encoding.writeVarUint8Array(e,payload);return encoding.toUint8Array(e);}
export function decodeSyncChunk(bytes:Uint8Array):{batch:string;index:number;count:number;payload:Uint8Array}|null{
 try{
  const d=decoding.createDecoder(bytes);if(decoding.readVarUint(d)!==MSG_SYNC_CHUNK)return null;
  const batch=decoding.readVarString(d);if(!/^[a-z0-9-]{1,40}$/i.test(batch))return null;
  const index=decoding.readVarUint(d),count=decoding.readVarUint(d);
  if(count<1||count>SYNC_CHUNK_MAX_PARTS||index>=count)return null;
  const payload=decoding.readVarUint8Array(d);
  if(payload.length<1||payload.length>SYNC_CHUNK_BYTES+64||decoding.hasContent(d))return null;
  return{batch,index,count,payload};
 }catch{return null;}}

export function encodeIdentity(payload:IdentityMessage):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_IDENTITY);encoding.writeVarString(e,JSON.stringify(payload));return encoding.toUint8Array(e);}

/** Sync sub-type without applying: 0 step1, 1 step2, 2 update, -1 not a sync frame. */
export function peekSyncType(bytes:Uint8Array):number{
 const d=decoding.createDecoder(bytes);if(decoding.readVarUint(d)!==MSG_SYNC)return -1;return decoding.readVarUint(d);}

export function readIdentity(bytes:Uint8Array):IdentityMessage|null{
 const d=decoding.createDecoder(bytes);if(decoding.readVarUint(d)!==MSG_IDENTITY)return null;
 const value=JSON.parse(decoding.readVarString(d)) as unknown;
 if(d.pos!==bytes.length||!value||typeof value!=='object'||Array.isArray(value))throw new Error('bad identity frame');
 return value as IdentityMessage;}

/**
 * Apply one incoming SYNC or AWARENESS frame to doc/awareness. Returns the reply frame to send back, or null.
 * Answers a sync step1 with step2 automatically - that is what lets a blind relay (E2E mode) stay dumb:
 * peers sync each other through it. Throws on malformed frames; callers should drop the connection then.
 */
export function handleMessage(bytes:Uint8Array,doc:Y.Doc,awareness:Awareness,origin:unknown):Uint8Array|null{
 const d=decoding.createDecoder(bytes);const type=decoding.readVarUint(d);
 if(type===MSG_SYNC){
  const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_SYNC);
  syncProtocol.readSyncMessage(d,e,doc,origin);
  return encoding.length(e)>1?encoding.toUint8Array(e):null;}
 if(type===MSG_AWARENESS){awarenessProtocol.applyAwarenessUpdate(awareness,decoding.readVarUint8Array(d),origin);return null;}
 if(type===MSG_PING||type===MSG_PONG)return null;   // liveness carries no document state; peers and test relays may see it
 throw new Error(`cannot apply frame type ${type} here`);
}
