import {test} from 'node:test';import assert from 'node:assert/strict';
import {clipRegionPeak,normalizeGainDb} from './arrangement';

test('normalize: region peak reads only the clip’s used source columns',()=>{
 const peaks=new Float32Array(200);
 for(let c=0;c<100;c++){peaks[c*2]=c<50?-0.5:-1;peaks[c*2+1]=c<50?0.5:1;}
 assert.equal(clipRegionPeak(peaks,0,4800,9600),0.5,'first half peaks at 0.5');
 assert.equal(clipRegionPeak(peaks,4800,4800,9600),1,'second half peaks at 1');
 assert.equal(clipRegionPeak(peaks,0,9600,9600),1,'whole source peaks at 1');
 assert.throws(()=>clipRegionPeak(new Float32Array(0),0,4800,9600),/No waveform peaks/);
 assert.throws(()=>clipRegionPeak(peaks,0,0,9600),/Invalid clip region/);
});

test('normalize: gain math hits the target, clamps at the clip gain range and rejects silence',()=>{
 assert.equal(normalizeGainDb(0.5),6,'0.5 peak needs +6 dB to reach 0 dBFS');
 assert.equal(normalizeGainDb(1),0,'full-scale needs nothing');
 assert.equal(normalizeGainDb(2),-6,'hot signal comes down');
 assert.equal(normalizeGainDb(0.25),12,'clamped at +12 dB');
 assert.equal(normalizeGainDb(8),-18.1,'reduction follows the log law within the -60 dB floor');
 assert.equal(normalizeGainDb(0.5,-3),3,'respects a lower target');
 assert.throws(()=>normalizeGainDb(0),/silent/);
 assert.throws(()=>normalizeGainDb(0.5,20),/Invalid normalize target/);
});

test('normalize: the command fails atomically while peaks are missing',async()=>{
 const {registerArrangeCommands}=await import('./arrangeCommands');
 const {commandDispatcher}=await import('../commandDispatcher');
 const {getArrangementState,resetArrangement,editArrangement}=await import('./arrangeStore');
 const {newClip,newTrack}=await import('./arrangement');
 resetArrangement();const off=registerArrangeCommands();
 try{
  editArrangement(s=>{const source={id:'src',name:'tone.wav',frames:4800,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('t','T'),clips:[{...newClip('c',source,0),length:4800}]});});
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.clip.normalize',{id:'c'}),/peaks/);
  assert.equal(getArrangementState().document.tracks[0].clips[0].gainDb,0,'rejection preserves the gain');
 }finally{off();resetArrangement();}
});
