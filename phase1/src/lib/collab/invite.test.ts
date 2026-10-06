import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJoinLink,isInsecureRemote,maskLink,cleanDisplayName,relayRoomUrl,modeOfLink,withMode,hasLinkKey,newRoomId} from './invite';
const KEY='A'.repeat(43);const ROOM='abcdefghijklmnopqrstuvwx';
test('parses relay room links and flags remote plain ws',()=>{
 const a=parseJoinLink(`  ws://127.0.0.1:4000/room/${ROOM}#key=${KEY} `);assert.ok(a);assert.equal(a!.local,true);assert.equal(isInsecureRemote(a!),false);
 const b=parseJoinLink(`ws://192.168.1.5:4000/room/${ROOM}`);assert.equal(isInsecureRemote(b!),true);
 const c=parseJoinLink(`wss://x.example/room/${ROOM}#key=${KEY}`);assert.equal(isInsecureRemote(c!),false);
 assert.ok(parseJoinLink('ws://127.0.0.1:4000/?code=abcdefghijklmnopqrstuv'),'old ?code= form still parses');});
test('rejects bad links',()=>{
 for(const bad of ['','hello',`http://a.b/room/${ROOM}`,'ws://a.b/','ws://a.b/room/short',`ws://u:p@a.b/room/${ROOM}`,'javascript:alert(1)',`ws://a.b/room/${ROOM} x`,`ws://a.b/room/${'a'.repeat(200)}`,`ws://a.b/other/${ROOM}`])assert.equal(parseJoinLink(bad),null,bad);});
test('mask hides the key and most of the room id',()=>{
 const m=maskLink(`wss://r.example/room/${ROOM}#key=ABCD${'x'.repeat(39)}`);
 assert.equal(m.includes(ROOM),false);assert.equal(m.includes('x'.repeat(10)),false);assert.match(m,/#key=ABCD\u2022/);assert.match(m,/\/room\/abcd\u2022/);
 assert.equal(maskLink('ws://h:1/?code=abcdefghijklmnopqrstuv').includes('efghijkl'),false);});
test('hasLinkKey',()=>{assert.equal(hasLinkKey(`ws://h/room/${ROOM}#key=${KEY}`),true);assert.equal(hasLinkKey(`ws://h/room/${ROOM}`),false);});
test('mode of a link comes from the address only',()=>{
 for(const h of ['127.0.0.1:1','192.168.1.5:9','10.1.2.3:9','172.20.0.1:9','localhost:3','mypc.local:4'])assert.equal(modeOfLink(`ws://${h}/room/${ROOM}`),'lan-direct',h);
 for(const h of ['relay.example.com','8.8.8.8:1','172.32.0.1:1'])assert.equal(modeOfLink(`wss://${h}/room/${ROOM}`),'relay',h);});
test('host-written mode label wins over the address guess',()=>{
 assert.equal(modeOfLink(`ws://127.0.0.1:1/room/${ROOM}#key=${KEY}&m=relay`),'relay');
 assert.equal(modeOfLink(`wss://x.example/room/${ROOM}#key=${KEY}&m=lan`),'lan-direct');
 assert.equal(withMode(`ws://h/room/${ROOM}#key=${KEY}`,'relay'),`ws://h/room/${ROOM}#key=${KEY}&m=relay`);
 assert.equal(withMode(`ws://h/room/${ROOM}#key=${KEY}&m=lan`,'relay'),`ws://h/room/${ROOM}#key=${KEY}&m=lan`);
 assert.ok(parseJoinLink(`ws://h/room/${ROOM}#key=${KEY}&m=relay`));assert.equal(hasLinkKey(`ws://h/room/${ROOM}#key=${KEY}&m=relay`),true);});
test('relayRoomUrl builds a room url from a base and keeps an explicit room',()=>{
 const a=relayRoomUrl('wss://relay.example.com',ROOM)!;assert.equal(a.url,`wss://relay.example.com/room/${ROOM}`);assert.equal(a.secure,true);
 assert.equal(relayRoomUrl('relay.example.com/',ROOM)!.url,`wss://relay.example.com/room/${ROOM}`);
 assert.equal(relayRoomUrl('https://r.example/sub',ROOM)!.url,`wss://r.example/sub/room/${ROOM}`);
 assert.equal(relayRoomUrl(`ws://127.0.0.1:8787/room/${'z'.repeat(20)}`,ROOM)!.url,`ws://127.0.0.1:8787/room/${'z'.repeat(20)}`);
 assert.equal(relayRoomUrl('ws://127.0.0.1:8787',ROOM)!.local,true);
 assert.equal(relayRoomUrl('ws://10.0.0.5:8787',ROOM)!.local,false);
 for(const bad of ['','ftp://x','wss://u:p@x','a b','wss://'])assert.equal(relayRoomUrl(bad),null,bad);});
test('room ids have 144 bits and the contract charset',()=>{const a=newRoomId(),b=newRoomId();assert.match(a,/^[A-Za-z0-9_-]{24}$/);assert.notEqual(a,b);});
test('names are cleaned',()=>{assert.equal(cleanDisplayName('<b>Ann</b>\n'),'bAnn/b');assert.equal(cleanDisplayName('  '),'Guest');assert.equal(cleanDisplayName('x'.repeat(80)).length,32);});
