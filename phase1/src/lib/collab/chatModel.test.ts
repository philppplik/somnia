import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {ChatModel,parseMessage,parseAttachment,CHAT_MAX_MESSAGES} from './chatModel';
import {handleChatFrame,chatStep1,chatUpdate} from './chatProtocol';
const author={id:'participant-one',name:'Mara',token:0};
const input={author,body:'Hi @Ayse',mentions:['participant-two'],attachments:[]};
test('separate docs, two identities, mentions, replies and idempotent CRDT delivery',()=>{
 const a=new ChatModel(),b=new ChatModel(),project=new Y.Doc();
 try{const first=a.send(input);assert.deepEqual(first.mentions,['participant-two']);const update=Y.encodeStateAsUpdate(a.doc);Y.applyUpdate(b.doc,update);Y.applyUpdate(b.doc,update);assert.equal(b.list().length,1);
 const reply=b.send({...input,author:{id:'participant-two',name:'Ayse',token:1},replyTo:first.id,body:'Reply'});a.send({...input,replyTo:first.id});Y.applyUpdate(a.doc,Y.encodeStateAsUpdate(b.doc));const nested=a.send({...input,replyTo:reply.id});assert.equal(nested.replyTo,first.id);assert.equal(project.getMap('files').size,0);
 }finally{a.destroy();b.destroy();project.destroy();}
});
test('strict message / metadata limits, hostile filenames and plain text',()=>{
 const a=new ChatModel();try{assert.throws(()=>a.send({...input,body:'x'.repeat(8193)}));const msg=a.send({...input,body:'<script>alert(1)</script>'});assert.equal(msg.body,'<script>alert(1)</script>');assert.equal(parseMessage({...msg,mentions:['bad/id']}),null);assert.equal(parseMessage({...msg,author:{id:'x',name:'x',token:9}}),null);
 const attachment={id:'blob-id',name:'photo.png',hash:'a'.repeat(64),size:128000,mime:'image/png'};assert.ok(parseAttachment(attachment));assert.equal(parseAttachment({...attachment,name:'../secret'}),null);assert.equal(parseAttachment({...attachment,size:10000001}),null);assert.equal(parseAttachment({...attachment,mime:'text/html'}),null);
 assert.throws(()=>a.send({...input,attachments:Array(6).fill(attachment)}));
 }finally{a.destroy();}
});
test('bounded visible history, stable host tokens and cleanup',()=>{
 const a=new ChatModel();try{const tokens=Array.from({length:10},(_,i)=>a.assignColour('p'+i));assert.equal(new Set(tokens.slice(0,8)).size,8);assert.equal(a.assignColour('p0'),tokens[0]);for(let i=0;i<CHAT_MAX_MESSAGES+5;i++)a.send({...input,body:String(i)});assert.equal(a.messages.size,CHAT_MAX_MESSAGES);a.destroy();assert.throws(()=>a.send(input));}finally{a.destroy();}
});
test('versioned subchannel supports late join and rejects unknown versions',()=>{
 const a=new ChatModel(),b=new ChatModel();try{a.send(input);const response=handleChatFrame(chatStep1(b.doc),a.doc,'peer');assert.ok(response);handleChatFrame(response,b.doc,'peer');assert.equal(b.list().length,1);const frame=chatUpdate(Y.encodeStateAsUpdate(a.doc));frame[1]=99;assert.equal(handleChatFrame(frame,b.doc,'peer'),null);}finally{a.destroy();b.destroy();}
});
test('host order ignores skewed client clocks, forged metadata is filtered and UTF8 budget applies',()=>{
 const a=new ChatModel();try{const first=a.send(input);a.confirmPending();const second=a.send({...input,body:'second'});a.messages.set(second.id,{...second,sentAt:1});a.confirmPending();assert.deepEqual(a.list().map(m=>m.id),[first.id,second.id]);assert.ok(a.sequence(second.id)!>a.sequence(first.id)!);assert.equal(parseMessage({...first,sentAt:9e99}),null);assert.equal(parseMessage({...first,id:undefined}),null);assert.throws(()=>a.send({...input,body:'😀'.repeat(3000)}));}finally{a.destroy();}
});
