/**
 * Wire-level interop proof: this client talks to the real ADR-005 spike relay
 * (prototypes/collab-spike/src/relay.mjs) over real WebSocket connections on 127.0.0.1.
 * Skipped only when the spike's own dependencies (the `ws` package) are not installed -
 * run `npm install` in prototypes/collab-spike first. Everything else is live.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {Awareness} from 'y-protocols/awareness';
import {CollabClient} from './client';
import {CollabDoc} from '../collabDoc';

interface SpikeRelay{port:number;ready:Promise<void>;invite(role:string,hostname?:string,name?:string):string;hostUrl():string;conns:Map<unknown,{identity:{id:string;role:string}}>;close():Promise<void>;}
const docs:Y.Doc[]=[];const clients:CollabClient[]=[];const relays:SpikeRelay[]=[];
test.after(async()=>{clients.forEach(c=>c.leave());docs.forEach(d=>d.destroy());await Promise.all(relays.map(r=>r.close()));});
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(f:()=>boolean,ms=5000)=>{const t0=Date.now();while(!f()){if(Date.now()-t0>ms)throw new Error('timeout waiting');await sleep(10);}};

const spikePath='../../../../prototypes/collab-spike/src/relay.mjs';
const spikeYPath='../../../../prototypes/collab-spike/node_modules/yjs/dist/yjs.mjs';
let Relay:(new (o?:object)=>SpikeRelay)|null=null;
// The relay runs its own yjs copy (older minor). Relay-side edits MUST be made with that copy;
// mixing struct classes across copies inside one document is what yjs issue 438 warns about.
// Across the wire the versions interoperate - which is exactly what this test proves.
let spikeY:typeof Y|null=null;
try{Relay=(await import(spikePath)).Relay;spikeY=await import(spikeYPath);}catch{/* spike deps not installed */}
const relaySet=(relay:SpikeRelay,path:string,text:string)=>{
 (relay as unknown as {doc:Y.Doc}).doc.getMap('files').set(path,new (spikeY!.Text)(text) as unknown as Y.Text);};
const relayText=(relay:SpikeRelay,path:string)=>
 ((relay as unknown as {doc:Y.Doc}).doc.getMap('files').get(path) as Y.Text|undefined)?.toString();

const skip=Relay?false:'spike dependencies not installed (npm install in prototypes/collab-spike)';

test('interop: guest joins the real spike relay, converges, reconnects after a drop',{skip},async()=>{
 const relay=new Relay!({});relays.push(relay);await relay.ready;
 const invite=relay.invite('editor','127.0.0.1');
 const collab=new CollabDoc();docs.push(collab.doc);
 collab.awareness.setLocalState({});
 const c=new CollabClient(invite,{session:collab,baseDelayMs:300,maxDelayMs:500,syncTimeoutMs:2000,random:()=>0.5});
 clients.push(c);
 await c.connect();
 const s0=c.snapshot();
 assert.equal(s0.state,'connected');
 assert.equal(s0.identity?.role,'editor');
 assert.ok(s0.identity?.id,'relay must assign a credential identity');
 // host-side edit reaches the guest (non-creating read: collab.text() would create a local type and race)
 relaySet(relay,'index.html','<h1>host</h1>');
 await until(()=>collab.files.get('index.html')?.toString()==='<h1>host</h1>');
 // guest edit reaches the relay (host)
 collab.text('index.html').insert(0,'<!--guest-->');
 await until(()=>relayText(relay,'index.html')!.includes('<!--guest-->'));
 // drop the socket on the relay side: the client must reconnect with the same code and keep syncing
 const ws=[...relay.conns.keys()][0] as {close(code?:number,reason?:string):void};
 const before=c.snapshot().attempt;
 ws.close(1011,'boom');
 await until(()=>c.snapshot().state==='reconnecting');
 collab.text('index.html').insert(0,'<!--offline-->');
 await until(()=>c.snapshot().queued===1); // offline edit sits in the outbox
 await until(()=>c.snapshot().state==='connected'&&c.snapshot().attempt===0);
 assert.ok(before>=0);
 await until(()=>relayText(relay,'index.html')!.startsWith('<!--offline-->'));
 c.leave();
 assert.equal(c.snapshot().state,'idle');});

test('interop: a viewer guest is accepted but its writes are dropped by the relay',{skip},async()=>{
 const relay=new Relay!({});relays.push(relay);await relay.ready;
 relaySet(relay,'index.html','<h1>host</h1>');
 const collab=new CollabDoc();docs.push(collab.doc);
 const c=new CollabClient(relay.invite('viewer','127.0.0.1'),{session:collab,syncTimeoutMs:2000});
 clients.push(c);
 await c.connect();
 assert.equal(c.snapshot().identity?.role,'viewer');
 await until(()=>collab.files.get('index.html')?.toString()==='<h1>host</h1>');
 collab.text('index.html').insert(0,'X');
 await sleep(300); // long enough for a write to arrive if it were accepted
 assert.equal(relayText(relay,'index.html'),'<h1>host</h1>');
 c.leave();});

test('interop: a wrong code is refused and surfaces as an error, not a hang',{skip},async()=>{
 const relay=new Relay!({});relays.push(relay);await relay.ready;
 const bad=`ws://127.0.0.1:${relay.port}/?code=wrongwrongwrongwrong1`;
 const collab=new CollabDoc();docs.push(collab.doc);
 const c=new CollabClient(bad,{session:collab,maxAttempts:2,baseDelayMs:20,maxDelayMs:50,syncTimeoutMs:200,random:()=>0.5});
 clients.push(c);
 await assert.rejects(()=>c.connect());
 assert.equal(c.snapshot().state,'error');
 // a web client cannot see the HTTP 401; unreachable is the honest mapping
 assert.equal(c.snapshot().error?.kind,'unreachable');
 c.leave();});
