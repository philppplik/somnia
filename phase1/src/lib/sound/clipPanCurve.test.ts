import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,splitArrangeClip,trimEndPatch,trimStartPatch,validateArrangement} from './arrangement';
import {renderArrangement} from './mix';

const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};
function fixture(){const s=emptyArrangement();s.sources.push(source);s.tracks.push({...newTrack('t','Voice'),clips:[newClip('c',source)]});return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.5),new Float32Array(480).fill(0.5)]}];

test('v13: clips carry a pan curve, v12 migrates with an empty one, validation enforces bounds',()=>{
 const s=fixture();s.tracks[0].clips[0].panCurve=[{at:0,pan:-1},{at:480,pan:1}];
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'round-trip preserves the clip pan curve');
 const v12=JSON.parse(serializeArrangement(s));v12.version=12;for(const t of v12.tracks)for(const c of t.clips)delete c.panCurve;
 const migrated=validateArrangement(v12);assert.equal(migrated.version,13);assert.deepEqual(migrated.tracks[0].clips[0].panCurve,[]);
 const dup=fixture();dup.tracks[0].clips[0].panCurve=[{at:100,pan:0},{at:100,pan:0.5}];
 assert.throws(()=>validateArrangement(dup),/duplicate automation point/);
 const wide=fixture();wide.tracks[0].clips[0].panCurve=[{at:100,pan:2}];
 assert.throws(()=>validateArrangement(wide));
});

test('clip pan automation pans per sample, stereo balance and mono equal-power',()=>{
 const s=fixture();s.tracks[0].clips[0].panCurve=[{at:0,pan:-1},{at:480,pan:1}];
 const m=renderArrangement(s,sources());
 assert.ok(Math.abs(m.channels[0][0]-0.5*1)<1e-6&&Math.abs(m.channels[1][0]-0.5*0)<1e-6,'starts hard left');
 assert.ok(Math.abs(m.channels[0][240]-0.5)<1e-5&&Math.abs(m.channels[1][240]-0.5)<1e-5,'crosses the centre');
 const pEnd=-1+2*479/480,lEnd=Math.min(1,1-pEnd),rEnd=Math.min(1,1+pEnd);assert.ok(Math.abs(m.channels[0][479]-0.5*lEnd)<1e-6&&Math.abs(m.channels[1][479]-0.5*rEnd)<1e-6,'ends nearly hard right, interpolated at the last frame');
 const mono=fixture();mono.tracks[0].clips[0].panCurve=[{at:0,pan:-1},{at:480,pan:1}];mono.sources[0]={...source,channels:1};
 const monoSources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.5)]}];
 const mm=renderArrangement(mono,monoSources());
 assert.ok(Math.abs(mm.channels[0][0]-0.5*Math.cos(0))<1e-6&&Math.abs(mm.channels[1][0]-0.5*Math.sin(0))<1e-6,'mono starts hard left, equal power');
 assert.ok(Math.abs(mm.channels[0][240]-0.5*Math.cos(Math.PI/4))<1e-5,'mono centre keeps equal power');
});

test('trim and split re-base the clip pan curve like the gain curve',()=>{
 const s=fixture();s.tracks[0].clips[0].panCurve=[{at:120,pan:-0.5},{at:360,pan:0.5}];
 const patch=trimStartPatch(s.tracks[0].clips[0],120);
 assert.deepEqual(patch.panCurve,[{at:0,pan:-0.5},{at:240,pan:0.5}],'trim start re-bases the pan curve');
 const end=trimEndPatch(s.tracks[0].clips[0],240);
 assert.deepEqual(end.panCurve,[{at:120,pan:-0.5},{at:240,pan:0}],'trim end ends on the interpolated pan');
 const t=fixture();t.tracks[0].clips[0].panCurve=[{at:120,pan:-0.5},{at:360,pan:0.5}];splitArrangeClip(t,'c',240,'right');
 assert.deepEqual(t.tracks[0].clips.find(c=>c.id==='right')!.panCurve,[{at:0,pan:0},{at:120,pan:0.5}],'split right half re-bases with the cut pan at 0');
 assert.deepEqual(t.tracks[0].clips.find(c=>c.id==='c')!.panCurve,[{at:120,pan:-0.5},{at:240,pan:0}],'split left half ends on the cut pan');
});
