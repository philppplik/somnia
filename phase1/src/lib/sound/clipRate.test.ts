import {test} from 'node:test';import assert from 'node:assert/strict';
import {clipRegionPeak,emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,splitArrangeClip,trimStartPatch,validateArrangement} from './arrangement';
import {renderArrangement} from './mix';

const source={id:'src',name:'ramp.wav',frames:480,sampleRate:48000,channels:2 as const};
function fixture(rate=1){const s=emptyArrangement();s.sources.push(source);const clip={...newClip('c',source),rate,length:Math.floor(480/rate)};s.tracks.push({...newTrack('t','Voice'),clips:[clip]});return s;}
const ramp=()=>[{id:'src',sampleRate:48000,channels:[Float32Array.from({length:480},(_,i)=>i/480),Float32Array.from({length:480},(_,i)=>i/480)]}];

test('v12: clips carry a rate, v11 migrates with rate 1, round-trip preserves it',()=>{
 const s=fixture(1.5);assert.equal(s.tracks[0].clips[0].rate,1.5);
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'round-trip preserves rate');
 const v11=JSON.parse(serializeArrangement(s));v11.version=11;for(const t of v11.tracks)for(const c of t.clips){delete c.rate;delete c.panCurve;}
 const migrated=validateArrangement(v11);assert.equal(migrated.version,13,'v11 chains through v12 to the current schema');assert.equal(migrated.tracks[0].clips[0].rate,1);
 assert.throws(()=>validateArrangement(fixture(0.1)),/outside|Invalid/,'rate below the floor rejected');
 const tooLong=fixture(2);tooLong.tracks[0].clips[0].length=300;
 assert.throws(()=>validateArrangement(tooLong),/outside/,'rate stretches the source bounds check: 300 frames at 2x need 600 source frames');
});

test('rate: the clip reads the source faster, tape-style',()=>{
 const s=fixture(2);s.tracks[0].clips[0].length=240;
 const m=renderArrangement(s,ramp());
 assert.ok(Math.abs(m.channels[0][0]-0)<1e-7);
 assert.ok(Math.abs(m.channels[0][120]-0.5)<1/480+1e-6,'half-way through the clip is half-way through the source at 2x');
 assert.ok(Math.abs(m.channels[0][239]-(239*2)/480)<1/480+1e-6);
 assert.equal(m.channels[0].length,240,'clip length is timeline frames, rate changes the read speed not the duration');
});

test('trim and split follow the cut at the clip rate',()=>{
 const s=fixture(2);s.tracks[0].clips[0].length=240;
 const patch=trimStartPatch(s.tracks[0].clips[0],120);
 assert.equal(patch.offset,120*2,'trim start advances the offset by cut times rate');
 const t=fixture(2);t.tracks[0].clips[0].length=240;splitArrangeClip(t,'c',120,'right');
 assert.equal(t.tracks[0].clips.find(c=>c.id==='right')!.offset,120*2,'split right half offset follows the rate');
});

test('clipRegionPeak stretches the measured region by rate',()=>{
 const peaks=new Float32Array(800);for(let i=0;i<400;i++){peaks[i*2]=-(i/400);peaks[i*2+1]=i/400;}
 const total=480;
 assert.ok(clipRegionPeak(peaks,0,120,total,2)>clipRegionPeak(peaks,0,120,total,1),'2x reads twice the source region');
});
