/**
 * Seam between the session-safety port and the Lifecycle subsystem.
 *
 * In v12.2.0-beta.4, `lifecycleAdapter.ts` imported `checksumParts` from
 * `../lifecycle/checksum` and the `StudioLifecycleAdapter`/`StudioSnapshot`
 * types from `../lifecycle/types`. The Lifecycle subsystem has not been ported
 * to the beta.5 line, so the slice of that contract this package needs is
 * declared here as a small interface with a no-op default host.
 *
 * TODO(lifecycle wiring): when the Lifecycle subsystem lands on beta.5, call
 * `setLifecycleHost()` once at app start with the real implementation:
 * `checksum` = `checksumParts` from `lib/lifecycle/checksum` (the algorithm
 * below is byte-for-byte compatible, so existing snapshots stay verifiable)
 * and `registerAdapter` = `registerLifecycleAdapter` from
 * `lib/lifecycle/adapters`. Then delete the local fallback checksum.
 */

/** Identity + payload checksum over heterogeneous parts (see the lifecycle checkpoint contract). */
export type LifecycleChecksum=(parts:readonly (string|number|Uint8Array|null|undefined)[])=>string;

/**
 * Versioned semantic checkpoint of one studio's recoverable state, as the lifecycle manager
 * consumes it. The payload is a reference list into the recovery store, never document bytes.
 */
export interface StudioSnapshotRef{
 studioId:string;schemaVersion:number;revision:number;capturedAt:number;bytesEstimate:number;checksum:string;payload:unknown;
}

/** Per-studio hooks the lifecycle manager calls. All hooks are optional. */
export interface RecoveryLifecycleHooks{
 /** Estimated exclusive bytes of reconstructible runtime resources. */
 estimateBytes?():number;
 /** Resource identities for job-lease lookups: 'studio:<id>' plus studio-owned ids. */
 resourceIds?():readonly string[];
 /** Owned reasons that currently forbid suspension (checkpoint pins, leases). */
 pinReasons?():readonly string[];
 /** True while this studio holds the sole recoverable copy of unsaved edits. */
 hasUnsavedChanges?():boolean;
 /** Capture a verified, current checkpoint reference. Return null to refuse suspension. */
 snapshot?():Promise<StudioSnapshotRef|null>;
 /** Release view-owned workers, timers, decoders and caches. */
 suspend?():Promise<void>;
 /** Verify a checkpoint reference; the real restore happens when the view mounts. */
 resume?(snapshot:StudioSnapshotRef):Promise<void>;
 /** Drop all runtime data. Never called while hasUnsavedChanges() is true. */
 dispose?():Promise<void>;
}

/** What the (future) Lifecycle subsystem provides to this package. */
export interface LifecycleHost{
 checksum:LifecycleChecksum;
 /** Register a studio's hooks with the lifecycle manager; returns an unregister function. */
 registerAdapter(studioId:string,hooks:RecoveryLifecycleHooks):()=>void;
}

/* Local fallback checksum: FNV-1a in two 32-bit lanes, rendered as 64-bit hex. Identical to
 * beta.4's lib/lifecycle/checksum.ts, so reference checksums stay comparable once the real
 * host is injected. Fast and deterministic; not a security hash. */
const fnv=(data:Uint8Array,seed:number):number=>{let h=seed>>>0;for(let i=0;i<data.length;i++){h^=data[i];h=Math.imul(h,0x01000193)>>>0;}return h>>>0;};
const utf8=(s:string):Uint8Array=>new TextEncoder().encode(s);
export function checksumPartsLocal(parts:readonly (string|number|Uint8Array|null|undefined)[]):string{
 const chunks:Uint8Array[]=[];
 for(const part of parts){
  if(part==null)chunks.push(utf8('\0n\0'));
  else if(typeof part==='number')chunks.push(utf8(`\0d${part}\0`));
  else if(typeof part==='string')chunks.push(utf8(`\0s${part.length}:${part}\0`));
  else{chunks.push(utf8(`\0b${part.byteLength}:`),part,utf8('\0'));}
 }
 const total=chunks.reduce((n,c)=>n+c.byteLength,0);const flat=new Uint8Array(total);let off=0;
 for(const c of chunks){flat.set(c,off);off+=c.byteLength;}
 const a=fnv(flat,0x811c9dc5),b=fnv(flat,0x01000193);
 return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}

/** No-op default: checksums work (local fallback), registration goes nowhere until the Lifecycle subsystem is wired. */
const noopHost:LifecycleHost={checksum:checksumPartsLocal,registerAdapter:()=>()=>undefined};
let host:LifecycleHost=noopHost;
export const getLifecycleHost=():LifecycleHost=>host;
/** Install the real lifecycle host, or null to return to the no-op default (tests). */
export const setLifecycleHost=(h:LifecycleHost|null):void=>{host=h??noopHost;};
