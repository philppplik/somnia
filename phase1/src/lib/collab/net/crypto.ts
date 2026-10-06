/**
 * E2E link key for collab invites (v11/collab-protocol).
 *
 * The invite link carries a 256-bit AES-GCM key in its URL fragment: ws://host:48201/?code=...#key=...
 * Fragments are never sent in an HTTP (WebSocket upgrade) request, so the key stays on the two endpoints.
 * With a key present, every SYNC and AWARENESS frame is wrapped in MSG_ENCRYPTED; IDENTITY frames stay plain
 * (the relay needs them for roles/presence - they carry no document content).
 *
 * Honest limits, also stated in notes/collab-protocol.md:
 * - A blind relay (no key) can no longer enforce "viewers cannot write" or hold the document for late joiners.
 *   Peers sync each other through it instead (handleMessage answers step1 with step2).
 * - The host always sees the content: it owns the key and writes the project to disk.
 * - This protects content in transit, not against a guest who was invited (they hold the key while invited).
 */
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {MSG_ENCRYPTED} from './protocol';

const subtle=()=>globalThis.crypto.subtle;

export function toBase64Url(bytes:Uint8Array):string{
 let s='';for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function fromBase64Url(text:string):Uint8Array{
 if(!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('not base64url');
 const s=atob(text.replace(/-/g,'+').replace(/_/g,'/'));const out=new Uint8Array(s.length);
 for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}

export interface LinkKey{key:CryptoKey;/** first 8 hex chars of sha256(raw key); two people can compare it out of band */fingerprint:string}
/** Fresh random key for a new session. Returns the link fragment value (base64url) plus the imported key. */
export async function newLinkKey():Promise<{param:string;link:LinkKey}>{
 const raw=new Uint8Array(32);globalThis.crypto.getRandomValues(raw);
 return {param:toBase64Url(raw),link:await importLinkKey(toBase64Url(raw))};}
export async function importLinkKey(param:string):Promise<LinkKey>{
 const raw=fromBase64Url(param);if(raw.length!==32)throw new Error('link key must be 32 bytes');
 const key=await subtle().importKey('raw',raw as BufferSource,{name:'AES-GCM'},false,['encrypt','decrypt']);
 const digest=new Uint8Array(await subtle().digest('SHA-256',raw as BufferSource));
 const fingerprint=[...digest.slice(0,4)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {key,fingerprint};}
/** Extract the key parameter from an invite link's fragment, if present. */
export function linkKeyParam(url:string):string|null{
 try{const h=new URL(url).hash.replace(/^#/,'');const m=h.match(/(?:^|&)key=([A-Za-z0-9_-]{43})(?:&|$)/);return m?m[1]:null;}catch{return null;}}

/** Wrap one plaintext frame (MSG_SYNC / MSG_AWARENESS) as a MSG_ENCRYPTED frame. Random 96-bit nonce per frame. */
export async function encryptFrame(link:LinkKey,frame:Uint8Array):Promise<Uint8Array>{
 const nonce=new Uint8Array(12);globalThis.crypto.getRandomValues(nonce);
 const ct=new Uint8Array(await subtle().encrypt({name:'AES-GCM',iv:nonce},link.key,frame as BufferSource));
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_ENCRYPTED);
 const payload=new Uint8Array(nonce.length+ct.length);payload.set(nonce);payload.set(ct,nonce.length);
 encoding.writeVarUint8Array(e,payload);return encoding.toUint8Array(e);}
/** Unwrap a MSG_ENCRYPTED frame. Throws on wrong key, tampering, or a non-encrypted frame. */
export async function decryptFrame(link:LinkKey,bytes:Uint8Array):Promise<Uint8Array>{
 const d=decoding.createDecoder(bytes);
 if(decoding.readVarUint(d)!==MSG_ENCRYPTED)throw new Error('not an encrypted frame');
 const payload=decoding.readVarUint8Array(d);
 if(d.pos!==bytes.length||payload.length<12+16)throw new Error('bad encrypted frame');
 const plain=await subtle().decrypt({name:'AES-GCM',iv:payload.slice(0,12)},link.key,payload.slice(12) as BufferSource);
 return new Uint8Array(plain);}
export const isEncryptedFrame=(bytes:Uint8Array)=>bytes.length>0&&bytes[0]===MSG_ENCRYPTED;
