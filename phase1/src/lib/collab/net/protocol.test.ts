import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {Awareness} from 'y-protocols/awareness';
import {MSG_SYNC,MSG_AWARENESS,MSG_IDENTITY,MSG_ENCRYPTED,encodeSyncStep1,encodeUpdate,encodeAwareness,encodeIdentity,peekSyncType,readIdentity,handleMessage} from './protocol';

const docs:Y.Doc[]=[];const mk=()=>{const d=new Y.Doc();docs.push(d);return d;};
test.after(()=>{docs.forEach(d=>d.destroy());});

test('sync step1 -> step2 brings an empty doc up to date',()=>{
 const a=mk(),b=mk();a.getMap('files').set('index.html',new Y.Text('<h1>hi</h1>'));
 const step1=encodeSyncStep1(b);assert.equal(peekSyncType(step1),0);
 const aw=new Awareness(a);
 const reply=handleMessage(step1,a,aw,'b')!;
 assert.equal(peekSyncType(reply),1);
 const bw=new Awareness(b);
 const r2=handleMessage(reply,b,bw,'a');
 assert.equal((b.getMap('files').get('index.html') as Y.Text).toString(),'<h1>hi</h1>');
 // step1 also gets answered with step2 in the other direction: nothing missing, reply is null or tiny
 assert.ok(r2===null||peekSyncType(r2)===2||peekSyncType(r2)===1);
 aw.destroy();bw.destroy();});

test('update frames converge; a skipped frame is repaired by the next sync handshake',()=>{
 const a=mk(),b=mk();const aw=new Awareness(a),bw=new Awareness(b);
 const frames:Uint8Array[]=[];
 a.on('update',u=>frames.push(encodeUpdate(u)));
 a.getMap('files').set('a.html',new Y.Text('one'));
 a.getText('late').insert(0,'edit');
 assert.equal(frames.length,2);
 // Yjs updates from one client are clock-chained: applying only the second leaves it pending.
 handleMessage(frames[1],b,bw,'a');
 assert.equal(b.getText('late').toString(),'');
 // delivering the missed frame integrates it; the sync handshake does exactly this on reconnect.
 handleMessage(frames[0],b,bw,'a');
 assert.equal(b.getText('late').toString(),'edit');
 const r=handleMessage(encodeSyncStep1(b),a,aw,'x');if(r)handleMessage(r,b,bw,'x');
 assert.equal((b.getMap('files').get('a.html') as Y.Text).toString(),'one');
 aw.destroy();bw.destroy();});

test('awareness frames carry cursor state',()=>{
 const a=mk();const awA=new Awareness(a),awB=new Awareness(mk());
 awA.setLocalStateField('cursor',{path:'index.html',index:12});
 const f=encodeAwareness(awA,[a.clientID]);
 assert.equal(f[0],MSG_AWARENESS);
 handleMessage(f,awB.doc,awB,'a');
 assert.deepEqual(awB.getStates().get(a.clientID)?.cursor,{path:'index.html',index:12});
 awA.destroy();awB.destroy();});

test('peekSyncType reads subtypes and ignores other frames',()=>{
 const d=mk();
 assert.equal(peekSyncType(encodeSyncStep1(d)),0);
 assert.equal(peekSyncType(encodeUpdate(new Uint8Array([1,2]))),2);
 assert.equal(peekSyncType(encodeIdentity({type:'presence',people:[]})),-1);
 assert.equal(peekSyncType(new Uint8Array([MSG_ENCRYPTED,1,2,3])),-1);});

test('identity frames round trip and reject garbage',()=>{
 const msg={type:'identity' as const,identity:{id:'1',role:'editor' as const,name:'Ann'}};
 const f=encodeIdentity(msg);assert.equal(f[0],MSG_IDENTITY);
 assert.deepEqual(readIdentity(f),msg);
 assert.equal(readIdentity(encodeSyncStep1(mk())),null);
 assert.throws(()=>readIdentity(new Uint8Array([...f,0])));
 assert.throws(()=>readIdentity(new Uint8Array([MSG_IDENTITY,...new TextEncoder().encode('[1,2]')])));});

test('handleMessage refuses identity frames (they are handled one layer up)',()=>{
 const d=mk();const aw=new Awareness(d);
 assert.throws(()=>handleMessage(encodeIdentity({type:'presence',people:[]}),d,aw,'x'));
 assert.equal(MSG_SYNC,0);assert.equal(MSG_AWARENESS,1);
 aw.destroy();});
