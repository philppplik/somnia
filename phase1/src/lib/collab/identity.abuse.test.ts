import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {checkSessionName,shortenForDisplay,validAvatarUrl,jpegSize,parseAvatarRecord,admitAvatars,SESSION_NAME_MAX,AVATAR_MAX_CHARS,AVATAR_MAX_ENTRIES,AVATAR_TOTAL_CHARS,AVATAR_MAP_KEY} from './identity';
import {ChatModel} from './chatModel';
import {cleanProfile} from '../account';
import {GOOD} from './identity.test';

const P='data:image/jpeg;base64,';
const bytesOf=(url:string)=>Uint8Array.from(atob(url.slice(P.length)),c=>c.charCodeAt(0));
const urlOf=(b:Uint8Array)=>{let s='';for(const x of b)s+=String.fromCharCode(x);return P+btoa(s);};
const GOOD_BYTES=bytesOf(GOOD);
/** Index of the first SOF marker (FF C0) in GOOD. */
const sofAt=()=>{for(let i=2;i<GOOD_BYTES.length-1;i++)if(GOOD_BYTES[i]===0xff&&GOOD_BYTES[i+1]===0xc0)return i;throw new Error('no SOF');};
const withSize=(w:number,h:number,marker=0xc0)=>{const b=GOOD_BYTES.slice();const i=sofAt();b[i+1]=marker;b[i+5]=h>>8;b[i+6]=h&255;b[i+7]=w>>8;b[i+8]=w&255;return b;};
/** GOOD padded with trailing bytes so the whole data URL is exactly `len` characters (len-23 must be a multiple of 4). */
const padded=(len:number)=>{const need=(len-P.length)/4*3;const b=new Uint8Array(Math.max(need,GOOD_BYTES.length));b.set(GOOD_BYTES);return urlOf(b);};

test('jpegSize: only a well-formed JPEG header yields a size',()=>{
 assert.deepEqual(jpegSize(GOOD_BYTES),{w:48,h:48});
 assert.equal(jpegSize(new Uint8Array()),null);
 assert.equal(jpegSize(new Uint8Array([0xff,0xd8])),null,'SOI only');
 assert.equal(jpegSize(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),null,'PNG magic');
 assert.equal(jpegSize(GOOD_BYTES.slice(0,sofAt()+5)),null,'truncated inside SOF');
 assert.equal(jpegSize(GOOD_BYTES.slice(0,sofAt())),null,'cut before SOF');
 assert.deepEqual(jpegSize(withSize(48,48,0xc2)),{w:48,h:48},'progressive baseline allowed');
 const b=GOOD_BYTES.slice();b[4]=0;b[5]=0;assert.equal(jpegSize(b),null,'segment length < 2 does not loop forever');
 const huge=GOOD_BYTES.slice();huge[4]=0xff;huge[5]=0xff;assert.equal(jpegSize(huge),null,'segment length past the end');
 const sos=new Uint8Array([0xff,0xd8,0xff,0xda,0x00,0x02,0xff,0xc0,0,0,0,0,0,0,0,0,0,0]);assert.equal(jpegSize(sos),null,'scan data before any SOF');
 assert.equal(jpegSize(withSize(48,48,0xc3)),null,'lossless SOF is not accepted');
});
test('avatar url: exact 48x48, every other size or shape is rejected',()=>{
 assert.equal(validAvatarUrl(urlOf(withSize(48,48))),true);
 for(const [w,h] of [[47,48],[48,47],[49,48],[48,49],[0,0],[1,1],[64,64],[256,256],[65535,65535],[24,96]]as const)assert.equal(validAvatarUrl(urlOf(withSize(w,h))),false,w+'x'+h);
 assert.equal(validAvatarUrl(urlOf(withSize(48,48,0xc3))),false);
});
test('avatar url: 8 KiB ceiling counts the whole data URL, base64 must be canonical',()=>{
 const max=AVATAR_MAX_CHARS-1;// 8191: largest length with valid base64 framing
 assert.equal((max-P.length)%4,0);
 assert.equal(validAvatarUrl(padded(max)),true,String(padded(max).length));
 assert.equal(validAvatarUrl(padded(max+4)),false,'8195 chars');
 assert.equal(padded(AVATAR_MAX_CHARS+3).length>AVATAR_MAX_CHARS,true);
 assert.equal(validAvatarUrl(padded(AVATAR_MAX_CHARS+3)),false);
 assert.equal(validAvatarUrl(GOOD+'\n'),false,'trailing newline');
 assert.equal(validAvatarUrl(GOOD+' '),false);
 assert.equal(validAvatarUrl(' '+GOOD),false);
 assert.equal(validAvatarUrl(GOOD.replace('data:image/jpeg','data:image/JPEG')),false,'mime is exact');
 assert.equal(validAvatarUrl(GOOD.replace('data:image/jpeg;base64,','data:image/jpeg;charset=utf-8;base64,')),false);
 assert.equal(validAvatarUrl(GOOD.replace('data:image/jpeg;base64,','data:image/jpg;base64,')),false);
 assert.equal(validAvatarUrl(GOOD.replace('data:','DATA:')),false);
 assert.equal(validAvatarUrl(GOOD.replace(/\+/g,'-').replace(/\//g,'_')),false,'url-safe alphabet is not base64');
 assert.equal(validAvatarUrl(GOOD.slice(0,-1)),false,'length not a multiple of 4');
 assert.equal(validAvatarUrl(GOOD+'==='),false);
 assert.equal(validAvatarUrl(GOOD.replace(/=*$/,'')+'=====' ),false);
 assert.equal(validAvatarUrl(GOOD.slice(0,40)+'%41'+GOOD.slice(40)),false,'percent escapes');
 assert.equal(validAvatarUrl(GOOD+'"onerror="x'),false);
 assert.equal(validAvatarUrl(P),false);assert.equal(validAvatarUrl(''),false);
 for(const v of [undefined,null,0,1,true,{},[],[GOOD],{toString:()=>GOOD},Symbol.iterator.description,new String(GOOD)])assert.equal(validAvatarUrl(v as unknown),false,String(typeof v));
});
test('avatar record: strict shape, no prototype tricks',()=>{
 const base:Record<string,unknown>={v:1,data:GOOD};
 assert.ok(parseAvatarRecord(base));
 assert.deepEqual(parseAvatarRecord(base),{v:1,data:GOOD});
 assert.equal(parseAvatarRecord({v:'1',data:GOOD}),null);assert.equal(parseAvatarRecord({v:1.0000001,data:GOOD}),null);
 assert.equal(parseAvatarRecord({v:1}),null);assert.equal(parseAvatarRecord({data:GOOD}),null);
 assert.equal(parseAvatarRecord({v:1,data:GOOD,extra:undefined}),null,'extra key even when undefined');
 assert.equal(parseAvatarRecord({v:1,data:GOOD,alt:'x'}),null);
 assert.equal(parseAvatarRecord(null),null);assert.equal(parseAvatarRecord(undefined),null);assert.equal(parseAvatarRecord(7),null);assert.equal(parseAvatarRecord(()=>0),null);
 const nullProto=Object.assign(Object.create(null),{v:1,data:GOOD});assert.ok(parseAvatarRecord(nullProto),'null-prototype object is still a plain record');
 const inherited=Object.create({v:1,data:GOOD});assert.equal(parseAvatarRecord(inherited),null,'inherited fields are not own data');
 const out=parseAvatarRecord(base)!;assert.notEqual(out,base,'returns a fresh object');
});
test('admission: hostile keys, size and count budgets, determinism',()=>{
 const rec={v:1,data:GOOD};
 const hostile=['__proto__','constructor','toString','hasOwnProperty','a b','a/b','a.b','',' ','x'.repeat(101),'\u00e9','\u{1F600}','a\nb','<img>'];
 const {keep,drop}=admitAvatars(hostile.map(k=>[k,rec] as [string,unknown]),new Set());
 // identifier-shaped names like __proto__ are legal keys, the rest must be dropped
 for(const k of hostile)if(!/^[a-zA-Z0-9_-]{1,100}$/.test(k))assert.ok(drop.includes(k)&&!keep.has(k),JSON.stringify(k));
 assert.ok(keep.has('__proto__')&&keep.has('constructor'),'legal ids are kept without touching Object.prototype');
 assert.equal(({} as Record<string,unknown>).data,undefined);
 assert.ok(admitAvatars([['x'.repeat(100),rec]],new Set()).keep.has('x'.repeat(100)),'100 chars is the limit');
 assert.ok(AVATAR_MAX_ENTRIES*AVATAR_MAX_CHARS<=AVATAR_TOTAL_CHARS,'count cap implies total cap');
 assert.deepEqual(admitAvatars([],new Set()),{keep:new Set(),drop:[]});
 // non-record values of any kind
 const junk:[string,unknown][]=[['a',null],['b',undefined],['c',0],['d','str'],['e',[rec]],['f',{v:1}],['g',{v:1,data:GOOD+'x'}]];
 const r=admitAvatars(junk,new Set(['a','b','c','d','e','f','g']));assert.equal(r.keep.size,0);assert.equal(r.drop.length,junk.length);
 // verdict is independent of order and of which keys are known
 const many=Array.from({length:50},(_,i)=>['p'+String(i).padStart(2,'0'),rec] as [string,unknown]);
 const known=new Set(['p49','p48','p47']);
 const fwd=admitAvatars(many,known),rev=admitAvatars([...many].reverse(),known);
 assert.deepEqual([...fwd.keep].sort(),[...rev.keep].sort());assert.equal(fwd.keep.size,AVATAR_MAX_ENTRIES);
 for(const k of known)assert.ok(fwd.keep.has(k));
 assert.equal(fwd.keep.size+fwd.drop.length,50,'every entry gets exactly one verdict');
 assert.ok(!fwd.drop.some(k=>fwd.keep.has(k)));
 // an attacker with lexically small unknown keys cannot evict a known participant
 const flood=Array.from({length:100},(_,i)=>['a'+String(i).padStart(3,'0'),rec] as [string,unknown]);
 assert.ok(admitAvatars([...flood,['zz-real',rec]],new Set(['zz-real'])).keep.has('zz-real'));
});
test('chat model: publish rules and hostile participant ids',()=>{
 const m=new ChatModel();
 try{
  assert.equal(m.publishAvatar('a',GOOD),true,'publishing registers the local id');
  const size1=Y.encodeStateAsUpdate(m.doc).length;
  for(let i=0;i<50;i++)assert.equal(m.publishAvatar('a',GOOD),true);
  assert.equal(Y.encodeStateAsUpdate(m.doc).length,size1,'repeated publish once per identity does not grow the document');
  assert.equal(m.publishAvatar('b','data:image/png;base64,AAAA'),false);assert.equal(m.avatars.has('b'),false,'invalid data never written');
  assert.equal(m.publishAvatar('b',padded(AVATAR_MAX_CHARS+3)),false);
  assert.equal(m.publishAvatar('b',urlOf(withSize(64,64))),false);
  assert.equal(m.avatarOf('nobody'),undefined);
  for(const id of ['__proto__','constructor','toString'])assert.equal(m.avatarOf(id),undefined,id);
  m.noteParticipant('__proto__');assert.equal(m.avatarOf('__proto__'),undefined,'known but no record');
  for(let i=0;i<200;i++)m.noteParticipant('n'+i);
  assert.equal(m.publishAvatar('late-comer',GOOD),false,'known-id table is capped');
  assert.equal(m.avatarOf('late-comer'),undefined);
  assert.ok(m.avatars.size<=AVATAR_MAX_ENTRIES);
 }finally{m.destroy();}
});
test('chat model: remote tampering is pruned, bounded and never touches messages',()=>{
 const a=new ChatModel(),b=new ChatModel();
 try{
  a.noteParticipant('alice');b.noteParticipant('alice');b.noteParticipant('bob');
  a.publishAvatar('alice',GOOD);Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(a.doc));
  assert.equal(b.avatarOf('alice'),GOOD);
  // a peer overwrites alice with garbage: the entry is pruned, initials come back, alice may publish again
  const evil=new Y.Doc();Y.applyUpdate(evil,Y.encodeStateAsUpdate(b.doc));
  for(const bad of ['https://evil.example/a.jpg','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',padded(AVATAR_MAX_CHARS+3),'x',42] as unknown[]){
   evil.transact(()=>evil.getMap(AVATAR_MAP_KEY).set('alice',bad));
   Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(evil,Y.encodeStateVector(b.doc)));
   assert.equal(b.avatarOf('alice'),undefined,String(bad).slice(0,30));assert.equal(b.avatars.has('alice'),false,'pruned from the doc');
   assert.equal(b.publishAvatar('alice',GOOD),true,'owner can republish');
   Y.applyUpdate(evil,Y.encodeStateAsUpdate(b.doc));
  }
  // a record with an extra field is rejected even if its picture is valid
  evil.transact(()=>evil.getMap(AVATAR_MAP_KEY).set('bob',{v:1,data:GOOD,url:'https://x.example'}));
  Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(evil,Y.encodeStateVector(b.doc)));assert.equal(b.avatarOf('bob'),undefined);
  // key flood from a hostile peer
  evil.transact(()=>{const m=evil.getMap(AVATAR_MAP_KEY);for(let i=0;i<1000;i++)m.set('f'+i,{v:1,data:GOOD});});
  Y.applyUpdate(b.doc,Y.encodeStateAsUpdate(evil,Y.encodeStateVector(b.doc)));
  assert.ok(b.avatars.size<=AVATAR_MAX_ENTRIES);assert.equal(b.avatarOf('alice'),GOOD,'known participant survives the flood');
  let total=0;for(const [,v] of b.avatars.entries())total+=(v as {data:string}).data.length;assert.ok(total<=AVATAR_TOTAL_CHARS);
  assert.equal(b.messages.size,0);assert.equal(b.colours.size,0);assert.equal(b.order.size,0);
  evil.destroy();
 }finally{a.destroy();b.destroy();}
});
test('chat model: after destroy nothing is published or pruned, no listener leak',()=>{
 const m=new ChatModel();m.noteParticipant('a');let n=0;const off=m.subscribe(()=>{n++;});
 m.destroy();
 assert.equal(m.publishAvatar('a',GOOD),false);assert.equal(m.avatars.has('a'),false);
 m.avatars.set('zz',{v:1,data:'bad'} as never);assert.equal(m.avatars.has('zz'),true,'a destroyed model no longer edits the doc');
 assert.equal(n,0,'no change events after destroy');off();
});
test('chat model: legacy sender names stay plain text in history',()=>{
 const m=new ChatModel();
 try{
  const msg=m.send({author:{id:'x',name:'<img src=x onerror=alert(1)>',token:0},body:'hi',mentions:[],attachments:[]});
  const stored=m.messages.get(msg.id)!;
  assert.ok(!/[<>]/.test(stored.author.name),'angle brackets are stripped by the wire sanitizer: '+stored.author.name);
  assert.equal(JSON.stringify([...m.messages.values()]).includes('data:image'),false,'no picture inside message records');
 }finally{m.destroy();}
});
test('session name: more edges around the 32-unit limit',()=>{
 assert.deepEqual(checkSessionName('a'.repeat(32)+'   '),{ok:true,name:'a'.repeat(32)},'whitespace is trimmed before counting');
 assert.deepEqual(checkSessionName('\u00a0\u3000 Mara \u00a0'),{ok:true,name:'Mara'},'NBSP and ideographic space trimmed');
 assert.deepEqual(checkSessionName('\u00a0\u3000\ufeff'),{ok:false,reason:'empty'},'BOM, NBSP and ideographic space only');
 assert.deepEqual(checkSessionName('Mara  Lee'),{ok:true,name:'Mara  Lee'},'inner spacing is kept, not rewritten');
 assert.equal(SESSION_NAME_MAX,32);
 assert.equal(checkSessionName('\u{1F600}'.repeat(16)+'a').ok,false,'33 UTF-16 units');
 assert.equal(checkSessionName('e\u0301'.repeat(16)).ok,true,'32 units of combining pairs');
 assert.equal(checkSessionName('e\u0301'.repeat(17)).ok,false,'units, not graphemes, are counted');
 assert.equal(checkSessionName('\u202a').ok,false);assert.equal(checkSessionName('\u202c').ok,false);assert.equal(checkSessionName('\u2069').ok,false);
 for(const cp of [0,1,8,9,10,11,12,13,31,127,128,0x85,0x9f])assert.equal(checkSessionName('a'+String.fromCharCode(cp)+'b').ok,false,'U+'+cp.toString(16));
 for(const bad of ['a>b','<','>','a<b'])assert.equal(checkSessionName(bad).ok,false,bad);
 assert.equal(checkSessionName('R&D <3'.replace('<','')).ok,true,'ampersand alone is legal text');
 assert.equal(checkSessionName("O'Brien \"Bo\"").ok,true);
 assert.equal(checkSessionName('\u0645\u0631\u062d\u0628\u0627').ok,true,'Arabic');
 assert.equal(checkSessionName('Mara\u200f').ok,true,'plain RLM mark is allowed, only embeddings/overrides/isolates are not');
 assert.equal(checkSessionName('.'.repeat(32)).ok,true);
 
});
test('session name: KNOWN GAPS (characterization, change deliberately)',()=>{
 // Zero-width characters are not trimmed or rejected: a name can render as blank.
 assert.equal(checkSessionName('\u200b').ok,true,'zero-width space only passes validation today');
 assert.equal(checkSessionName('\u2800').ok,true,'braille blank passes validation today');
 // A lone surrogate is accepted as a name.
 assert.equal(checkSessionName('\ud83d').ok,true,'lone high surrogate passes validation today');
});
test('shortenForDisplay: never splits a surrogate pair or a cluster, never grows',()=>{
 assert.equal(shortenForDisplay('Mara'),'Mara');assert.equal(shortenForDisplay(''),'');
 assert.equal(shortenForDisplay('a'.repeat(32)),'a'.repeat(32));
 const s33=shortenForDisplay('a'.repeat(33));assert.equal(s33,'a'.repeat(31)+'\u2026');assert.equal(s33.length,32);
 const lone=/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
 for(const name of ['\u{1F600}'.repeat(40),'a'+'\u{1F600}'.repeat(40),'\u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466}'.repeat(10),'e\u0301'.repeat(40),'\u{1F1E9}\u{1F1EA}'.repeat(20),'\u05e9'.repeat(50)])
  for(const max of [2,3,5,8,31,32]){const out=shortenForDisplay(name,max);assert.ok(out.length<=max,max+' '+out.length);assert.ok(!lone.test(out),'lone surrogate for '+JSON.stringify(name.slice(0,4))+' max '+max);assert.ok(out.endsWith('\u2026'));}
 const fam='\u{1F468}\u200d\u{1F469}\u200d\u{1F467}\u200d\u{1F466}';
 const cut=shortenForDisplay(fam.repeat(10),32);assert.ok(!cut.replace('\u2026','').split(fam).join('').length||cut.replace('\u2026','').split(fam).join('')==='' ,'only whole family emoji remain: '+JSON.stringify(cut));
});
test('profile cleaning feeds the join prefill without surprises',()=>{
 const p=cleanProfile({nickname:'x'.repeat(60),avatar:''});assert.equal(p.nickname.length,40);assert.equal(checkSessionName(p.nickname).ok,false,'40-unit profile name is flagged, not truncated by the session check');
 assert.equal(checkSessionName('x'.repeat(32)).ok,true);
 for(const v of [null,undefined,0,'str',[],{nickname:5,avatar:5},{nickname:{},avatar:[]}])assert.deepEqual(cleanProfile(v),{nickname:'',avatar:''});
 assert.equal(cleanProfile({nickname:'  Mara  ',avatar:''}).nickname,'  Mara  ','profile keeps raw text; trimming happens in the session check');
 assert.equal(cleanProfile({nickname:'',avatar:GOOD.replace('jpeg','svg+xml')}).avatar,'');
 assert.equal(cleanProfile({nickname:'',avatar:'data:image/png;base64,AAAA\n'}).avatar,'');
 assert.equal(cleanProfile({nickname:'',avatar:'data:image/gif;base64,AAAA'}).avatar,'');
 assert.equal(cleanProfile({nickname:'',avatar:'data:image/png;base64,'+'A'.repeat(400_000)}).avatar,'','profile avatar over 400,000 chars');
 assert.equal(cleanProfile({nickname:'',avatar:GOOD}).avatar,GOOD);
});
