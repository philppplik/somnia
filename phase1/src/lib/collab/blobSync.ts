/**
 * Media sync for a collab session (v11/collab-files): images and PDFs from opened folders reach the other participants.
 *
 * - Manifest: Y.Map 'media' in the shared doc, path -> {hash (sha-256 hex), size}. Small, converges like everything else,
 *   and a late joiner gets it with the normal sync handshake.
 * - Bytes: never in the doc (see net/blobProtocol.ts). A peer that lacks a hash asks for chunks; every peer that holds the
 *   blob may answer. Answers are paced under the relay's per-connection send budget and de-duplicated: a responder that
 *   hears the chunk from someone else during its jitter delay stays quiet.
 * - Trust: the receiver checks path, size limits, chunk length and the final sha-256 against the manifest before the bytes
 *   reach the app. The app then runs its own PNG/JPEG/PDF magic-byte check. Received media is kept in memory
 *   (Files > Previews) and is never written to the host's disk.
 */
import type {CollabDoc} from './collabDoc';
import {isSafeProjectPath} from './paths';
import {HASH_RE,CHUNK_BYTES,chunkCount,expectedChunkLength,decodeBlobFrame,encodeBlobRequest,encodeBlobChunk,sha256Hex,MAX_REQUEST_WINDOW} from './net/blobProtocol';

export const MAX_SHARED_MEDIA_FILES=200;
export const MAX_SHARED_MEDIA_BYTES=60_000_000;
export const MAX_SHARED_MEDIA_FILE=25_000_000;
export const MEDIA_PATH=/\.(png|jpe?g|pdf)$/i;

export interface MediaPort{
 /** Media files this window currently shows. `read` returns the bytes. */
 list():{path:string;/** changes whenever the bytes change (object URL, version) */id:string;size:number;read():Promise<Uint8Array>}[];
 /** Store received bytes. Returns an error text when the app refuses them (not a real PNG/JPEG/PDF, too large). */
 add(path:string,bytes:Uint8Array):Promise<{ok:true}|{error:string}>;
 subscribe(fn:()=>void):()=>void;
}
export interface BlobSyncDeps{
 port:MediaPort;
 /** Send one blob frame. False = socket not open. */
 send(frame:Uint8Array):boolean;
 /** Called when a peer-visible fact changes (counts, failures). */
 onChange?():void;
}
export interface BlobSyncOptions{
 /** Paced upload rate for answers. Relay default budget is 1,000,000 B/s per connection; stay well below. Default 400,000. */
 bytesPerSec?:number;
 /** Responder jitter window in ms. Default 120. */
 jitterMs?:number;
 /** Retry interval for unanswered requests in ms. Default 2000. */
 retryMs?:number;
 /** No-progress retries before a download is reported as unavailable. Default 8. */
 maxRetries?:number;
 random?:()=>number;
 now?:()=>number;
}
export interface MediaFailure{path:string;reason:'unavailable'|'corrupt'|'refused'|'limit';message:string}
export interface MediaSnapshot{shared:number;received:number;pending:number;failed:MediaFailure[]}
interface Entry{hash:string;size:number}
interface Download{hash:string;size:number;total:number;chunks:Map<number,Uint8Array>;paths:Set<string>;idle:number;corrupt:number}

export const parseManifestEntry=(path:unknown,v:unknown):Entry|null=>{
 if(typeof path!=='string'||!isSafeProjectPath(path)||!MEDIA_PATH.test(path))return null;
 if(!v||typeof v!=='object')return null;const {hash,size}=v as Record<string,unknown>;
 if(typeof hash!=='string'||!HASH_RE.test(hash)||typeof size!=='number'||!Number.isInteger(size)||size<1||size>MAX_SHARED_MEDIA_FILE)return null;
 return{hash,size};};

export class BlobSync{
 private blobs=new Map<string,Uint8Array>();      // hash -> bytes we hold (served to peers)
 private known=new Map<string,string>();           // path -> hash this window holds locally
 private downloads=new Map<string,Download>();
 private failed=new Map<string,MediaFailure>();
 private heard=new Map<string,number>();           // "hash:index" -> time a chunk was overheard
 private queue:{hash:string;index:number;key:string}[]=[];
 private nextFree=0;private drain:ReturnType<typeof setTimeout>|null=null;
 private retry:ReturnType<typeof setInterval>|null=null;
 private hashes=new Map<string,{id:string;size:number;hash:string}>(); // path -> hash of the local bytes, so unchanged files are not re-read
 private stopped=false;private scanning=false;private rescan=false;private received=0;
 private offPort:()=>void;
 private o:Required<Omit<BlobSyncOptions,'random'|'now'>>&{random:()=>number;now:()=>number};
 private onManifest=()=>{void this.scan();};
 constructor(private c:CollabDoc,private d:BlobSyncDeps,opts:BlobSyncOptions={}){
  this.o={bytesPerSec:opts.bytesPerSec??400_000,jitterMs:opts.jitterMs??120,retryMs:opts.retryMs??2000,maxRetries:opts.maxRetries??8,
   random:opts.random??Math.random,now:opts.now??Date.now};
  this.media.observe(this.onManifest);
  this.offPort=d.port.subscribe(()=>{void this.scan();});
  this.retry=setInterval(()=>this.tick(),this.o.retryMs);
  void this.scan();}
 private get media(){return this.c.doc.getMap<Entry>('media');}

 snapshot():MediaSnapshot{
  return{shared:this.manifest().size,received:this.received,pending:this.downloads.size,failed:[...this.failed.values()]};}
 private manifest():Map<string,Entry>{
  const m=new Map<string,Entry>();this.media.forEach((v,k)=>{const e=parseManifestEntry(k,v);if(e)m.set(k,e);});return m;}
 private changed(){this.d.onChange?.();}

 /** Publish local media and fetch missing remote media. Serialised: a second call during a scan runs once more afterwards. */
 private async scan():Promise<void>{
  if(this.stopped)return;if(this.scanning){this.rescan=true;return;}
  this.scanning=true;
  try{do{this.rescan=false;await this.scanOnce();}while(this.rescan&&!this.stopped);}
  finally{this.scanning=false;}}
 private async scanOnce(){
  const man=this.manifest();
  // 1. publish: local files that the manifest lacks, or that changed locally since this window last saw them
  const local=this.d.port.list();const localPaths=new Set<string>();
  for(const item of local){
   if(this.stopped)return;
   if(!isSafeProjectPath(item.path)||!MEDIA_PATH.test(item.path)||item.size<1||item.size>MAX_SHARED_MEDIA_FILE)continue;
   localPaths.add(item.path);
   let hash:string,bytes:Uint8Array|undefined;
   const cached=this.hashes.get(item.path);
   if(cached&&cached.id===item.id&&cached.size===item.size&&this.blobs.has(cached.hash)){hash=cached.hash;bytes=this.blobs.get(hash);}
   else{bytes=await item.read();if(bytes.length!==item.size)continue;hash=await sha256Hex(bytes);this.hashes.set(item.path,{id:item.id,size:item.size,hash});}
   if(!bytes)continue;
   const inDoc=man.get(item.path);
   if(inDoc&&inDoc.hash===hash){this.known.set(item.path,hash);this.blobs.set(hash,bytes);continue;}
   const prev=this.known.get(item.path);
   // publish a new local file, or a local replacement of a version this window had already synced.
   // A remote version we never held, or still hold unchanged, wins and is fetched below.
   if(!inDoc||(prev!==undefined&&prev!==hash)){
    // new local file, or a local replacement of what we had synced: publish
    if(!inDoc&&man.size>=MAX_SHARED_MEDIA_FILES){this.fail(item.path,'limit',`Not shared: a session shares at most ${MAX_SHARED_MEDIA_FILES} media files.`);continue;}
    if(this.totalBytes(man,item.path)+item.size>MAX_SHARED_MEDIA_BYTES){this.fail(item.path,'limit',`Not shared: the session's media limit of ${MAX_SHARED_MEDIA_BYTES/1_000_000} MB is reached.`);continue;}
    this.blobs.set(hash,bytes);this.known.set(item.path,hash);
    this.c.doc.transact(()=>this.media.set(item.path,{hash,size:item.size}),'media');
    man.set(item.path,{hash,size:item.size});this.failed.delete(item.path);}}
  // 2. fetch: manifest entries this window does not hold yet
  let total=this.totalHeldBytes();
  for(const [path,e] of man){
   if(this.stopped)return;
   if(this.known.get(path)===e.hash)continue;   // already held (or deliberately closed here): only a new manifest value triggers a fetch
   const held=this.blobs.get(e.hash);
   if(held){await this.install(path,e,held);continue;}
   const dl=this.downloads.get(e.hash);
   if(dl){dl.paths.add(path);continue;}
   if(this.downloads.size>=4)continue;               // bounded parallelism; the rest starts as these finish
   if(total+e.size>MAX_SHARED_MEDIA_BYTES){this.fail(path,'limit','Not received: the media limit of 60 MB for one session is reached.');continue;}
   total+=e.size;
   this.downloads.set(e.hash,{hash:e.hash,size:e.size,total:chunkCount(e.size),chunks:new Map(),paths:new Set([path]),idle:0,corrupt:0});
   this.failed.delete(path);this.request(this.downloads.get(e.hash)!);}
  this.changed();}
 private totalBytes(man:Map<string,Entry>,except:string){let n=0;for(const [p,e] of man)if(p!==except)n+=e.size;return n;}
 private totalHeldBytes(){let n=0;for(const b of this.blobs.values())n+=b.length;for(const dl of this.downloads.values())n+=dl.size;return n;}
 private fail(path:string,reason:MediaFailure['reason'],message:string){this.failed.set(path,{path,reason,message});}

 private async install(path:string,e:Entry,bytes:Uint8Array){
  const r=await this.d.port.add(path,bytes);
  if('error' in r){this.fail(path,'refused',r.error);this.known.set(path,e.hash);return;}
  this.known.set(path,e.hash);this.failed.delete(path);this.received++;}

 // ---- downloading ----
 private request(dl:Download){
  const missing:number[]=[];for(let i=0;i<dl.total&&missing.length<MAX_REQUEST_WINDOW;i++)if(!dl.chunks.has(i))missing.push(i);
  if(!missing.length)return;
  // contiguous runs only: one request per run
  let start=missing[0],n=1;
  for(let i=1;i<=missing.length;i++){
   if(i<missing.length&&missing[i]===missing[i-1]+1){n++;continue;}
   this.d.send(encodeBlobRequest(dl.hash,start,n));
   if(i<missing.length){start=missing[i];n=1;}}}
 private tick(){
  if(this.stopped)return;
  for(const [hash,dl] of [...this.downloads]){
   dl.idle++;
   if(dl.idle>this.o.maxRetries){
    this.downloads.delete(hash);
    for(const p of dl.paths)this.fail(p,'unavailable','No participant that has this file is connected. It is fetched again when someone with it joins.');
    this.changed();continue;}
   this.request(dl);}
  const cut=this.o.now()-5000;for(const [k,t] of this.heard)if(t<cut)this.heard.delete(k);}
 /** A peer joined or the connection came back: unavailable files get another go. */
 kick(){
  for(const f of [...this.failed.values()])if(f.reason==='unavailable')this.failed.delete(f.path);
  for(const dl of this.downloads.values())dl.idle=0;
  void this.scan();}

 // ---- incoming frames ----
 handle(bytes:Uint8Array){
  if(this.stopped)return;
  const f=decodeBlobFrame(bytes);if(!f)return;
  if(f.kind==='request'){this.serve(f.hash,f.first,f.count);return;}
  this.heard.set(`${f.hash}:${f.index}`,this.o.now());
  const dl=this.downloads.get(f.hash);if(!dl||f.total!==dl.total||dl.chunks.has(f.index))return;
  if(f.data.length!==expectedChunkLength(dl.size,f.index))return;    // wrong size: drop, the retry asks again
  dl.chunks.set(f.index,f.data);dl.idle=0;
  if(dl.chunks.size===dl.total)void this.finish(dl);
  else if(dl.chunks.size%MAX_REQUEST_WINDOW===0)this.request(dl);}
 private async finish(dl:Download){
  const bytes=new Uint8Array(dl.size);let at=0;for(let i=0;i<dl.total;i++){const c=dl.chunks.get(i)!;bytes.set(c,at);at+=c.length;}
  const ok=at===dl.size&&await sha256Hex(bytes)===dl.hash;
  if(this.stopped)return;
  if(!ok){
   dl.chunks.clear();dl.corrupt++;
   if(dl.corrupt<=2){this.request(dl);return;}
   this.downloads.delete(dl.hash);
   for(const p of dl.paths)this.fail(p,'corrupt','The received file did not match its checksum and was discarded.');
   this.changed();return;}
  this.downloads.delete(dl.hash);this.blobs.set(dl.hash,bytes);
  const man=this.manifest();
  for(const p of dl.paths){const e=man.get(p);if(e&&e.hash===dl.hash)await this.install(p,e,bytes);}
  this.changed();
  void this.scan();}                                                   // start the next queued download

 // ---- serving ----
 private serve(hash:string,first:number,count:number){
  const bytes=this.blobs.get(hash);if(!bytes)return;
  const total=chunkCount(bytes.length);
  for(let i=first;i<first+count&&i<total;i++){
   const key=`${hash}:${i}`;
   if(this.queue.length>=64||this.queue.some(q=>q.key===key))continue;
   const requestedAt=this.o.now();
   const jitter=this.o.random()*this.o.jitterMs;
   setTimeout(()=>{
    if(this.stopped)return;
    const h=this.heard.get(key);if(h!==undefined&&h>=requestedAt)return;   // someone else already answered
    if(this.queue.length<64&&!this.queue.some(q=>q.key===key)){this.queue.push({hash,index:i,key});this.pump();}},jitter);}}
 private pump(){
  if(this.drain||!this.queue.length)return;
  const wait=Math.max(0,this.nextFree-this.o.now());
  this.drain=setTimeout(()=>{
   this.drain=null;if(this.stopped)return;
   const q=this.queue.shift();
   if(q){
    const h=this.heard.get(q.key);const b=this.blobs.get(q.hash);
    if(b&&!(h!==undefined&&h>=this.o.now()-this.o.jitterMs)){
     const total=chunkCount(b.length);
     const data=b.subarray(q.index*CHUNK_BYTES,Math.min(b.length,(q.index+1)*CHUNK_BYTES));
     if(this.d.send(encodeBlobChunk(q.hash,q.index,total,data)))this.nextFree=this.o.now()+data.length/this.o.bytesPerSec*1000;}}
   this.pump();},wait);}

 stop(){
  this.stopped=true;this.media.unobserve(this.onManifest);this.offPort();
  if(this.retry)clearInterval(this.retry);if(this.drain)clearTimeout(this.drain);
  this.queue=[];this.downloads.clear();this.blobs.clear();}
}
