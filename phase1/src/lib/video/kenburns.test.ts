import test from 'node:test';
import assert from 'node:assert/strict';
import {clearCropKeys,cropAt,hasCrop,isImageClip,kenBurnsPreset,sanitizeClips,setCropKey,setCropKeys,splitAt,type TimelineClip} from './timeline';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';

const img=(id:string,extra:Partial<TimelineClip>={}):TimelineClip=>({id,kind:'image',source:'p.png',in_s:0,out_s:4,gain:1,muted:false,...extra});
const d={ 'p.png':undefined } as Record<string,undefined>;

test('kenburns: preset drifts smoothly from full frame into a centered window',()=>{
 const keys=kenBurnsPreset(4);
 assert.equal(keys.length,2);
 assert.deepEqual(keys[0].v,{left:0,top:0,right:0,bottom:0});
 assert.equal(keys[0].e,'smooth');
 assert.ok(Math.abs(keys[1].v.left-0.12)<1e-9);
 const c=img('a',{cropKeys:keys});
 const mid=cropAt(c,2);
 assert.ok(mid.left>0&&mid.left<0.12,'midpoint is part-way in');
 assert.equal(cropAt(c,0).left,0);
 assert.ok(Math.abs(cropAt(c,4).left-0.12)<1e-9);
});

test('kenburns: sanitize keeps keys on image clips and strips them elsewhere',()=>{
 const keys=kenBurnsPreset(4);
 assert.equal(sanitizeClips([img('a',{cropKeys:keys})],d)[0].cropKeys?.length,2);
 assert.equal(sanitizeClips([{id:'m',source:'m',in_s:0,out_s:4,gain:1,muted:false,cropKeys:keys}],{m:10})[0].cropKeys,undefined,'media clips drop crop keys');
 assert.equal(sanitizeClips([img('a',{cropKeys:[{t:0,v:{left:0.1,top:0,right:0,bottom:0}}]})],d)[0].cropKeys,undefined,'a single key normalizes to static');
 // Zero-crop key values survive sanitation (they are a valid keyframe value).
 assert.deepEqual(sanitizeClips([img('a',{cropKeys:keys})],d)[0].cropKeys?.[0].v,{left:0,top:0,right:0,bottom:0});
});

test('kenburns: setCropKey seeds the static crop, clearCropKeys resets',()=>{
 const clips=[img('a',{crop:{left:0.05,top:0,right:0,bottom:0}})];
 const keyed=setCropKey(clips,'a',2,{left:0.2,top:0.2,right:0.2,bottom:0.2});
 assert.deepEqual(keyed[0].cropKeys?.map(k=>k.t),[0,2]);
 assert.deepEqual(keyed[0].cropKeys?.[0].v,{left:0.05,top:0,right:0,bottom:0},'seed holds the static crop');
 assert.equal('cropKeys' in clearCropKeys(keyed,'a')[0],false);
 assert.equal('cropKeys' in setCropKeys(keyed,'a',undefined)[0],false);
});

test('kenburns: split re-bases both halves on the cut value',()=>{
 const clips=[img('a',{cropKeys:kenBurnsPreset(4)}),img('b')];
 const out=splitAt(clips,2)!;
 assert.equal(out.length,3);
 assert.ok(Math.abs(cropAt(out[0],2).left-cropAt(clips[0],2).left)<1e-9,'left half ends at the cut value');
 assert.deepEqual(out[1].cropKeys?.[0].v,cropAt(clips[0],2),'right half starts at the cut value');
 assert.ok(out[1].cropKeys!.every(k=>k.t>=0));
});

test('kenburns: signature notices keys and the project round-trips them',()=>{
 const a=[img('a')];
 const keyed=setCropKeys(a,'a',kenBurnsPreset(4));
 assert.notEqual(clipsSignature(keyed),clipsSignature(a));
 const text=serializeVideoProject(keyed,[],'webm');
 assert.match(text,/"cropKeys"/);
 const parsed=parseVideoProject(text);
 assert.equal(parsed.clips[0].cropKeys?.length,2);
 assert.ok(hasCrop({...parsed.clips[0],crop:cropAt(parsed.clips[0],4)})||isImageClip(parsed.clips[0]));
});
