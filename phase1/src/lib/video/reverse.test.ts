import test from 'node:test';
import assert from 'node:assert/strict';
import {blendAt,clipSourceTime,isNeutralTimeline,isReversed,locate,sanitizeClips,setReversed,speedOf,type TimelineClip} from './timeline';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';
import {newTitleClip} from './titles';

const clip=(id:string,extra:Partial<TimelineClip>={}):TimelineClip=>({id,source:'v',in_s:1,out_s:5,gain:1,muted:false,...extra});

test('reverse: isReversed only for real media clips',()=>{
 assert.equal(isReversed(clip('a')),false);
 assert.equal(isReversed(clip('a',{reversed:true})),true);
 assert.equal(isReversed({...newTitleClip({},3),reversed:true}),false);
 assert.equal(isReversed({id:'i',kind:'image',source:'x',in_s:0,out_s:3,gain:1,muted:false,reversed:true}),false);
 assert.equal(isReversed(clip('a',{reversed:true,freeze:2})),false);
});

test('reverse: source time walks backwards over the trimmed range',()=>{
 const c=clip('a',{reversed:true});
 assert.ok(Math.abs(clipSourceTime(c,0)-5)<2e-3,'starts at out_s (minus epsilon)');
 assert.ok(Math.abs(clipSourceTime(c,2)-3)<2e-3,'midpoint');
 assert.equal(clipSourceTime(c,4),1,'ends at in_s');
 assert.equal(clipSourceTime(c,99),1,'clamps at in_s');
 // Speed composes: 2x reversed covers the source range twice as fast.
 const fast=clip('a',{reversed:true,speed:2});
 assert.ok(Math.abs(clipSourceTime(fast,1)-3)<2e-3);
 // Forward clips are untouched.
 assert.equal(clipSourceTime(clip('b'),2),3);
});

test('reverse: locate and blendAt expose the reversed source time',()=>{
 const clips=[clip('a',{reversed:true})];
 assert.ok(Math.abs(locate(clips,1)!.sourceTime-4)<2e-3);
 assert.ok(Math.abs(blendAt(clips,3)![0].sourceTime-2)<2e-3);
});

test('reverse: sanitize keeps it on media clips and strips it elsewhere',()=>{
 const d={v:10};
 assert.equal(sanitizeClips([clip('a',{reversed:true})],d)[0].reversed,true);
 assert.equal('reversed' in sanitizeClips([clip('a')],d)[0],false);
 assert.equal('reversed' in sanitizeClips([{...newTitleClip({},3),reversed:true}],d)[0],false);
 assert.equal('reversed' in sanitizeClips([{id:'i',kind:'image',source:'x',in_s:0,out_s:3,gain:1,muted:false,reversed:true}],d)[0],false);
 assert.equal('reversed' in sanitizeClips([clip('a',{reversed:true,freeze:2})],d)[0],false);
});

test('reverse: setReversed toggles, signature notices, neutral check notices',()=>{
 const clips=[clip('a')];
 const rev=setReversed(clips,'a',true);
 assert.equal(rev[0].reversed,true);
 assert.equal('reversed' in setReversed(rev,'a',false)[0],false);
 assert.notEqual(clipsSignature(rev),clipsSignature(clips));
 const full:TimelineClip={id:'x',source:'v',in_s:0,out_s:10,gain:1,muted:false};
 assert.equal(isNeutralTimeline([full],'v',10),true);
 assert.equal(isNeutralTimeline(setReversed([full],'x',true),'v',10),false);
});

test('reverse: project roundtrip preserves the flag',()=>{
 const clips=[setReversed([clip('a')],'a',true)[0],clip('b')];
 const text=serializeVideoProject(clips,[],'webm');
 assert.match(text,/"reversed": true/);
 const parsed=parseVideoProject(text);
 assert.equal(parsed.clips[0].reversed,true);
 assert.equal('reversed' in parsed.clips[1],false);
 assert.ok(speedOf(parsed.clips[0])===1);
});
