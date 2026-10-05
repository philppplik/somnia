import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInviteLink,isInsecureRemote,maskLink,timeLeft,cleanDisplayName} from './invite';
const CODE='abcdefghijklmnopqrstuv';
test('parses valid links and flags remote plain ws',()=>{
 const a=parseInviteLink(`  ws://127.0.0.1:4000/?code=${CODE} `);assert.ok(a);assert.equal(a!.local,true);assert.equal(isInsecureRemote(a!),false);
 const b=parseInviteLink(`ws://192.168.1.5:4000/?code=${CODE}`);assert.equal(isInsecureRemote(b!),true);
 const c=parseInviteLink(`wss://x.example/?code=${CODE}`);assert.equal(isInsecureRemote(c!),false);});
test('rejects bad links',()=>{
 for(const bad of ['','hello',`http://a.b/?code=${CODE}`,'ws://a.b/','ws://a.b/?code=short',`ws://u:p@a.b/?code=${CODE}`,`javascript:alert(1)`,`ws://a.b/?code=${CODE} x`,'ws://a.b/?code='+'a'.repeat(100)])assert.equal(parseInviteLink(bad),null,bad);});
test('mask hides most of the code',()=>{assert.equal(maskLink(`ws://h:1/?code=${CODE}`).includes(CODE),false);assert.match(maskLink(`ws://h:1/?code=${CODE}`),/code=abcd/);});
test('time left and names',()=>{assert.equal(timeLeft(1000,2000),'expired');assert.equal(timeLeft(60_000*90,0),'1 h 30 min left');assert.equal(cleanDisplayName('<b>Ann</b>\n'),'bAnn/b');assert.equal(cleanDisplayName('  '),'Guest');});
