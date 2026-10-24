import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hasPicFade,picFadeLevel,picFadeOf} from './picFade';
import {fullClip,sanitizeClips} from './timeline';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';

test('picFadeOf clamps, rounds and shrinks both sides to fit the clip',()=>{
 assert.deepEqual(picFadeOf(undefined,10),{in:0,out:0});
 assert.deepEqual(picFadeOf({picFadeIn:2.0004,picFadeOut:1},10),{in:2,out:1});
 assert.deepEqual(picFadeOf({picFadeIn:6,picFadeOut:6},6),{in:3,out:3});
 assert.deepEqual(picFadeOf({picFadeIn:99},200),{in:30,out:0});
 assert.equal(hasPicFade({picFadeIn:0,picFadeOut:0}),false);
 assert.equal(hasPicFade({picFadeOut:0.5}),true);
});
test('level ramps linearly from black in, to black out, and is 1 in between',()=>{
 const f={in:2,out:2};
 assert.equal(picFadeLevel(f,10,0),0);
 assert.equal(picFadeLevel(f,10,1),0.5);
 assert.equal(picFadeLevel(f,10,5),1);
 assert.equal(picFadeLevel(f,10,9),0.5);
 assert.equal(picFadeLevel(f,10,10),0);
 assert.equal(picFadeLevel({in:0,out:0},10,0),1);
});
test('sanitize keeps fades, shrinks them to the clip, drops zeros; titles carry none',()=>{
 const c={...fullClip('a.mp4',4),picFadeIn:3,picFadeOut:3};
 const z={...fullClip('a.mp4',4),picFadeIn:0,picFadeOut:0};
 const [x,y]=sanitizeClips([c,z],{'a.mp4':4});
 assert.equal(x.picFadeIn,2);assert.equal(x.picFadeOut,2);
 assert.equal('picFadeIn' in y,false);assert.equal('picFadeOut' in y,false);
});
test('picture fades survive save and load and change the dirty signature',()=>{
 const c={...fullClip('a.mp4',10),picFadeIn:1.5,picFadeOut:0.5};
 const back=parseVideoProject(serializeVideoProject([c],[],'webm'));
 assert.equal(back.clips[0].picFadeIn,1.5);assert.equal(back.clips[0].picFadeOut,0.5);
 assert.notEqual(clipsSignature([c]),clipsSignature([{...c,picFadeIn:undefined}]));
 const plain=parseVideoProject(serializeVideoProject([fullClip('a.mp4',10)],[],'webm'));
 assert.equal('picFadeIn' in plain.clips[0],false);
});
