import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack,validateArrangement} from './arrangement';
import {snapFrame} from './snap';

const source={id:'src',name:'tone.wav',frames:48000,sampleRate:48000,channels:2 as const};
function session(){const s=emptyArrangement();s.sources.push(source);s.tracks.push({...newTrack('t','T'),clips:[{...newClip('c',source,0),length:4800}]});return s;}

test('tempo: schema v8 migrates v7 sessions with 120 bpm and strict v8 requires the field',()=>{
 const v7=JSON.parse(JSON.stringify(session())) as Record<string,unknown>;
 v7.version=7;delete v7.bpm;
 const migrated=validateArrangement(v7);
 assert.equal(migrated.version,12);
 assert.equal(migrated.bpm,120,'v7 sessions gain the neutral 120 bpm');
 const broken=JSON.parse(JSON.stringify(session())) as Record<string,unknown>;
 delete broken.bpm;
 assert.throws(()=>validateArrangement(broken),/unknown or missing field/,'strict v8 rejects sessions without bpm');
});

test('tempo: beat frames follow the bpm and snapping lands on beats',()=>{
 const beat=(bpm:number)=>Math.round(48000*60/bpm);
 assert.equal(beat(120),24000);
 assert.equal(beat(60),48000);
 assert.equal(snapFrame(24100,[],beat(120),200),24000,'a drag lands on the beat');
 assert.equal(snapFrame(30000,[],beat(120),200),24000,'off-grid rounds to the nearest beat');
});

test('tempo: session.setBpm rounds to 0.1 and rejects out-of-range values atomically',async()=>{
 const {registerArrangeCommands}=await import('./arrangeCommands');
 const {commandDispatcher}=await import('../commandDispatcher');
 const {getArrangementState,resetArrangement}=await import('./arrangeStore');
 resetArrangement();const off=registerArrangeCommands();
 try{
  await commandDispatcher.runCommand('sound.arrange.session.setBpm',{bpm:127.34});
  assert.equal(getArrangementState().document.bpm,127.3);
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.setBpm',{bpm:500}));
  assert.equal(getArrangementState().document.bpm,127.3,'rejection preserves the tempo');
  await commandDispatcher.runCommand('sound.arrange.undo');
  assert.equal(getArrangementState().document.bpm,120,'undo restores the default');
 }finally{off();resetArrangement();}
});
