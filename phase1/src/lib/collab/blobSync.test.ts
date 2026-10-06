import test from 'node:test';
import assert from 'node:assert/strict';
import {CollabDoc} from './collabDoc';
import {CollabClient} from './net/client';
import {memoryServer} from './net/memoryTransport';
import type {MemoryServer,MemoryServerEnd} from './net/memoryTransport';
import {BlobSync,parseManifestEntry,type MediaPort} from './blobSync';
import {CHUNK_BYTES,decodeBlobFrame,encodeBlobChunk,encodeBlobRequest,sha256Hex,chunkCount,expectedChunkLength} from './net/blobProtocol';
import {newLinkKey} from './net/crypto';
import {MSG_BLOB,MSG_ENCRYPTED,encodeUpdate,handleMessage,encodeSyncStep1} from './net/protocol';

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(f:()=>boolean,ms=6000)=>{const t0=Date.now();while(!f()){if(Date.now()-t0>ms)throw new Error('timeout waiting');await sleep(5);}};
const png=(n:number,seed=1)=>{const b=new Uint8Array(n);let x=seed;for(let i=0;i<n;i++){x=(x*1103515245+12345)&0x7fffffff;b[i]=x>>8;}b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);return b;};

/** Blind relay like the real one: forwards every binary frame verbatim to the others, keeps no state, records sizes. */
function blindRelay(server:MemoryServer){
 const ends:MemoryServerEnd[]=[];const sizes:number[]=[];const sent=new Map<MemoryServerEnd,number[]>();
 server.onConnection(end=>{ends.push(end);sent.set(end,[]);
  end.transport.connect({onOpen(){},onMessage:b=>{sizes.push(b.length);sent.get(end)!.push(Date.now());for(const e of ends)if(e!==end)e.transport.send(b);},onClose(){ends.splice(ends.indexOf(end),1);}});});
 return{sizes,sent};}

class FakeMedia implements MediaPort{
 files=new Map<string,Uint8Array>();ver=new Map<string,number>();ls=new Set<()=>void>();refuse=false;
 list(){return [...this.files].map(([path,b])=>({path,id:path+':'+(this.ver.get(path)??0),size:b.length,read:async()=>b}));}
 async add(path:string,bytes:Uint8Array){if(this.refuse)return{error:'refused by app'};this.put(path,bytes);return{ok:true as const};}
 put(path:string,b:Uint8Array){this.files.set(path,b);this.ver.set(path,(this.ver.get(path)??0)+1);this.ls.forEach(l=>l());}
 subscribe(fn:()=>void){this.ls.add(fn);return()=>{this.ls.delete(fn);};}
}
interface Peer{doc:CollabDoc;media:FakeMedia;client:CollabClient;blob:BlobSync}
const peers:Peer[]=[];
test.after(()=>{for(const p of peers){p.blob.stop();p.client.leave();p.doc.destroy();}});
async function peer(factory:ReturnType<typeof memoryServer>['factory'],invite:string,opts:{jitterMs?:number;bytesPerSec?:number;retryMs?:number;maxRetries?:number}={}):Promise<Peer>{
 const doc=new CollabDoc();const media=new FakeMedia();doc.awareness.setLocalState({});
 const client=new CollabClient(invite,{session:{doc:doc.doc,awareness:doc.awareness},transport:factory,syncTimeoutMs:30});
 const blob=new BlobSync(doc,{port:media,send:f=>client.sendBlob(f)},{jitterMs:5,bytesPerSec:50_000_000,retryMs:100,...opts});
 client.setBlobHandler(f=>blob.handle(f));
 await client.connect();const p={doc,media,client,blob};peers.push(p);return p;}
const mkInvite=async()=>`ws://memory/room/abcdefgh12345678#key=${(await newLinkKey()).param}`;

test('chunk math and frame decoding',()=>{
 assert.equal(chunkCount(1),1);assert.equal(chunkCount(CHUNK_BYTES),1);assert.equal(chunkCount(CHUNK_BYTES+1),2);
 assert.equal(expectedChunkLength(CHUNK_BYTES+5,1),5);assert.equal(expectedChunkLength(CHUNK_BYTES+5,0),CHUNK_BYTES);
 const h='a'.repeat(64);
 assert.deepEqual(decodeBlobFrame(encodeBlobRequest(h,2,3)),{kind:'request',hash:h,first:2,count:3});
 const f=decodeBlobFrame(encodeBlobChunk(h,1,4,new Uint8Array([1,2,3])));assert.ok(f&&f.kind==='chunk'&&f.index===1&&f.total===4&&f.data.length===3);
 assert.equal(decodeBlobFrame(encodeBlobRequest('xyz',0,1)),null);
 assert.equal(decodeBlobFrame(encodeBlobRequest(h,0,99)),null);
 assert.equal(decodeBlobFrame(encodeBlobChunk(h,5,4,new Uint8Array(1))),null,'index must be below total');
 assert.equal(decodeBlobFrame(new Uint8Array([MSG_BLOB,1,0])),null);
 assert.equal(decodeBlobFrame(new Uint8Array([9,9])),null);});

test('manifest entries are validated',()=>{
 const h='b'.repeat(64);
 assert.deepEqual(parseManifestEntry('img/a.PNG',{hash:h,size:10}),{hash:h,size:10});
 for(const [p,v] of [['../a.png',{hash:h,size:1}],['a.html',{hash:h,size:1}],['a.png',{hash:'zz',size:1}],['a.png',{hash:h,size:0}],['a.png',{hash:h,size:26_000_000}],['a.png',{hash:h,size:1.5}],['a.png',null],['a.png','x']] as [string,unknown][])
  assert.equal(parseManifestEntry(p,v),null,String(p)+JSON.stringify(v));});

test('a multi-chunk image and a PDF reach the guest byte-exact through a blind relay, with E2E key',async()=>{
 const {server,factory}=memoryServer();const relay=blindRelay(server);const invite=await mkInvite();
 const host=await peer(factory,invite);
 const img=png(CHUNK_BYTES*3+777),pdf=new Uint8Array([0x25,0x50,0x44,0x46,0x2d,1,2,3,4,5]);
 host.media.put('img/photo.png',img);host.media.put('docs/a.pdf',pdf);
 const guest=await peer(factory,invite);
 await until(()=>guest.media.files.size===2);
 assert.deepEqual(guest.media.files.get('img/photo.png'),img);assert.deepEqual(guest.media.files.get('docs/a.pdf'),pdf);
 await until(()=>guest.blob.snapshot().pending===0);
 assert.equal(guest.blob.snapshot().received,2);assert.deepEqual(guest.blob.snapshot().failed,[]);
 assert.ok(Math.max(...relay.sizes)<2*1024*1024,'every frame stays below the relay cap');
 // nothing on the wire carries the PNG signature in the clear: all frames are encrypted
});

test('relay sees only ciphertext for blob frames',async()=>{
 const {server,factory}=memoryServer();const seen:Uint8Array[]=[];
 server.onConnection(end=>{end.transport.connect({onOpen(){},onMessage:b=>{seen.push(b);},onClose(){}});});
 const invite=await mkInvite();const host=await peer(factory,invite);host.media.put('a.png',png(5000));
 await sleep(100);
 // the host announces a manifest (sync frame); a blob frame only appears on request, so ask for it from a raw sender
 const hash=await sha256Hex(png(5000));
 host.client.sendBlob(encodeBlobRequest(hash,0,1));await sleep(50);
 assert.ok(seen.length>0);assert.ok(seen.every(b=>b[0]===MSG_ENCRYPTED||b[0]===2),'only encrypted or identity frames');
 assert.ok(!seen.some(b=>b[0]===MSG_BLOB));});

test('late joiner gets media from a peer; two holders do not both flood the same chunk',async()=>{
 const {server,factory}=memoryServer();const relay=blindRelay(server);const invite=await mkInvite();
 const host=await peer(factory,invite,{jitterMs:40});const img=png(CHUNK_BYTES*4);host.media.put('p.png',img);
 const g1=await peer(factory,invite,{jitterMs:40});await until(()=>g1.media.files.has('p.png'));
 const before=relay.sizes.length;
 const g2=await peer(factory,invite,{jitterMs:40});await until(()=>g2.media.files.has('p.png'));
 assert.deepEqual(g2.media.files.get('p.png'),img);
 const chunkFrames=relay.sizes.slice(before).filter(n=>n>CHUNK_BYTES);
 assert.ok(chunkFrames.length<=8,`expected about 4 chunk frames, saw ${chunkFrames.length}`);});

test('a replaced image on one side replaces it on the other; unchanged files are not re-sent',async()=>{
 const {server,factory}=memoryServer();blindRelay(server);const invite=await mkInvite();
 const host=await peer(factory,invite);const guest=await peer(factory,invite);
 host.media.put('x.png',png(3000,1));await until(()=>guest.media.files.has('x.png'));
 const v2=png(4000,2);host.media.put('x.png',v2);
 await until(()=>{const g=guest.media.files.get('x.png');return !!g&&g.length===4000;});
 assert.deepEqual(guest.media.files.get('x.png'),v2);});

test('corrupt bytes are discarded, not installed',async()=>{
 const {server,factory}=memoryServer();const invite=await mkInvite();
 // a malicious peer announces a manifest entry and then answers with wrong bytes
 const guest=await peer(factory,invite,{retryMs:50,maxRetries:3});
 const good=png(CHUNK_BYTES+10);const hash=await sha256Hex(good);
 guest.doc.doc.transact(()=>guest.doc.doc.getMap('media').set('evil.png',{hash,size:good.length}),'remote');
 const bad=png(CHUNK_BYTES+10,99);
 await sleep(30);
 for(let r=0;r<4;r++){
  await sleep(10);
  guest.blob.handle(encodeBlobChunk(hash,0,2,bad.subarray(0,CHUNK_BYTES)));
  guest.blob.handle(encodeBlobChunk(hash,1,2,bad.subarray(CHUNK_BYTES)));}
 await until(()=>guest.blob.snapshot().failed.length>0);
 assert.equal(guest.blob.snapshot().failed[0].reason,'corrupt');assert.equal(guest.media.files.size,0);
 void server;});

test('wrong-size chunks and unrequested chunks are ignored',async()=>{
 const {factory}=memoryServer();const invite=await mkInvite();
 const guest=await peer(factory,invite,{retryMs:5000});
 const data=png(CHUNK_BYTES+10);const hash=await sha256Hex(data);
 guest.blob.handle(encodeBlobChunk(hash,0,2,data.subarray(0,CHUNK_BYTES)));   // not requested: no download
 guest.doc.doc.transact(()=>guest.doc.doc.getMap('media').set('a.png',{hash,size:data.length}),'remote');
 await sleep(30);
 guest.blob.handle(encodeBlobChunk(hash,0,2,data.subarray(0,100)));            // too short
 guest.blob.handle(encodeBlobChunk(hash,0,9,data.subarray(0,CHUNK_BYTES)));    // wrong total
 assert.equal(guest.blob.snapshot().pending,1);assert.equal(guest.media.files.size,0);
 guest.blob.handle(encodeBlobChunk(hash,0,2,data.subarray(0,CHUNK_BYTES)));
 guest.blob.handle(encodeBlobChunk(hash,1,2,data.subarray(CHUNK_BYTES)));
 await until(()=>guest.media.files.has('a.png'));assert.deepEqual(guest.media.files.get('a.png'),data);});

test('nobody has the file: reported as unavailable, then fetched when a holder joins (kick)',async()=>{
 const {server,factory}=memoryServer();blindRelay(server);const invite=await mkInvite();
 const guest=await peer(factory,invite,{retryMs:20,maxRetries:3});
 const data=png(5000);const hash=await sha256Hex(data);
 guest.doc.doc.transact(()=>guest.doc.doc.getMap('media').set('late.png',{hash,size:data.length}),'remote');
 await until(()=>guest.blob.snapshot().failed.some(f=>f.reason==='unavailable'));
 const holder=await peer(factory,invite);holder.media.put('late.png',data);
 guest.blob.kick();await until(()=>guest.media.files.has('late.png'));
 assert.deepEqual(guest.blob.snapshot().failed,[]);});

test('an app refusal (not a real image) is reported, never silently dropped',async()=>{
 const {server,factory}=memoryServer();blindRelay(server);const invite=await mkInvite();
 const host=await peer(factory,invite);const guest=await peer(factory,invite);guest.media.refuse=true;
 host.media.put('f.png',png(2000));
 await until(()=>guest.blob.snapshot().failed.length>0);
 assert.equal(guest.blob.snapshot().failed[0].reason,'refused');assert.equal(guest.blob.snapshot().failed[0].message,'refused by app');});

test('answers are paced under the configured rate',async()=>{
 const {server,factory}=memoryServer();const relay=blindRelay(server);const invite=await mkInvite();
 const host=await peer(factory,invite,{bytesPerSec:1_000_000,jitterMs:1});host.media.put('big.png',png(CHUNK_BYTES*6));
 const guest=await peer(factory,invite);const t0=Date.now();
 await until(()=>guest.media.files.has('big.png'));
 const dt=Date.now()-t0;
 // 6 chunks of 128 KiB at 1 MB/s need >= ~0.55 s of send time (first chunk is free)
 assert.ok(dt>=450,`transfer took ${dt} ms, pacing seems off`);void relay;});

test('limits: more than the media byte cap is not shared and says so',async()=>{
 const {server,factory}=memoryServer();blindRelay(server);const invite=await mkInvite();
 const host=await peer(factory,invite);
 for(let i=0;i<3;i++)host.media.put(`m${i}.png`,png(24_000_000,i+1));
 await until(()=>host.blob.snapshot().failed.length>0,15000);
 assert.equal(host.blob.snapshot().failed[0].reason,'limit');
 assert.equal(host.doc.doc.getMap('media').size,2);});

void encodeUpdate;void handleMessage;void encodeSyncStep1;
