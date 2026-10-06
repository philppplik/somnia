import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {Awareness} from 'y-protocols/awareness';
import {CollabClient} from './client';
import type {CollabClientOptions} from './client';
import {memoryServer} from './memoryTransport';
import type {MemoryServer,MemoryServerEnd} from './memoryTransport';
import type {Transport,TransportHandlers} from './transport';
import {MSG_IDENTITY,MSG_ENCRYPTED,encodeSyncStep1,encodeUpdate,encodeAwareness,encodeIdentity,handleMessage} from './protocol';
import type {PublicIdentity,PresencePerson} from './protocol';
import {newLinkKey,decryptFrame} from './crypto';

const docs:Y.Doc[]=[];const clients:CollabClient[]=[];
const mkDoc=()=>{const d=new Y.Doc();docs.push(d);return d;};
const mkSession=(seed?:Record<string,string>)=>{
 const doc=mkDoc();const awareness=new Awareness(doc);awareness.setLocalState({});
 if(seed)for(const[k,v]of Object.entries(seed))doc.getMap('files').set(k,new Y.Text(v));
 return {doc,awareness};};
const mkClient=(invite:string,session:ReturnType<typeof mkSession>,opts?:Partial<CollabClientOptions>)=>{
 const c=new CollabClient(invite,{session,...opts} as CollabClientOptions);clients.push(c);return c;};
test.after(()=>{clients.forEach(c=>c.leave());docs.forEach(d=>d.destroy());});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(f:()=>boolean,ms=3000)=>{const t0=Date.now();while(!f()){if(Date.now()-t0>ms)throw new Error('timeout waiting');await sleep(5);}};

/**
 * Test relay with the spike's behaviour: identity+presence+step1 on join, step2 replies,
 * broadcasts to the others. Uses the same wire module as the client; the interop test against the
 * real spike relay (interop.test.ts) proves the two are equivalent.
 */
class SmartRelay{
 doc=mkDoc();awareness=new Awareness(this.doc);
 people=new Map<MemoryServerEnd,PublicIdentity>();
 constructor(server:MemoryServer){
  this.awareness.setLocalState(null);
  server.onConnection(end=>{
   const t=end.transport;
   const id:PublicIdentity={id:'guest-'+this.people.size,role:'editor',name:'Guest'};
   this.people.set(end,id);
   this.doc.on('update',(u,origin)=>this.broadcast(encodeUpdate(u),origin as MemoryServerEnd));
   this.awareness.on('update',({added,updated,removed}:Record<string,number[]>,origin:unknown)=>
    this.broadcast(encodeAwareness(this.awareness,added.concat(updated,removed)),origin as MemoryServerEnd));
   t.connect({onOpen:()=>{
     t.send(encodeIdentity({type:'identity',identity:id}));
     t.send(encodeIdentity({type:'presence',people:this.presence()}));
     t.send(encodeSyncStep1(this.doc));
     const ids=[...this.awareness.getStates().keys()];if(ids.length)t.send(encodeAwareness(this.awareness,ids));},
    onMessage:bytes=>{
     if(bytes[0]===MSG_IDENTITY){end.close(1003,'host control required');return;}
     const reply=handleMessage(bytes,this.doc,this.awareness,end);
     if(reply)t.send(reply);},
    onClose:()=>{this.people.delete(end);this.broadcast(encodeIdentity({type:'presence',people:this.presence()}),end);}});});}
 private presence():PresencePerson[]{return [...this.people.values()].map(p=>({...p,connected:true,awarenessId:null}));}
 private broadcast(msg:Uint8Array,except:MemoryServerEnd){for(const e of this.people.keys())if(e!==except)e.transport.send(msg);}
}

const INVITE='ws://memory/?code=abcdefghijklmnopqrstuv';

test('connects, receives identity and presence, state becomes connected',async()=>{
 const {server,factory}=memoryServer();new SmartRelay(server);
 const c=mkClient(INVITE,mkSession(),{transport:factory,syncTimeoutMs:50});
 await c.connect();
 const s=c.snapshot();
 assert.equal(s.state,'connected');assert.equal(s.synced,true);
 assert.equal(s.identity?.role,'editor');assert.equal(s.people.length,1);
 assert.equal(s.security.e2e,false);assert.equal(s.security.secureChannel,false);
 assert.equal(s.mode,'lan-direct');});

test('edits converge both ways through the relay',async()=>{
 const {server,factory}=memoryServer();const relay=new SmartRelay(server);
 const sess=mkSession();const c=mkClient(INVITE,sess,{transport:factory,syncTimeoutMs:50});
 await c.connect();
 relay.doc.getMap('files').set('index.html',new Y.Text('<h1>host</h1>'));
 await until(()=>(sess.doc.getMap('files').get('index.html')as Y.Text|undefined)?.toString()==='<h1>host</h1>');
 sess.doc.getMap('files').set('guest.html',new Y.Text('<p>guest</p>'));
 await until(()=>(relay.doc.getMap('files').get('guest.html')as Y.Text|undefined)?.toString()==='<p>guest</p>');});

test('offline edits are queued, flushed on reconnect, and converge',async()=>{
 const {server,factory}=memoryServer();const relay=new SmartRelay(server);
 const sess=mkSession({['a.html']:'v1'});const c=mkClient(INVITE,sess,{transport:factory,syncTimeoutMs:50,baseDelayMs:10,random:()=>0.5});
 await c.connect();
 server.connections[0].drop(); // network drop, code 1006
 await until(()=>c.snapshot().state==='reconnecting');
 (sess.doc.getMap('files').get('a.html')as Y.Text).insert(0,'offline-');
 await until(()=>c.snapshot().queued===1);
 await until(()=>c.snapshot().state==='connected');
 await until(()=>(relay.doc.getMap('files').get('a.html')as Y.Text).toString()==='offline-v1');
 assert.equal(c.snapshot().queued,0);assert.equal(c.snapshot().droppedFromQueue,0);});

test('outbox overflow is reported and the sync handshake still repairs it',async()=>{
 const {server,factory}=memoryServer();const relay=new SmartRelay(server);
 const sess=mkSession();const c=mkClient(INVITE,sess,{transport:factory,syncTimeoutMs:50,baseDelayMs:30,random:()=>0.5,outboxLimit:2});
 await c.connect();
 server.connections[0].drop();
 await until(()=>c.snapshot().state==='reconnecting');
 const t=sess.doc.getText('f.html');
 for(const ch of['x','y','z'])t.insert(t.length,ch);
 await until(()=>c.snapshot().droppedFromQueue===1);
 await until(()=>c.snapshot().state==='connected');
 await until(()=>relay.doc.getText('f.html').toString()==='xyz'); // sync step1/step2 covers what the outbox dropped
});

test('unreachable host: retries with backoff, then error unreachable and connect rejects',async()=>{
 const dead=():Transport=>({connect(h:TransportHandlers){queueMicrotask(()=>h.onClose(1006,''));},send(){},close(){}});
 const c=mkClient(INVITE,mkSession(),{transport:()=>dead(),maxAttempts:3,baseDelayMs:5,maxDelayMs:20,random:()=>0.5,syncTimeoutMs:10});
 const seen:string[]=[];c.subscribe(()=>seen.push(c.snapshot().state+':'+c.snapshot().attempt));
 await assert.rejects(()=>c.connect(),/reach the host/);
 assert.equal(c.snapshot().state,'error');assert.equal(c.snapshot().error?.kind,'unreachable');
 const recon=seen.filter(s=>s.startsWith('reconnecting')).filter((s,i,a)=>a[i-1]!==s);
 assert.deepEqual(recon,['reconnecting:2','reconnecting:3']);});

test('revoked invite (close 4001) is final: error refused, no retry',async()=>{
 const {server,factory}=memoryServer();
 server.onConnection(end=>end.close(4001,'revoked'));
 const c=mkClient(INVITE,mkSession(),{transport:factory,maxAttempts:5,baseDelayMs:5,syncTimeoutMs:10});
 await assert.rejects(()=>c.connect(),/revoked/);
 const s=c.snapshot();assert.equal(s.state,'error');assert.equal(s.error?.kind,'refused');
 assert.equal(server.connections.length,1);});

test('bad link fails as bad-link without dialling',async()=>{
 const c=mkClient('https://example.com',mkSession(),{transport:()=>{throw new Error('must not dial');}});
 await assert.rejects(()=>c.connect(),/bad-link/);
 assert.equal(c.snapshot().error?.kind,'bad-link');});

test('guest cannot send host commands',async()=>{
 const {server,factory}=memoryServer();new SmartRelay(server);
 const c=mkClient(INVITE,mkSession(),{transport:factory,syncTimeoutMs:50});
 await c.connect();
 assert.throws(()=>c.setGuestRole('guest-0','viewer'),/host connection required/);});

test('leave goes idle and stops sending',async()=>{
 const {server,factory}=memoryServer();const relay=new SmartRelay(server);
 const sess=mkSession();const c=mkClient(INVITE,sess,{transport:factory,syncTimeoutMs:50});
 await c.connect();c.leave();
 assert.equal(c.snapshot().state,'idle');
 sess.doc.getText('x.html').insert(0,'nope');
 await sleep(50);
 assert.equal(relay.doc.share.has('x.html'),false);});

test('E2E over a blind relay: two clients converge, the relay only forwards ciphertext',async()=>{
 // Blind relay: broadcasts every frame verbatim. Cannot read, merge, or answer sync - peers do that.
 const {param}=await newLinkKey();
 const seen:number[]=[];const ends:MemoryServerEnd[]=[];
 const {server,factory}=memoryServer();
 server.onConnection(end=>{ends.push(end);
  end.transport.connect({onOpen(){},onClose(){},onMessage(b){seen.push(b[0]);
   for(const o of ends)if(o!==end)o.transport.send(b);}});});
 const url=`ws://selfhosted.example:9000/?code=abcdefghijklmnopqrstuv#key=${param}`;
 const aSess=mkSession({['i.html']:'<h1>a</h1>'});
 const a=mkClient(url,aSess,{transport:factory,syncTimeoutMs:60,mode:'relay'});
 await a.connect(); // alone on a blind relay: no step2 comes back, the sync timeout resolves it
 assert.equal(a.snapshot().state,'connected');assert.equal(a.snapshot().security.e2e,true);
 assert.equal(a.snapshot().mode,'relay');assert.equal(a.snapshot().identity,null); // no relay identity in E2E
 const bSess=mkSession();
 const b=mkClient(url,bSess,{transport:factory,syncTimeoutMs:500,mode:'relay'});
 await b.connect(); // b's step1 is answered by a with step2
 assert.equal(b.snapshot().state,'connected');
 await until(()=>(bSess.doc.getMap('files').get('i.html')as Y.Text|undefined)?.toString()==='<h1>a</h1>');
 bSess.doc.getText('b.html').insert(0,'from-b');
 await until(()=>aSess.doc.getText('b.html').toString()==='from-b');
 aSess.awareness.setLocalStateField('cursor',{path:'i.html',index:3});
 await until(()=>bSess.awareness.getStates().get(aSess.doc.clientID)?.cursor?.index===3);
 assert.ok(seen.length>0);
 assert.ok(seen.includes(MSG_ENCRYPTED));
 assert.ok(seen.every(t=>t===MSG_ENCRYPTED||t===MSG_IDENTITY),'relay must only see encrypted or identity frames');});

test('frames captured on the wire cannot be opened without the link key',async()=>{
 const {param,link}=await newLinkKey();const wrong=await newLinkKey();
 const sess=mkSession();const captured:Uint8Array[]=[];
 const tap:Transport={connect(h){queueMicrotask(()=>h.onOpen());},send(b){captured.push(b);},close(){}};
 const c=mkClient(`${INVITE}#key=${param}`,sess,{transport:()=>tap,syncTimeoutMs:30});
 const p=c.connect();
 sess.doc.getText('secret.html').insert(0,'top secret');
 await p;await sleep(20);
 const enc=captured.filter(f=>f[0]===MSG_ENCRYPTED);
 assert.ok(enc.length>=2,'step1 + update must be on the wire, encrypted');
 for(const f of enc)await assert.rejects(()=>decryptFrame(wrong.link,f));
 const plain=await decryptFrame(link,enc[enc.length-1]);
 assert.ok(plain.length>0);});

test('relay-contract room links (no code param) are accepted',async()=>{
 const {server,factory}=memoryServer();new SmartRelay(server);
 const c=mkClient('ws://relay.example:9000/room/aB3fK9xQ2mZ7pL4s',mkSession(),{transport:factory,syncTimeoutMs:50,mode:'relay'});
 await c.connect();
 assert.equal(c.snapshot().state,'connected');
 assert.equal(c.snapshot().error,null);});

test('relay-contract room links reject garbage ids',async()=>{
 const c=mkClient('ws://relay.example:9000/room/short',mkSession(),{transport:()=>{throw new Error('must not dial');}});
 await assert.rejects(()=>c.connect(),/bad-link/);});

test('frame-too-big close (1009) is final with an honest message',async()=>{
 const {server,factory}=memoryServer();
 server.onConnection(end=>end.close(1009,'frame too large'));
 const c=mkClient(INVITE,mkSession(),{transport:factory,maxAttempts:5,baseDelayMs:5,syncTimeoutMs:10});
 await assert.rejects(()=>c.connect(),/2 MiB/);
 assert.equal(c.snapshot().error?.kind,'refused');
 assert.equal(server.connections.length,1);});

test('room-link client reconnects after a drop (regression: parseWireInvite in the reconnect path)',async()=>{
 const {server,factory}=memoryServer();const relay=new SmartRelay(server);
 const sess=mkSession({['a.html']:'v1'});
 const c=mkClient('ws://relay.example:9000/room/aB3fK9xQ2mZ7pL4s',sess,{transport:factory,syncTimeoutMs:50,baseDelayMs:10,random:()=>0.5,mode:'relay'});
 await c.connect();
 server.connections[0].drop();
 await until(()=>c.snapshot().state==='reconnecting');
 (sess.doc.getMap('files').get('a.html')as Y.Text).insert(0,'offline-');
 await until(()=>c.snapshot().state==='connected');
 await until(()=>(relay.doc.getMap('files').get('a.html')as Y.Text).toString()==='offline-v1');});

test('key session drops plaintext sync/awareness frames (no downgrade)',async()=>{
 const {param}=await newLinkKey();
 const sess=mkSession();let handler:TransportHandlers|null=null;
 const tap:Transport={connect(h){handler=h;queueMicrotask(()=>h.onOpen());},send(){},close(){}};
 const c=mkClient(`${INVITE}#key=${param}`,sess,{transport:()=>tap,syncTimeoutMs:30});
 const p=c.connect();
 await until(()=>handler!==null);
 // a relay (or attacker on the path) injects a plaintext update frame carrying a hostile edit
 const evil=mkDoc();evil.getText('evil.html').insert(0,'plaintext-injection');
 const plainFrame=encodeUpdate(Y.encodeStateAsUpdate(evil));
 handler!.onMessage(plainFrame);
 // and a plaintext sync step1, which would start an unencrypted state exchange
 handler!.onMessage(encodeSyncStep1(evil));
 await sleep(30);
 assert.equal(sess.doc.share.has('evil.html'),false);
 await p;});
