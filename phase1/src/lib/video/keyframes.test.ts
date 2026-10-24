import test from 'node:test';
import assert from 'node:assert/strict';
import {lerpNumber,sanitizeKeys,upsertKey,valueAt} from './keyframes';
import {newTitleOverlay,overlayOpacityAt,overlayRectAt,sanitizeOverlay,type OverlayClip} from './overlayTrack';
import {clipsSignature,parseVideoProject,serializeVideoProject,VIDEO_PROJECT_VERSION} from './projectFile';

test('keyframes: valueAt holds outside the range and falls back without keys',()=>{
 const k=[{t:1,v:10},{t:3,v:20}];
 assert.equal(valueAt(undefined,0,lerpNumber,7),7);
 assert.equal(valueAt([],0,lerpNumber,7),7);
 assert.equal(valueAt(k,0,lerpNumber,-1),10,'before the first key the first value holds');
 assert.equal(valueAt(k,5,lerpNumber,-1),20,'after the last key the last value holds');
 assert.equal(valueAt(k,2,lerpNumber,-1),15,'linear midpoint');
 assert.equal(valueAt(k,1,lerpNumber,-1),10);
 assert.equal(valueAt(k,3,lerpNumber,-1),20);
});

test('keyframes: smooth easing bends the segment, linear stays straight',()=>{
 const lin=[{t:0,v:0},{t:4,v:100}];
 const sm=[{t:0,v:0,e:'smooth' as const},{t:4,v:100}];
 assert.equal(valueAt(lin,1,lerpNumber,-1),25);
 assert.ok(Math.abs(valueAt(sm,1,lerpNumber,-1)-15.625)<1e-9,'smoothstep(0.25) = 0.15625');
 assert.equal(valueAt(sm,2,lerpNumber,-1),50,'midpoint of smoothstep is 0.5');
});

test('keyframes: upsert seeds the static value at t=0 and merges near-simultaneous keys',()=>{
 const first=upsertKey(undefined,{t:0,v:5},2,9);
 assert.deepEqual(first,[{t:0,v:5},{t:2,v:9}]);
 const merged=upsertKey(first,{t:0,v:5},2.01,12);
 assert.deepEqual(merged,[{t:0,v:5},{t:2,v:12}],'within 30 ms the existing key moves');
 const inserted=upsertKey(merged,{t:0,v:5},1,7);
 assert.deepEqual(inserted.map(k=>k.t),[0,1,2],'stays sorted');
});

test('keyframes: sanitizeKeys drops junk, clamps to the duration, dedupes by time',()=>{
 const out=sanitizeKeys([{t:2,v:9,e:'smooth'},{t:1,v:3},{t:1,v:4},{t:'x',v:1},{t:99,v:8}],3,v=>typeof v==='number'?v:null);
 assert.deepEqual(out,[{t:1,v:4},{t:2,v:9,e:'smooth'},{t:3,v:8}],'sorted, later duplicate wins, 99 clamped to duration 3');
 assert.equal(sanitizeKeys('junk',3,v=>v),undefined);
 assert.equal(sanitizeKeys([],3,v=>v),undefined);
});

test('keyframes: overlay sanitize validates key values and drops single-key lists',()=>{
 const o=newTitleOverlay({},2,4);
 const dirty:OverlayClip={...o,rectKeys:[{t:0,v:{x:5,y:-2,w:9,h:9}},{t:2,v:{x:0.5,y:0.5,w:0.2,h:0.2}}],opacityKeys:[{t:0,v:3}]};
 const clean=sanitizeOverlay(dirty);
 assert.equal(clean.rectKeys?.length,2);
 assert.ok(clean.rectKeys![0].v.x<=1&&clean.rectKeys![0].v.w<=1,'rect values run through sanitizeRect');
 assert.equal(clean.opacityKeys,undefined,'a single key is static, not a list');
});

test('keyframes: overlayRectAt/overlayOpacityAt animate and fall back',()=>{
 const o:OverlayClip={...newTitleOverlay({},2,4),rect:{x:0,y:0,w:0.5,h:0.5},opacity:0.4,
  rectKeys:[{t:0,v:{x:0,y:0,w:0.5,h:0.5}},{t:2,v:{x:0.5,y:0,w:0.5,h:0.5}}],
  opacityKeys:[{t:0,v:0},{t:2,v:1}]};
 const r=overlayRectAt(o,3); // overlay-local t=1
 assert.ok(Math.abs(r.x-0.25)<1e-9);
 assert.equal(overlayOpacityAt(o,3),0.5);
 const stat=newTitleOverlay({},2,4);
 assert.equal(overlayRectAt(stat,3),stat.rect,'no keys = the static field');
 assert.equal(overlayOpacityAt(stat,3),stat.opacity);
});

test('keyframes: dirty signature and project roundtrip cover keys',()=>{
 const o=newTitleOverlay({},2,4);
 const keyed:OverlayClip={...o,opacityKeys:[{t:0,v:0},{t:2,v:1}]};
 assert.notEqual(clipsSignature([],[],[keyed]),clipsSignature([],[],[o]));
 const text=serializeVideoProject([],[],'webm',undefined,[keyed]);
 assert.match(text,/"opacityKeys"/);
 const parsed=parseVideoProject(text);
 assert.deepEqual(parsed.overlayClips[0].opacityKeys,[{t:0,v:0},{t:2,v:1}]);
 assert.equal('rectKeys' in parsed.overlayClips[0],false);
});

test('keyframes: project version 3, older files still parse',()=>{
 assert.equal(VIDEO_PROJECT_VERSION,3);
 const v2=JSON.stringify({version:2,app:'somnia-video',clips:[],overlay:[{id:'o1',kind:'image',source:'p.png',at:1,duration:3,rect:{x:0.1,y:0.1,w:0.5,h:0.5},opacity:0.8}]});
 const parsed=parseVideoProject(v2);
 assert.equal(parsed.overlayClips.length,1);
 assert.equal(parsed.overlayClips[0].opacity,0.8);
 assert.equal('opacityKeys' in parsed.overlayClips[0],false);
});
