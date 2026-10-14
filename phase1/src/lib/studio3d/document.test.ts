import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_EMBED_SCENE_BYTES,MAX_EMBED_ENV_BYTES,buildDocument,parseDocument,migrate,sceneBytes,toBase64,fromBase64,DocumentError,DOC_VERSION,type Migrations} from './document';
import {defaultEnv,defaultSnap} from './model';
const glb=new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0,12,0,0,0]);
const base=()=>({glb,unit:'mm' as const,env:{...defaultEnv(),preset:'sky' as const,intensity:1.5,background:true},snap:{...defaultSnap(),on:true,move:0.5},view:{position:[1,2,3] as [number,number,number],target:[0,0,0] as [number,number,number],fov:45},extras:[{i:0,shadow:true},{i:3,area:{position:[1,2,3] as [number,number,number],quaternion:[0,0,0,1] as [number,number,number,number],scale:[1,1,1] as [number,number,number],color:'#ffffff',intensity:6,width:2,height:3,name:'Area light'}}]});
test('a document round-trips with every field',()=>{
 const d=parseDocument(buildDocument(base()));
 assert.equal(d.version,DOC_VERSION);assert.equal(d.unit,'mm');assert.equal(d.env.preset,'sky');assert.equal(d.env.intensity,1.5);assert.equal(d.env.background,true);
 assert.equal(d.snap.on,true);assert.equal(d.snap.move,0.5);assert.deepEqual(d.view,base().view);assert.equal(d.extras.length,2);assert.equal(d.extras[1].area?.height,3);
 assert.ok('data' in d.scene&&Buffer.from(fromBase64(d.scene.data)).equals(Buffer.from(glb)));
});
test('base64 helpers handle large buffers and reject damage',()=>{
 const big=new Uint8Array(1_000_000);for(let i=0;i<big.length;i++)big[i]=(i*7919)&255;
 assert.ok(Buffer.from(fromBase64(toBase64(big))).equals(Buffer.from(big)));
 assert.throws(()=>fromBase64('abc'),DocumentError);assert.throws(()=>fromBase64('ab$d'),DocumentError);
});
test('sidecar documents reference a plain file name and need that file',async()=>{
 const d=parseDocument(buildDocument({...base(),sidecar:'room.glb'}));assert.deepEqual(d.scene,{uri:'room.glb'});
 await assert.rejects(()=>sceneBytes(d,[]),DocumentError);
 const bytes=await sceneBytes(d,[{name:'dir/ROOM.glb',bytes:async()=>glb}]);assert.equal(bytes.length,12);
 for(const bad of ['../x.glb','a/b.glb','http://x/y.glb','file:///etc/passwd','C:\\x.glb','']){
  assert.throws(()=>parseDocument(JSON.stringify({format:'somnia-3d',version:1,scene:{uri:bad}})),DocumentError,bad);
 }
});
test('rejects other files, newer versions and missing scene data',()=>{
 assert.throws(()=>parseDocument('nope'),DocumentError);assert.throws(()=>parseDocument('{"format":"other","version":1}'),DocumentError);assert.throws(()=>parseDocument('[]'),DocumentError);
 assert.throws(()=>parseDocument(JSON.stringify({format:'somnia-3d',version:DOC_VERSION+1,scene:{uri:'a.glb'}})),/newer version/);
 assert.throws(()=>parseDocument(JSON.stringify({format:'somnia-3d',version:1})),/no scene data/);
 assert.throws(()=>parseDocument(JSON.stringify({format:'somnia-3d',version:0,scene:{uri:'a'}})),DocumentError);
});
test('validates settings, view and node entries',()=>{
 const doc=(x:object)=>JSON.stringify({format:'somnia-3d',version:1,scene:{uri:'a.glb'},...x});
 assert.throws(()=>parseDocument(doc({unit:'parsec'})),DocumentError);
 assert.throws(()=>parseDocument(doc({env:{preset:'moon'}})),DocumentError);assert.throws(()=>parseDocument(doc({env:{intensity:'x'}})),DocumentError);
 assert.throws(()=>parseDocument(doc({snap:{move:0}})),DocumentError);
 assert.throws(()=>parseDocument(doc({view:{position:[1,2],target:[0,0,0],fov:40}})),DocumentError);assert.throws(()=>parseDocument(doc({view:{position:[1,2,3],target:[0,0,0],fov:500}})),DocumentError);
 assert.throws(()=>parseDocument(doc({extras:[{i:-1}]})),DocumentError);assert.throws(()=>parseDocument(doc({extras:[{i:1},{i:1}]})),DocumentError);
 assert.throws(()=>parseDocument(doc({extras:[{i:1,shadow:'yes'}]})),DocumentError);
 assert.throws(()=>parseDocument(doc({extras:[{i:1,area:{position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1],color:'red',intensity:1,width:1,height:1}}]})),DocumentError);
 const d=parseDocument(doc({}));assert.equal(d.unit,'m');assert.equal(d.view,null);assert.deepEqual(d.extras,[]);assert.equal(d.env.preset,'studio');
});
test('a custom environment keeps its name but no data',()=>{
 const d=parseDocument(JSON.stringify({format:'somnia-3d',version:1,scene:{uri:'a.glb'},env:{preset:'custom',customName:'sunset.hdr',intensity:2}}));
 assert.equal(d.env.preset,'custom');assert.equal(d.env.customName,'sunset.hdr');assert.equal(d.env.intensity,2);
});
test('migrations run in order and a missing step is an error',()=>{
 const m:Migrations={1:d=>({...d,renamed:d.old}),2:d=>({...d,third:true})};
 const out=migrate({version:1,old:'x'},m,3);assert.equal(out.version,3);assert.equal(out.renamed,'x');assert.equal(out.third,true);
 assert.throws(()=>migrate({version:1},{},2),/old format/);assert.throws(()=>migrate({version:4},m,3),/newer version/);
});

test('a custom environment map embeds and round-trips',()=>{
 const hdr=new Uint8Array([35,63,82,65,68,73,65,78,67,69,10,1,2,3]);
 const d=parseDocument(buildDocument({...base(),env:{...defaultEnv(),preset:'custom',customName:'x.hdr'},envMap:{name:'C:\\maps\\Sky.HDR',bytes:hdr}}));
 assert.ok(d.envMap);assert.equal(d.envMap.name,'Sky.HDR');assert.ok(Buffer.from(fromBase64(d.envMap.data)).equals(Buffer.from(hdr)));
 assert.equal(d.env.preset,'custom');assert.equal(d.env.customName,'Sky.HDR');
 assert.equal(parseDocument(buildDocument(base())).envMap,null);
});
test('embedding rejects a wrong type or a map over the limit',()=>{
 assert.throws(()=>buildDocument({...base(),envMap:{name:'a.png',bytes:new Uint8Array(4)}}),DocumentError);
 assert.throws(()=>buildDocument({...base(),envMap:{name:'a.hdr',bytes:new Uint8Array(MAX_EMBED_ENV_BYTES+1)}}),DocumentError);
 assert.doesNotThrow(()=>buildDocument({...base(),envMap:{name:'a.exr',bytes:new Uint8Array(1024)}}));
});
test('reading rejects a damaged, oversized or mistyped embedded map',()=>{
 const doc=(envMap:unknown)=>JSON.stringify({format:'somnia-3d',version:1,scene:{uri:'a.glb'},envMap});
 for(const bad of [{name:'a.hdr',encoding:'base64',data:'!!!!'},{name:'a.png',encoding:'base64',data:'AAAA'},{name:'a.hdr',encoding:'hex',data:'AAAA'},{name:'a.hdr',encoding:'base64',data:'A'.repeat(Math.ceil(MAX_EMBED_ENV_BYTES/3)*4+4)},'x',[]])
  assert.throws(()=>parseDocument(doc(bad)),DocumentError);
 assert.equal(parseDocument(doc(null)).envMap,null);
});
test('an embedded scene above the size limit is refused when saving and when opening, a sidecar is fine',()=>{
 const big=new Uint8Array(MAX_EMBED_SCENE_BYTES+1);
 assert.throws(()=>buildDocument({...base(),glb:big}),DocumentError);
 assert.doesNotThrow(()=>buildDocument({...base(),glb:big,sidecar:'big.glb'}));
 const doc=JSON.parse(buildDocument(base()));doc.scene={encoding:'base64',data:'A'.repeat(Math.ceil(MAX_EMBED_SCENE_BYTES/3)*4+4)};
 assert.throws(()=>parseDocument(JSON.stringify(doc)),/too large/);
});

test('named views round-trip, default to empty and reject damaged entries',()=>{
 const views=[{name:'Front',position:[0,1,4] as [number,number,number],quaternion:[0,0,0,1] as [number,number,number,number],target:[0,0.5,0] as [number,number,number]}];
 const d=parseDocument(buildDocument({...base(),views}));
 assert.deepEqual(d.views,views);
 const empty=parseDocument(buildDocument(base()));
 assert.deepEqual(empty.views,[],'a document without views parses as an empty list');
 const raw=JSON.parse(buildDocument(base()));
 assert.ok(Array.isArray(raw.views)&&raw.views.length===0);
 const bad=JSON.parse(buildDocument(base()));bad.views=[{name:'Broken',position:[0,1],quaternion:[0,0,0,1],target:[0,0,0]}];
 assert.throws(()=>parseDocument(JSON.stringify(bad)),DocumentError);
 const bad2=JSON.parse(buildDocument(base()));bad2.views='not-a-list';
 assert.throws(()=>parseDocument(JSON.stringify(bad2)),DocumentError);
});
