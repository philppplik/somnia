import test from 'node:test';
import assert from 'node:assert/strict';
import {blendAt,clipDuration,clipRanges,isNeutralTimeline,locate,sanitizeClips,setClipSpeed,speedOf,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {newTitleClip} from './titles';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';
const clip=(id:string,in_s:number,out_s:number,speed?:number):TimelineClip=>({id,source:'s.mp4',in_s,out_s,gain:1,muted:false,speed});

test('speedOf clamps to 0.25-4 and defaults to 1',()=>{
 assert.equal(speedOf(clip('a',0,4)),1);
 assert.equal(speedOf(clip('a',0,4,2)),2);
 assert.equal(speedOf(clip('a',0,4,99)),4);
 assert.equal(speedOf(clip('a',0,4,0.01)),0.25);
 assert.equal(speedOf(clip('a',0,4,NaN)),1);
 assert.equal(speedOf(newTitleClip()),1,'title cards have no speed');
});

test('clip duration and ranges use timeline seconds (source / speed)',()=>{
 const clips=[clip('a',0,4,2),clip('b',1,5)];
 assert.equal(clipDuration(clips[0]),2);
 assert.deepEqual(clipRanges(clips).map(r=>[r.start,r.end]),[[0,2],[2,6]]);
 assert.equal(timelineDuration(clips),6);
});

test('locate and blendAt map timeline time to source time through speed',()=>{
 const clips=[clip('a',10,14,2)];
 assert.equal(locate(clips,1)?.sourceTime,12,'1 timeline second at 2x = 2 source seconds');
 assert.equal(locate(clips,99)?.sourceTime,14,'past the end lands on the out point');
 const blend=blendAt(clips,0.5);
 assert.equal(blend[0].sourceTime,11);
 const slow=[clip('a',0,4,0.5)];
 assert.equal(locate(slow,2)?.sourceTime,1,'0.5x stretches one source second over two timeline seconds');
});

test('split keeps speed on both halves, sanitize clamps speed, neutral requires 1x',()=>{
 const halves=splitAt([clip('a',0,4,2)],1)!;
 assert.equal(halves.length,2);
 assert.equal(halves[0].speed,2);assert.equal(halves[1].speed,2);
 const clean=sanitizeClips([clip('a',0,4,16)],{'s.mp4':10});
 assert.equal(clean[0].speed,4,'sanitize normalizes the stored speed');
 assert.ok(isNeutralTimeline([clip('a',0,10)],'s.mp4',10));
 assert.ok(!isNeutralTimeline([clip('a',0,10,1.5)],'s.mp4',10));
});

test('setClipSpeed sets media clips only and clamps',()=>{
 const title=newTitleClip({text:'x'});
 const out=setClipSpeed([clip('a',0,4),title],'a',8);
 assert.equal(out[0].speed,4);
 assert.equal(out[1].speed,undefined,'title untouched');
 assert.ok(setClipSpeed([clip('a',0,4)],'nope',2)[0].speed===undefined);
});

test('speed survives the .video-project round trip; old files default to 1',()=>{
 const clips=[clip('a',0,4,2.5)];
 const parsed=parseVideoProject(serializeVideoProject(clips,'webm'));
 assert.equal(parsed.clips[0].speed,2.5);
 const legacy=JSON.stringify({app:'somnia-video',version:1,clips:[{id:'a',kind:'media',source:'s.mp4',in_s:0,out_s:4,gain:1,muted:false}]});
 assert.equal(parseVideoProject(legacy).clips[0].speed,1,'V3 files without speed load at 1x');
 assert.notEqual(clipsSignature([clip('a',0,4,2)]),clipsSignature([clip('a',0,4)]),'speed is part of the dirty signature');
});

test('crossfade clamps against speed-adjusted durations',()=>{
 const clips=[{...clip('a',0,4,4),crossfade_s:1.5},clip('b',0,10)];
 const clean=sanitizeClips(clips,{'s.mp4':10});
 assert.equal(clean[0].crossfade_s,1,'clip a occupies 1 timeline second at 4x, so its fade caps at 1');
});
