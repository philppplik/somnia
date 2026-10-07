import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {checkSessionName,shortenForDisplay,validAvatarUrl,parseAvatarRecord,admitAvatars,AVATAR_MAX_CHARS,AVATAR_MAX_ENTRIES,AVATAR_TOTAL_CHARS} from './identity';
import {ChatModel} from './chatModel';
import {handleChatFrame,chatUpdate,chatStep1} from './chatProtocol';
const P='data:image/jpeg;base64,';
export const GOOD=P+'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzuOH2qzHb57VPDD7Veht/atcPS9qKlXsU47b2q1Hae1WwixnGMt6VKkcj98fTiuidLDwfLbmfZHqUK7ZXW0AGWwPrU628YOCR+HNWEtkTG7irEcY/hjP41jNU1o4pPtq3+Fj16FZ9zEt4enFXtnloMD5j0p9tD04qysO+U8dOKVCq4Ydcu8tEfn1KrdkEFtxkjirCIWOEGB696n8os2wdB19zU6x4+ROvc+lQ6iguWOiX3t9l/X4Hr0a1yBIETgjLegqwkTYySEX2qdIQmAoBb+VTpCAfmyzelc7qOOm3p+Te7fkj1qNYx7WLC5I6DNWIItkZbHSpoYsQkgdsVZWHhF49aiFW1OLW6Wnq3b9D8/o1dSCOHYgIHzHgVYji2ABR8x/Sp1iG8k/dWp44iBux8zdKzlU5Xp00/wA2vNvRHrUaxBHDj5EHPc+lTxw44TAHdqnSHA2joB8xqdIsgEjjsvrXNKpb+tv66vdvRHr0ax//2Q==';
const WRONG_DIMS=P+'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwGiiimIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q==';
const sizeUrl=(n:number)=>GOOD+'A'.repeat(Math.max(0,n-GOOD.length));
test('session name: boundaries, whitespace, controls, bidi, brackets, emoji',()=>{
 assert.deepEqual(checkSessionName('  Mara  '),{ok:true,name:'Mara'});
 assert.deepEqual(checkSessionName('   '),{ok:false,reason:'empty'});
 assert.equal(checkSessionName('a'.repeat(32)).ok,true);
 assert.deepEqual(checkSessionName('a'.repeat(33)),{ok:false,reason:'long'});
 assert.deepEqual(checkSessionName('a'.repeat(40)),{ok:false,reason:'long'});
 for(const bad of ['a\nb','a\u0000b','a\u202eb','a\u2066b','<b>x</b>','a\u2028b','a\u0085b'])assert.deepEqual(checkSessionName(bad),{ok:false,reason:'invalid'},JSON.stringify(bad));
 assert.equal(checkSessionName('\u{1F600}'.repeat(16)).ok,true);assert.equal(checkSessionName('\u{1F600}'.repeat(17)).ok,false);
 assert.equal(checkSessionName('\u05e9\u05dc\u05d5\u05dd Mara').ok,true);
 const s=shortenForDisplay('\u{1F600}'.repeat(40),32);assert.ok(s.length<=32);assert.ok(!/[\ud800-\udbff]$/.test(s.slice(0,-1)));
});
test('avatar url validation: only exact 48x48 JPEG within 8 KiB',()=>{
 assert.equal(validAvatarUrl(GOOD),true);assert.ok(GOOD.length<AVATAR_MAX_CHARS);
 assert.equal(validAvatarUrl(WRONG_DIMS),false,'64x64');
 assert.equal(validAvatarUrl(GOOD.replace('image/jpeg','image/png')),false);
 assert.equal(validAvatarUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),false);
 assert.equal(validAvatarUrl('https://example.com/a.jpg'),false);
 assert.equal(validAvatarUrl('javascript:alert(1)'),false);
 assert.equal(validAvatarUrl(P+'!!!!'),false);assert.equal(validAvatarUrl(P+'AAAA'),false);
 assert.equal(validAvatarUrl(GOOD+'<'),false);assert.equal(validAvatarUrl(5),false);assert.equal(validAvatarUrl(null),false);
 assert.equal(validAvatarUrl(sizeUrl(AVATAR_MAX_CHARS+4)),false,'over 8 KiB total string');
});
test('avatar record: version and data only',()=>{
 assert.ok(parseAvatarRecord({v:1,data:GOOD}));
 assert.equal(parseAvatarRecord({v:2,data:GOOD}),null);assert.equal(parseAvatarRecord({v:1,data:GOOD,url:'https://x'}),null);
 assert.equal(parseAvatarRecord([GOOD]),null);assert.equal(parseAvatarRecord('x'),null);
});
test('admission: invalid dropped, count and total budgets, known first, deterministic',()=>{
 const rec={v:1,data:GOOD};
 const many=Array.from({length:40},(_,i)=>['p'+String(i).padStart(2,'0'),rec] as [string,unknown]);
 const {keep,drop}=admitAvatars([...many,['bad key',rec],['p99',{v:1,data:'x'}]],new Set(['p39']));
 assert.equal(keep.size,AVATAR_MAX_ENTRIES);assert.ok(keep.has('p39'),'known participant outranks unknown keys');assert.ok(drop.includes('bad key')&&drop.includes('p99'));
 const again=admitAvatars([...many].reverse(),new Set(['p39']));assert.deepEqual([...again.keep].sort(),[...keep].sort(),'arrival order does not change the verdict');
 assert.ok(AVATAR_MAX_ENTRIES*AVATAR_MAX_CHARS<=AVATAR_TOTAL_CHARS);
});
test('chat doc: thumbnails live in a separate map, bounded under hostile and repeated writes',()=>{
 const a=new ChatModel(),b=new ChatModel();
 try{
  a.noteParticipant('alice');b.noteParticipant('alice');b.noteParticipant('bob');a.noteParticipant('bob');
  assert.equal(a.publishAvatar('alice',GOOD),true);
  Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(a.doc));
  assert.equal(b.avatarOf('alice'),GOOD);assert.equal(a.messages.size+b.messages.size,0,'no message or author record carries the picture');
  const c=new ChatModel();Y.applyUpdate(c.doc,Y.encodeStateAsUpdate(a.doc));assert.equal(c.avatarOf('alice'),undefined,'unknown participant id is not displayed');c.noteParticipant('alice');assert.equal(c.avatarOf('alice'),GOOD);c.destroy();
  const evil=new Y.Doc();Y.applyUpdate(evil,Y.encodeStateAsUpdate(b.doc));
  const m=evil.getMap('participantAvatarsV1');
  evil.transact(()=>{m.set('bob',{v:1,data:'https://evil.example/x.png'});m.set('x1',{v:1,data:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='});m.set('x2',{v:1,data:sizeUrl(500000)});m.set('x3','junk');for(let i=0;i<500;i++)m.set('k'+i,{v:1,data:GOOD});});
  Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(evil,Y.encodeStateVector(b.doc)));
  assert.equal(b.avatarOf('bob'),undefined);assert.ok(b.avatars.size<=AVATAR_MAX_ENTRIES);assert.equal(b.avatarOf('alice'),GOOD);
  for(let i=0;i<300;i++){evil.transact(()=>m.set('bob',{v:1,data:i%2?GOOD:'bad'}));Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(evil,Y.encodeStateVector(b.doc)));}
  const size=Y.encodeStateAsUpdate(b.doc).length;assert.ok(size<AVATAR_TOTAL_CHARS+64*1024,'document stays bounded: '+size);
  assert.equal(a.publishAvatar('bob','not a data url'),false);
 }finally{a.destroy();b.destroy();}
});
test('legacy peers: messages and mentions unaffected, frames round-trip with and without the map',()=>{
 const withMap=new ChatModel(),legacy=new Y.Doc();
 try{
  withMap.noteParticipant('alice');withMap.publishAvatar('alice',GOOD);
  const m=withMap.send({author:{id:'alice',name:'Alice',token:0},body:'hi @bob',mentions:['bob'],attachments:[]});
  assert.equal(handleChatFrame(chatUpdate(Y.encodeStateAsUpdate(withMap.doc)),legacy,'peer'),null);
  assert.equal((legacy.getMap('messages').get(m.id) as {author:{name:string}}).author.name,'Alice');
  const old=new ChatModel();old.send({author:{id:'old',name:'Old',token:1},body:'legacy',mentions:[],attachments:[]});
  Y.applyUpdate(withMap.doc,Y.encodeStateAsUpdate(old.doc));assert.equal(withMap.list().length,2);assert.equal(withMap.avatarOf('old'),undefined);
  assert.ok(chatStep1(withMap.doc).length>0);old.destroy();
 }finally{withMap.destroy();legacy.destroy();}
});
test('transport: a full chat state with 16 maximum thumbnails stays far below the relay frame cap',()=>{
 const a=new ChatModel();try{for(let i=0;i<AVATAR_MAX_ENTRIES;i++){a.noteParticipant('p'+i);a.publishAvatar('p'+i,GOOD);}
  const frame=chatUpdate(Y.encodeStateAsUpdate(a.doc));assert.ok(frame.length<AVATAR_TOTAL_CHARS+4096,String(frame.length));}finally{a.destroy();}
});
