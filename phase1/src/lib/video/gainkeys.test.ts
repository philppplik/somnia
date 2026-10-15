import test from 'node:test';
import assert from 'node:assert/strict';
import {clearGainKeys,gainAt,isFreeze,MAX_GAIN,sanitizeClips,setGainKey,setGainKeys,splitAt,type TimelineClip} from './timeline';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';

const media=(id:string,extra:Partial<TimelineClip>={}):TimelineClip=>({id,source:'m.mp4',in_s:0,out_s:4,gain:1,muted:false,...extra});
const durs:Record<string,number>={'m.mp4':10};

test('gainkeys: valueAt ramps the gain between keys and holds outside',()=>{
 const c=media('a',{gainKeys:[{t:0,v:1},{t:2,v:0.2}]});
 assert.equal(gainAt(c,0),1);
 assert.ok(Math.abs(gainAt(c,1)-0.6)<1e-9,'midpoint is interpolated');
 assert.ok(Math.abs(gainAt(c,2)-0.2)<1e-9);
 assert.ok(Math.abs(gainAt(c,4)-0.2)<1e-9,'after the last key the value holds');
 assert.equal(gainAt(media('a'),2),1,'no keys = static gain');
});

test('gainkeys: sanitize keeps keys on media clips and strips them elsewhere',()=>{
 const keys=[{t:0,v:1},{t:2,v:0.5}];
 assert.equal(sanitizeClips([media('a',{gainKeys:keys})],durs)[0].gainKeys?.length,2);
 assert.equal(sanitizeClips([media('a',{gainKeys:keys,gain:9})],durs)[0].gainKeys?.length,2,'clamped gain keys survive');
 const clamped=sanitizeClips([media('a',{gainKeys:[{t:0,v:1},{t:2,v:99}]})],durs)[0].gainKeys;
 assert.equal(clamped?.[1].v,MAX_GAIN,'values clamp to MAX_GAIN');
 assert.equal(sanitizeClips([media('a',{gainKeys:[{t:0,v:1}]})],durs)[0].gainKeys,undefined,'a single key normalizes to static');
 const title=sanitizeClips([{id:'t',kind:'title' as const,source:'',in_s:0,out_s:3,gain:1,muted:false,gainKeys:keys,title:{text:'x',size:32,color:'#ffffff',background:'#000000'}}],{})[0];
 assert.equal(title.gainKeys,undefined,'title clips drop gain keys');
 const freeze=sanitizeClips([media('f',{freeze:1,gainKeys:keys})],durs)[0];
 assert.ok(isFreeze(freeze));
 assert.equal(freeze.gainKeys,undefined,'freeze clips drop gain keys');
});

test('gainkeys: setGainKey seeds the static gain at t=0, clearGainKeys resets',()=>{
 const clips=[media('a',{gain:0.7})];
 const keyed=setGainKey(clips,'a',2,0.2);
 assert.deepEqual(keyed[0].gainKeys?.map(k=>k.t),[0,2]);
 assert.ok(Math.abs((keyed[0].gainKeys?.[0].v??0)-0.7)<1e-9,'seed holds the static gain');
 assert.ok(Math.abs((keyed[0].gainKeys?.[1].v??0)-0.2)<1e-9);
 assert.ok(setGainKey(keyed,'a',-1,-3)[0].gainKeys?.every(k=>k.t>=0&&k.v>=0&&k.v<=MAX_GAIN));
 assert.equal('gainKeys' in clearGainKeys(keyed,'a')[0],false);
 assert.equal('gainKeys' in setGainKeys(keyed,'a',undefined)[0],false);
});

test('gainkeys: split re-bases both halves on the cut value',()=>{
 const clips=[media('a',{gainKeys:[{t:0,v:1},{t:4,v:0}]}),media('b')];
 const out=splitAt(clips,2)!;
 assert.equal(out.length,3);
 assert.ok(Math.abs(gainAt(out[0],2)-0.5)<1e-9,'left half ends at the cut value');
 assert.ok(Math.abs((out[1].gainKeys?.[0].v??0)-0.5)<1e-9,'right half starts at the cut value');
 assert.ok(out[1].gainKeys!.every(k=>k.t>=0));
 assert.ok(Math.abs(gainAt(out[1],2)-0)<1e-9,'right half keeps the tail of the ramp');
});

test('gainkeys: signature notices keys and the project round-trips them',()=>{
 const a=[media('a')];
 const keyed=setGainKey(a,'a',1,0.4);
 assert.notEqual(clipsSignature(keyed),clipsSignature(a));
 const text=serializeVideoProject(keyed,[],'webm');
 assert.match(text,/"gainKeys"/);
 const parsed=parseVideoProject(text);
 assert.equal(parsed.clips[0].gainKeys?.length,2);
 assert.ok(Math.abs(gainAt(parsed.clips[0],0)-1)<1e-9);
});
