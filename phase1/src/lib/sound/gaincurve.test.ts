import {test} from 'node:test';import assert from 'node:assert/strict';
import {ARRANGE_LIMITS,emptyArrangement,gainCurveAt,newClip,newTrack,parseArrangement,serializeArrangement,splitArrangeClip,validateArrangement,ArrangementHistory} from './arrangement';
import {renderArrangement} from './mix';
import {registerArrangeCommands} from './arrangeCommands';import {commandDispatcher} from '../commandDispatcher';
import {getArrangementState,resetArrangement,editArrangement} from './arrangeStore';

function fixture(){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('track','Voice'),clips:[newClip('clip',source)]});return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(1),new Float32Array(480).fill(1)]}];

test('gaincurve: interpolation is linear in dB, constant outside the outermost points',()=>{
 const clip={...newClip('c',{id:'src',name:'t',frames:480,sampleRate:48000,channels:2}),gainCurve:[{at:100,db:0},{at:300,db:-12}]};
 assert.equal(gainCurveAt(clip,0),0,'before the first point the first value holds');
 assert.equal(gainCurveAt(clip,100),0);
 assert.ok(Math.abs(gainCurveAt(clip,200)+6)<1e-9,'midpoint is half the dB');
 assert.equal(gainCurveAt(clip,400),-12,'after the last point the last value holds');
 assert.equal(gainCurveAt({...clip,gainCurve:[]},150),0,'no points are neutral');
});

test('gaincurve: the mix applies the automated level per frame',()=>{
 const s=fixture();s.tracks[0].clips[0].gainCurve=[{at:0,db:0},{at:480,db:-12}];
 const plain=renderArrangement(fixture(),sources());
 const auto=renderArrangement(s,sources());
 assert.equal(plain.channels[0][10],1);
 assert.equal(auto.channels[0][0],1,'frame 0 is untouched (0 dB point)');
 assert.ok(Math.abs(auto.channels[0][240]-10**(-6/20))<1e-5,'midpoint is about -6 dB');
 assert.ok(Math.abs(auto.channels[0][470]-10**(-11.75/20))<1e-5,'frame 470 sits on the ramp at -11.75 dB');
});

test('gaincurve: validation bounds points, sorts them and rejects duplicates',()=>{
 const s=fixture();const clip=s.tracks[0].clips[0];
 clip.gainCurve=[{at:300,db:-3},{at:100,db:0}];
 assert.deepEqual(validateArrangement(s).tracks[0].clips[0].gainCurve.map(p=>p.at),[100,300],'sorted on validation');
 clip.gainCurve=[{at:100,db:0},{at:100,db:-3}];
 assert.throws(()=>validateArrangement(s),'duplicate point rejected');
 clip.gainCurve=Array.from({length:ARRANGE_LIMITS.gainPoints+1},(_,i)=>({at:i,db:0}));
 assert.throws(()=>validateArrangement(s),'point limit enforced');
 clip.gainCurve=[{at:481,db:0}];
 assert.throws(()=>validateArrangement(s),'point past the clip end rejected');
 clip.gainCurve=[{at:100,db:-61}];
 assert.throws(()=>validateArrangement(s),'dB range enforced');
});

test('gaincurve: v3 migrates neutrally and the session round-trips the curve',()=>{
 const s=fixture();s.tracks[0].clips[0].gainCurve=[{at:10,db:-6}];
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s);
 const v3=JSON.parse(serializeArrangement(s));v3.version=3;delete (v3 as Record<string,unknown>).bpm;for(const t of v3.tracks)for(const c of t.clips)delete c.gainCurve;
 const migrated=validateArrangement(v3);
 assert.equal(migrated.version,9);
 assert.deepEqual(migrated.tracks[0].clips[0].gainCurve,[],'migration adds a neutral curve');
});

test('gaincurve: split re-bases both halves on the interpolated cut value',()=>{
 const s=fixture();s.tracks[0].clips[0].gainCurve=[{at:0,db:0},{at:480,db:-12}];
 splitArrangeClip(s,'clip',240,'right');
 const [left,right]=s.tracks[0].clips;
 assert.ok(Math.abs(gainCurveAt(left,240)+6)<1e-9,'left ends at the cut level');
 assert.deepEqual(right.gainCurve[0],{at:0,db:gainCurveAt({gainCurve:[{at:0,db:0},{at:480,db:-12}]}as never,240)},'right starts at the cut level');
 assert.ok(right.gainCurve.every(p=>p.at>=0&&p.at<=right.length));
 assert.ok(Math.abs(gainCurveAt(right,right.length)+12)<1e-9,'the ramp continues seamlessly');
});

test('gaincurve: the clip.curve command is atomic and undoable',async()=>{
 resetArrangement();const off=registerArrangeCommands();
 try{
  editArrangement(s=>{const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('track','Voice'),clips:[newClip('clip',source)]});});
  await commandDispatcher.runCommand('sound.arrange.clip.curve',{id:'clip',points:[{at:0,db:0},{at:480,db:-12}]});
  assert.equal(getArrangementState().document.tracks[0].clips[0].gainCurve.length,2);
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.clip.curve',{id:'clip',points:[{at:0,db:-99}]}),'invalid points rejected');
  assert.equal(getArrangementState().document.tracks[0].clips[0].gainCurve.length,2,'rejection preserves the curve');
  await commandDispatcher.runCommand('sound.arrange.undo');
  assert.equal(getArrangementState().document.tracks[0].clips[0].gainCurve.length,0,'undo restores the neutral curve');
 }finally{off();resetArrangement();}
});
