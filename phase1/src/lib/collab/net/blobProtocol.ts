/**
 * Media blob frames (v11/collab-files). Pull-based, content-addressed, chunked.
 * A document update must stay below the relay's 2 MiB frame cap and the sync handshake sends the whole document in one
 * message, so binary media never goes into the Y.Doc. The doc only carries a small manifest (path -> sha-256, size);
 * the bytes are requested from any peer that holds them, in CHUNK_BYTES pieces, and verified against the hash.
 *
 *   MSG_BLOB (4), varuint kind, then
 *   REQUEST (0): varstring hash, varuint firstChunk, varuint count
 *   CHUNK   (1): varstring hash, varuint index, varuint total, varuint8array data
 */
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {MSG_BLOB} from './protocol';

export const BLOB_REQUEST=0;
export const BLOB_CHUNK=1;
/** 128 KiB: far below the 2 MiB relay frame cap, small enough to pace under the relay's 1 MB/s send budget. */
export const CHUNK_BYTES=128*1024;
export const MAX_REQUEST_WINDOW=8;
export const HASH_RE=/^[0-9a-f]{64}$/;

export type BlobFrame=
 |{kind:'request';hash:string;first:number;count:number}
 |{kind:'chunk';hash:string;index:number;total:number;data:Uint8Array};

export const chunkCount=(size:number)=>Math.ceil(size/CHUNK_BYTES);
/** Exact byte length chunk `index` of a blob of `size` bytes must have. */
export const expectedChunkLength=(size:number,index:number)=>index<chunkCount(size)-1?CHUNK_BYTES:size-CHUNK_BYTES*(chunkCount(size)-1);

export function encodeBlobRequest(hash:string,first:number,count:number):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_BLOB);encoding.writeVarUint(e,BLOB_REQUEST);
 encoding.writeVarString(e,hash);encoding.writeVarUint(e,first);encoding.writeVarUint(e,count);return encoding.toUint8Array(e);}
export function encodeBlobChunk(hash:string,index:number,total:number,data:Uint8Array):Uint8Array{
 const e=encoding.createEncoder();encoding.writeVarUint(e,MSG_BLOB);encoding.writeVarUint(e,BLOB_CHUNK);
 encoding.writeVarString(e,hash);encoding.writeVarUint(e,index);encoding.writeVarUint(e,total);encoding.writeVarUint8Array(e,data);return encoding.toUint8Array(e);}
/** Returns null for anything malformed: a bad frame from a peer is dropped, never trusted. */
export function decodeBlobFrame(bytes:Uint8Array):BlobFrame|null{
 try{
  const d=decoding.createDecoder(bytes);if(decoding.readVarUint(d)!==MSG_BLOB)return null;
  const kind=decoding.readVarUint(d);const hash=decoding.readVarString(d);if(!HASH_RE.test(hash))return null;
  if(kind===BLOB_REQUEST){const first=decoding.readVarUint(d),count=decoding.readVarUint(d);
   if(d.pos!==bytes.length||count<1||count>MAX_REQUEST_WINDOW)return null;return{kind:'request',hash,first,count};}
  if(kind===BLOB_CHUNK){const index=decoding.readVarUint(d),total=decoding.readVarUint(d),data=decoding.readVarUint8Array(d);
   if(d.pos!==bytes.length||total<1||index>=total||data.length>CHUNK_BYTES)return null;return{kind:'chunk',hash,index,total,data};}
  return null;
 }catch{return null;}}

export async function sha256Hex(bytes:Uint8Array):Promise<string>{
 const d=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes as BufferSource));
 return [...d].map(b=>b.toString(16).padStart(2,'0')).join('');}
