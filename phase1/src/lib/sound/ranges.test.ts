import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyArrangement,newClip,newTrack} from './arrangement';
import {renderRackedArrangement} from './rackRender';
import {registerArrangeCommands} from './arrangeCommands';import {commandDispatcher} from '../commandDispatcher';
import {getArrangementState,resetArrangement,setRangeSelection,previewMaster} from './arrangeStore';

function fixture(tailFrames=0){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('track','Voice'),clips:[newClip('clip',source)]});s.tailFrames=tailFrames;return s;}
const sources=()=>{const l=new Float32Array(480),r=new Float32Array(480);for(let i=0;i<480;i++){l[i]=i/480;r[i]=0.5;}return[{id:'src',sampleRate:48000,channels:[l,r]}];};

test('ranges: a range render is exactly the requested frames of the same mix',()=>{
 const full=renderRackedArrangement(fixture(),sources(),ch=>ch);
 const part=renderRackedArrangement(fixture(),sources(),ch=>ch,false,{start:96,end:288});
 assert.equal(part.channels[0].length,192);
 assert.equal(part.channels[1].length,192);
 for(let i=0;i<192;i++)assert.equal(part.channels[0][i],full.channels[0][i+96],'slice of the identical mix');
});

test('ranges: ranges never get the effect tail; full renders keep it',()=>{
 const part=renderRackedArrangement(fixture(480),sources(),ch=>ch,false,{start:0,end:480});
 assert.equal(part.channels[0].length,480,'range output is exactly the range');
 assert.equal(renderRackedArrangement(fixture(480),sources(),ch=>ch).channels[0].length,960,'full render still appends the tail');
 for(const bad of [{start:200,end:100},{start:-1,end:100},{start:0,end:481},{start:0,end:480.5}])assert.throws(()=>renderRackedArrangement(fixture(),sources(),ch=>ch,false,bad as {start:number;end:number}),`range ${JSON.stringify(bad)} rejected`);
});

test('ranges: selection is a bounded view choice, not session history',async()=>{
 resetArrangement();const off=registerArrangeCommands();
 try{
  await commandDispatcher.runCommand('sound.arrange.track.add');
  const revision=getArrangementState().revision;
  assert.throws(()=>setRangeSelection({start:0,end:100}),'range outside the empty session rejected');
  assert.equal(getArrangementState().revision,revision,'rejected selection changes nothing');
  setRangeSelection(null);
  assert.equal(getArrangementState().rangeSelection,null);
  assert.equal(getArrangementState().revision,revision,'selection is not undoable session history');
  await assert.rejects(previewMaster({lufs:-16,ceilingDb:-1,limit:false}),'mastering without a render is rejected');
 }finally{off();resetArrangement();}
});

test('ranges: the session.range command sets, validates and clears the selection',async()=>{
 resetArrangement();const off=registerArrangeCommands();
 try{
  const {editArrangement,newTrack:nT,newClip:nC}={editArrangement:(await import('./arrangeStore')).editArrangement,newTrack,newClip};
  editArrangement(s=>{const source={id:'src',name:'tone.wav',frames:48000,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...nT('track','Voice'),clips:[nC('clip',source)]});});
  await commandDispatcher.runCommand('sound.arrange.session.range',{start:4800,end:9600});
  assert.deepEqual(getArrangementState().rangeSelection,{start:4800,end:9600});
  await assert.rejects(previewMaster({lufs:-16,ceilingDb:-1,limit:false}),/full session/,'mastering is blocked while a range is selected');
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.range',{start:9600,end:4800}),'inverted range rejected');
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.range',{start:0,end:99999}),'range past the session end rejected');
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.range',{}),'missing bounds rejected');
  assert.deepEqual(getArrangementState().rangeSelection,{start:4800,end:9600},'rejections preserve the selection');
  await commandDispatcher.runCommand('sound.arrange.session.range',{clear:true});
  assert.equal(getArrangementState().rangeSelection,null);
 }finally{off();resetArrangement();}
});

import {loopToggle} from './arrangement';
test('ranges: the loop toggle follows the range selection or the whole session',()=>{
 assert.deepEqual(loopToggle(null,{start:4800,end:9600},48000),{start:4800,end:9600},'a selected range becomes the loop');
 assert.deepEqual(loopToggle(null,null,48000),{start:0,end:48000},'no range loops the whole session');
 assert.equal(loopToggle({start:0,end:100},{start:4800,end:9600},48000),null,'an active loop toggles off');
 assert.equal(loopToggle(null,null,0),null,'an empty session cannot loop');
});
