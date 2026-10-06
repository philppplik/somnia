import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {Awareness,applyAwarenessUpdate,encodeAwarenessUpdate} from 'y-protocols/awareness';
import {safeUser,safeAwareness,participantsOf} from './awarenessSafe';
test('hostile names and colours are cleaned',()=>{
 const u=safeUser({name:'<img src=x onerror=1>\u0000'+'a'.repeat(100),color:'red;background:url(//evil)'},5);
 assert.ok(u.name.length<=32);assert.equal(/[<>\u0000]/.test(u.name),false);assert.match(u.color,/^#[0-9a-f]{6}$/i);assert.equal(u.colorLight,u.color+'38');
 assert.equal(safeUser(null,1).name,'Guest');assert.equal(safeUser('x',1).name,'Guest');});
test('safeAwareness sanitises remote states only and passes local writes through',()=>{
 const a=new Awareness(new Y.Doc()),b=new Awareness(new Y.Doc());
 b.setLocalState({user:{name:'Eve<',color:'url(x)'},cursor:{anchor:{type:{client:2,clock:0}},head:{type:{client:2,clock:0}}},evil:{x:1}});
 applyAwarenessUpdate(a,encodeAwarenessUpdate(b,[b.clientID]),'remote');
 a.setLocalStateField('user',{name:'Me',color:'#112233',colorLight:'#11223333'});
 const s=safeAwareness(a);
 assert.equal(s.clientID,a.clientID);assert.equal(s.doc.clientID,a.doc.clientID);
 const remote=s.getStates().get(b.clientID) as {user:{name:string;color:string};evil?:unknown;cursor:unknown};
 assert.equal(remote.user.name,'Eve');assert.match(remote.user.color,/^#[0-9a-f]{6}$/i);assert.equal(remote.evil,undefined);assert.deepEqual(remote.cursor,{anchor:{type:{client:2,clock:0}},head:{type:{client:2,clock:0}}});
 assert.equal((s.getStates().get(a.clientID) as {user:{name:string}}).user.name,'Me');
 s.setLocalStateField('cursor',{anchor:3,head:3});assert.deepEqual((a.getLocalState() as {cursor:unknown}).cursor,{anchor:3,head:3});
 const p=participantsOf(a);assert.equal(p[0].self,true);assert.equal(p.length,2);
 a.destroy();b.destroy();});
test('scoped presence rejects other files and malformed relative positions',()=>{
 const a=new Awareness(new Y.Doc()),b=new Awareness(new Y.Doc());try{const user={name:'Mara',color:'#C2410C',participantId:'mara'};b.setLocalState({user,file:'other.html',cursor:{anchor:{tname:'x'},head:{tname:'x'}}});applyAwarenessUpdate(a,encodeAwarenessUpdate(b,[b.clientID]),'remote');const scoped=safeAwareness(a,'index.html');assert.equal(scoped.getStates().get(b.clientID)?.cursor,undefined);
 b.setLocalState({user,file:'index.html',cursor:{anchor:{item:'bad'},head:{type:{client:-1,clock:0}}}});applyAwarenessUpdate(a,encodeAwarenessUpdate(b,[b.clientID]),'remote');assert.equal(scoped.getStates().get(b.clientID)?.cursor,undefined);
 }finally{a.destroy();b.destroy();}
});
