/** Versioned, checksummed recovery snapshots (concept: docs/concepts/performance-resource-architecture.md section 4). */
export const SNAPSHOT_SCHEMA=1;
const MAGIC=[0x53,0x4f,0x4d,0x53]; // "SOMS"
export type HistoryCheckpoint=
 | {kind:'none'}
 | {kind:'journal';data:unknown;truncated:boolean};
export interface SnapshotMeta{
 schema:number;sessionId:string;studio:string;format:string;engineVersion:string;
 /** Fingerprint of the source file this session was opened from. */
 sourceFingerprint:string;revision:number;generation:number;createdAt:number;
 history:HistoryCheckpoint;view:Record<string,unknown>;payloadBytes:number;checksum:string;
}
export interface Snapshot{meta:SnapshotMeta;payload:Uint8Array}
export type SnapshotErrorKind='truncated'|'bad-magic'|'bad-header'|'unsupported-schema'|'checksum-mismatch'|'size-mismatch';
export class SnapshotError extends Error{constructor(readonly kind:SnapshotErrorKind,message:string){super(message);this.name='SnapshotError';}}
const enc=new TextEncoder(),dec=new TextDecoder();
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function sha256Hex(bytes:Uint8Array):Promise<string>{return hex(await crypto.subtle.digest('SHA-256',bytes as BufferSource));}
/** Stable id for "these exact source bytes". */
export async function fingerprintBytes(bytes:Uint8Array):Promise<string>{return `${bytes.byteLength}:${(await sha256Hex(bytes)).slice(0,32)}`;}
/** View state must be plain data: no handles, blob URLs or credential-looking keys. */
export function assertPlainView(view:unknown,path='view'):void{
 if(view===null||typeof view==='number'||typeof view==='boolean')return;
 if(typeof view==='string'){if(/^(blob|filesystem):/i.test(view))throw new Error(`${path} holds a transient URL`);return;}
 if(Array.isArray(view)){view.forEach((v,i)=>assertPlainView(v,`${path}[${i}]`));return;}
 if(typeof view==='object'){for(const [k,v] of Object.entries(view as object)){if(/(api[-_]?key|token|secret|password|authorization)/i.test(k))throw new Error(`${path}.${k} looks like a credential`);assertPlainView(v,`${path}.${k}`);}return;}
 throw new Error(`${path} is not plain data (${typeof view})`);
}
const canonical=(m:SnapshotMeta)=>JSON.stringify({...m,checksum:''});
async function checksumOf(m:SnapshotMeta,payload:Uint8Array){
 const head=enc.encode(canonical(m));const all=new Uint8Array(head.length+payload.length);all.set(head);all.set(payload,head.length);return sha256Hex(all);
}
export async function createSnapshot(input:Omit<SnapshotMeta,'schema'|'payloadBytes'|'checksum'|'createdAt'>&{createdAt?:number},payload:Uint8Array):Promise<Snapshot>{
 assertPlainView(input.view);
 const meta:SnapshotMeta={...input,schema:SNAPSHOT_SCHEMA,createdAt:input.createdAt??Date.now(),payloadBytes:payload.byteLength,checksum:''};
 meta.checksum=await checksumOf(meta,payload);return{meta,payload};
}
/** Container: magic(4) | headerLen u32 LE | header JSON | payload. */
export function encodeSnapshot(s:Snapshot):Uint8Array{
 const head=enc.encode(JSON.stringify(s.meta));const out=new Uint8Array(8+head.length+s.payload.length);
 out.set(MAGIC);new DataView(out.buffer).setUint32(4,head.length,true);out.set(head,8);out.set(s.payload,8+head.length);return out;
}
export async function decodeSnapshot(bytes:Uint8Array):Promise<Snapshot>{
 if(bytes.length<8)throw new SnapshotError('truncated','Recovery snapshot is truncated.');
 if(MAGIC.some((m,i)=>bytes[i]!==m))throw new SnapshotError('bad-magic','Not a recovery snapshot.');
 const len=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true);
 if(8+len>bytes.length)throw new SnapshotError('truncated','Recovery snapshot header is truncated.');
 let meta:SnapshotMeta;try{meta=JSON.parse(dec.decode(bytes.subarray(8,8+len)));}catch{throw new SnapshotError('bad-header','Recovery snapshot header is unreadable.');}
 if(!meta||typeof meta.schema!=='number'||typeof meta.checksum!=='string')throw new SnapshotError('bad-header','Recovery snapshot header is malformed.');
 if(meta.schema!==SNAPSHOT_SCHEMA)throw new SnapshotError('unsupported-schema',`Recovery snapshot schema ${meta.schema} is not supported (expected ${SNAPSHOT_SCHEMA}).`);
 const payload=bytes.slice(8+len);
 if(payload.length!==meta.payloadBytes)throw new SnapshotError('size-mismatch','Recovery snapshot payload size does not match its header.');
 if(await checksumOf(meta,payload)!==meta.checksum)throw new SnapshotError('checksum-mismatch','Recovery snapshot checksum does not match.');
 return{meta,payload};
}
