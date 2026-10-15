import test from 'node:test';
import assert from 'node:assert/strict';
import {audioClipDuration,audioEnvelope,audioTrackEnd,fullAudioClip,moveAudioClip,removeAudioClip,sanitizeAudioClips,setAudioClipEdge,setAudioClipFades,setAudioClipGain,type AudioClip} from './audioTrack';
const clip=(id:string,over:Partial<AudioClip>={}):AudioClip=>({id,source:'song.mp3',in_s:0,out_s:10,at:0,gain:1,fadeIn:0,fadeOut:0,...over});

test('free placement: gaps and overlaps are legal, the track end is the last clip end',()=>{
 const clips=[clip('a',{at:5}),clip('b',{at:7,out_s:20})];
 assert.equal(audioClipDuration(clips[0]),10);
 assert.equal(audioTrackEnd(clips),27);
 assert.equal(audioTrackEnd([]),0);
});

test('sanitize clamps to source bounds, drops degenerate clips and caps fades',()=>{
 const dirty=[
  clip('a',{in_s:-3,out_s:99,fadeIn:50,fadeOut:50,gain:9,at:-2}),
  clip('b',{in_s:9.99,out_s:10}),
  clip('c',{in_s:12,out_s:20}), // starts past the source end
  clip('d',{source:'gone.mp3',in_s:0,out_s:5}), // unknown source keeps its clip
 ];
 const clean=sanitizeAudioClips(dirty,{'song.mp3':10});
 assert.equal(clean.length,2);
 assert.deepEqual([clean[0].in_s,clean[0].out_s,clean[0].gain,clean[0].at],[0,10,2,0]);
 assert.equal(clean[0].fadeIn+clean[0].fadeOut,10,'fades share the clip length');
 assert.equal(clean[1].source,'gone.mp3');
 assert.equal(sanitizeAudioClips([clip('x',{out_s:0.01})],{}).length,0,'below the minimum drops');
});

test('the envelope is equal-power at the edges and gain-scaled',()=>{
 const c=clip('a',{fadeIn:2,fadeOut:2,gain:0.5});
 assert.ok(Math.abs(audioEnvelope(c,0))<1e-9);
 assert.ok(Math.abs(audioEnvelope(c,2)-0.5)<1e-9,'fade-in completes');
 assert.ok(Math.abs(audioEnvelope(c,1)-0.5*Math.sin(Math.PI/4))<1e-9);
 assert.ok(Math.abs(audioEnvelope(c,9)-0.5*Math.cos(Math.PI/4))<1e-9);
 assert.ok(Math.abs(audioEnvelope(c,10))<1e-9);
 assert.equal(audioEnvelope(clip('b'),1),1,'no fades, unity gain: flat 1');
});

test('edits: remove, move clamps at 0, edges hold the minimum, gain and fades set',()=>{
 const clips=[clip('a'),clip('b',{at:4})];
 assert.deepEqual(removeAudioClip(clips,'a').map(c=>c.id),['b']);
 assert.equal(moveAudioClip(clips,'a',-5)[0].at,0);
 const edged=setAudioClipEdge(clips,'a','in',9.999);
 assert.equal(edged[0].in_s,9.95,'in never crosses out minus the minimum');
 assert.equal(setAudioClipEdge(clips,'a','out',0.01)[0].out_s,0.05);
 assert.equal(setAudioClipGain(clips,'a',1.5)[0].gain,1.5);
 assert.deepEqual(setAudioClipFades(clips,'a',1,2)[0].fadeOut,2);
});
