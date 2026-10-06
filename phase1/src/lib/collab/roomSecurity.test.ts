import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {Awareness} from 'y-protocols/awareness';
import {secureRoomLinks,roomExpiry,managedRoomId} from './roomSecurity';
import {CollabClient} from './net/client';
import {memoryServer} from './net/memoryTransport';
import {newLinkKey} from './net/crypto';
const ack=new TextEncoder().encode('\x04managed-room-v1');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function links(expiresAt=Date.now()+60_000){
 const {param}=await newLinkKey();const url=`ws://localhost:1234/room/old-session#key=${param}&m=relay`;
 return secureRoomLinks(url,[url],expiresAt);
}
function client(link:string,factory:ReturnType<typeof memoryServer>['factory']){
 const doc=new Y.Doc();const awareness=new Awareness(doc);
 const c=new CollabClient(link,{session:{doc,awareness},transport:factory,syncTimeoutMs:25});
 return {c,close:()=>{c.leave();awareness.destroy();doc.destroy();}};
}
test('separate host capability and expiry are bound into room; guest links contain no host secret',async()=>{
 const l=await links();const host=new URL(l.hostLink),guest=new URL(l.guestLinks[0]);
 assert.equal(host.pathname,guest.pathname);assert.match(host.searchParams.get('host')!,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(guest.search,'');assert.equal(host.hash,guest.hash);assert.ok(roomExpiry(l.hostLink)!>Date.now());
 const again=await links();assert.notEqual(host.pathname,new URL(again.hostLink).pathname);
 await assert.rejects(managedRoomId(Date.now()-5000));await assert.rejects(managedRoomId(Date.now()+90000000));
});
test('expired managed invite refuses before opening a socket',async()=>{
 const l=await links();const expired=l.guestLinks[0].replace(/m1_\d{10}_/,`m1_${Math.floor(Date.now()/1000)-10}_`);
 const {server,factory}=memoryServer();const x=client(expired,factory);
 try{await assert.rejects(x.c.connect(),/expired/);assert.equal(x.c.snapshot().error?.kind,'expired');assert.equal(server.connections.length,0);}finally{x.close();}
});
test('legacy relay fails closed without uploading project frames for a managed room',async()=>{
 const l=await links();const {server,factory}=memoryServer();const frames:Uint8Array[]=[];
 server.onConnection(e=>e.transport.connect({onOpen(){},onMessage(b){frames.push(b);},onClose(){}}));
 const x=client(l.hostLink,factory);
 try{await assert.rejects(x.c.connect(),/does not support/);assert.equal(frames.length,0);}finally{x.close();}
});
test('acknowledged managed room closes permanently on expiry or host revocation',async()=>{
 for(const [code,kind] of [[4004,'expired'],[4001,'refused']] as const){
  const l=await links();const {server,factory}=memoryServer();server.onConnection(e=>e.transport.connect({onOpen(){e.transport.send(ack);},onMessage(){},onClose(){}}));
  const x=client(l.guestLinks[0],factory);
  try{await x.c.connect();server.closeAll(code);await sleep(50);assert.equal(x.c.snapshot().error?.kind,kind);assert.equal(server.connections.length,1);}finally{x.close();}
 }
});
test('local deadline stops traffic even when an unresponsive relay never sends close',async()=>{
 const l=await links(Date.now()+1800);const {server,factory}=memoryServer();let sent=0;
 server.onConnection(e=>e.transport.connect({onOpen(){e.transport.send(ack);},onMessage(){sent++;},onClose(){}}));
 const x=client(l.guestLinks[0],factory);
 try{
  await x.c.connect();await sleep(1900);assert.equal(x.c.snapshot().error?.kind,'expired');
  const before=sent;x.c.snapshot();await sleep(50);assert.equal(sent,before);assert.equal(server.connections.length,1);
 }finally{x.close();}
});
