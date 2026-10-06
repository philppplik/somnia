import test from 'node:test';import assert from 'node:assert/strict';
import * as Y from 'yjs';import {Awareness} from 'y-protocols/awareness';
import {CollabClient} from './net/client';import {memoryServer} from './net/memoryTransport';import {newLinkKey,decryptFrame} from './net/crypto';
import {ChatModel} from './chatModel';import {MSG_CHAT_SYNC} from './chatProtocol';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(f:()=>boolean)=>{for(let i=0;i<100;i++){if(f())return;await sleep(20);}throw Error('timeout');};
test('three real protocol clients: encrypted chat, late join, file isolation and cleanup',async()=>{
 const {server,factory}=memoryServer();const observed:Uint8Array[]=[];
 server.onConnection(end=>end.transport.connect({onOpen:()=>{},onMessage:frame=>{observed.push(frame);for(const peer of server.connections)if(peer!==end)peer.transport.send(frame);},onClose:()=>{}}));
 const link=await newLinkKey(),models:ChatModel[]=[],docs:Y.Doc[]=[],awareness:Awareness[]=[],clients:CollabClient[]=[];
 const client=()=>{const model=new ChatModel(),doc=new Y.Doc(),aw=new Awareness(doc);models.push(model);docs.push(doc);awareness.push(aw);const c=new CollabClient(`ws://127.0.0.1/room/abcdefgh#key=${link.param}`,{session:{doc,awareness:aw},chatDoc:model.doc,transport:factory,syncTimeoutMs:15});clients.push(c);return{c,model,doc};};
 try{const a=client(),b=client();await a.c.connect();await b.c.connect();a.model.send({author:{id:'a',name:'Mara',token:0},body:'encrypted hello',mentions:['b'],attachments:[]});await until(()=>b.model.list().length===1);assert.equal(b.doc.getMap('messages').size,0);
 const late=client();await late.c.connect();await until(()=>late.model.list().length===1);assert.equal(late.model.list()[0].body,'encrypted hello');assert.ok(observed.every(frame=>frame[0]===3));assert.ok((await Promise.all(observed.map(frame=>decryptFrame(link.link,frame)))).some(frame=>frame[0]===MSG_CHAT_SYNC));
 }finally{clients.forEach(c=>c.leave());awareness.forEach(a=>a.destroy());docs.forEach(d=>d.destroy());models.forEach(m=>m.destroy());}
});
test('reconnect broadcasts missed chat edits without relying on a second peer handshake',async()=>{
 const {server,factory}=memoryServer();server.onConnection(end=>end.transport.connect({onOpen(){},onMessage(frame){for(const peer of server.connections)if(peer!==end)peer.transport.send(frame);},onClose(){}}));const key=await newLinkKey();const models=[new ChatModel(),new ChatModel()],docs=[new Y.Doc(),new Y.Doc()],aware=docs.map(d=>new Awareness(d));const clients=docs.map((doc,i)=>new CollabClient(`ws://127.0.0.1/room/abcdefgh#key=${key.param}`,{session:{doc,awareness:aware[i]},chatDoc:models[i].doc,transport:factory,syncTimeoutMs:10,baseDelayMs:20,maxDelayMs:20}));
 try{await clients[0].connect();await clients[1].connect();server.connections[1].drop();await sleep(5);models[1].send({author:{id:'guest',name:'Ayse',token:1},body:'queued while offline',mentions:[],attachments:[]});await until(()=>models[0].list().length===1);assert.equal(models[0].list()[0].body,'queued while offline');}finally{clients.forEach(c=>c.leave());aware.forEach(a=>a.destroy());docs.forEach(d=>d.destroy());models.forEach(m=>m.destroy());}
});
