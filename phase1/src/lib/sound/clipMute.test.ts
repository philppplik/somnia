import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,validateArrangement} from './arrangement';
import {renderArrangement} from './mix';

const source={id:'src',name:'tone.wav',frames:48000,sampleRate:48000,channels:2 as const};
function session(muted:boolean){const s=emptyArrangement();s.sources.push(source);const clip={...newClip('c1',source,0),length:4800,muted};const track={...newTrack('t','T'),clips:[clip]};s.tracks.push(track);return s;}
const decoded={id:'src',sampleRate:48000,channels:[new Float32Array(48000).fill(0.5),new Float32Array(48000).fill(0.5)]};

test('clip mute: a muted clip contributes nothing, an unmuted one does',()=>{
 assert.equal(renderArrangement(session(true),[decoded]).peak,0);
 assert.ok(renderArrangement(session(false),[decoded]).peak>0);
});

test('clip mute: schema v5 migrates v4 sessions with muted:false and strict v5 clips require the flag',()=>{
 const v4=JSON.parse(JSON.stringify(session(true))) as Record<string,unknown>;
 v4.version=4;delete (v4 as Record<string,unknown>).bpm;
 for(const t of (v4 as {tracks:{clips:Record<string,unknown>[]}[]}).tracks)for(const c of t.clips)delete c.muted;
 const migrated=validateArrangement(v4);
 assert.equal(migrated.version,13);
 assert.equal(migrated.tracks[0].clips[0].muted,false,'v4 clips gain muted:false');
 assert.equal(validateArrangement(migrated).tracks[0].clips[0].muted,false,'v5 re-validation keeps the flag');
 const broken=JSON.parse(JSON.stringify(session(true))) as Record<string,unknown>;
 for(const t of (broken as {tracks:{clips:Record<string,unknown>[]}[]}).tracks)for(const c of t.clips)delete c.muted;
 assert.throws(()=>validateArrangement(broken),/unknown or missing field|clip flags/,'strict v5 rejects clips without muted');
});

test('clip mute: splitting a muted clip keeps both halves muted',async()=>{
 const {splitArrangeClip}=await import('./arrangement');
 const s=session(true);splitArrangeClip(s,'c1',2400,'c2');
 assert.deepEqual(s.tracks[0].clips.map(c=>c.muted),[true,true]);
});
