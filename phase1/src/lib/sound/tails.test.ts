import {test} from 'node:test';import assert from 'node:assert/strict';
import {ARRANGE_LIMITS,arrangementEnd,emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,validateArrangement} from './arrangement';
import {renderRackedArrangement} from './rackRender';import {renderArrangement} from './mix';
import {registerArrangeCommands} from './arrangeCommands';import {commandDispatcher} from '../commandDispatcher';
import {getArrangementState,resetArrangement} from './arrangeStore';

function fixture(tailFrames=0){const s=emptyArrangement();const source={id:'src',name:'tone.wav',frames:480,sampleRate:48000,channels:2 as const};s.sources.push(source);s.tracks.push({...newTrack('track','Voice'),clips:[newClip('clip',source)]});s.tailFrames=tailFrames;return s;}
const sources=()=>[{id:'src',sampleRate:48000,channels:[new Float32Array(480).fill(0.2),new Float32Array(480).fill(0.1)]}];
const full=(channels:[Float32Array,Float32Array]):[Float32Array,Float32Array]=>[new Float32Array(channels[0].length).fill(0.5),new Float32Array(channels[1].length).fill(0.5)];

test('tails: v2 and v1 sessions migrate neutrally to v3 with a zero tail',()=>{
 const s=fixture();
 const v2:any=JSON.parse(serializeArrangement(s));v2.version=2;delete v2.tailFrames;delete v2.bpm;
 assert.deepEqual(validateArrangement(v2),s,'v2 gains a neutral tail and nothing else');
 const v1:any=JSON.parse(serializeArrangement(s));v1.version=1;delete v1.tailFrames;delete v1.bpm;delete v1.masterRack;for(const t of v1.tracks){delete t.rack;delete t.gainCurve;delete t.panCurve;}
 assert.deepEqual(validateArrangement(v1),s,'v1 gains racks and a neutral tail');
 assert.deepEqual(parseArrangement(serializeArrangement(s)),s,'v3 round-trip');
});

test('tails: validation bounds the tail and stays strict',()=>{
 const s=fixture();
 for(const bad of [48000*ARRANGE_LIMITS.tailSeconds+1,-1,1.5,Number.NaN])assert.throws(()=>validateArrangement({...s,tailFrames:bad}),`tail ${bad} rejected`);
 assert.equal(validateArrangement({...s,tailFrames:48000*ARRANGE_LIMITS.tailSeconds}).tailFrames,48000*ARRANGE_LIMITS.tailSeconds);
 assert.throws(()=>validateArrangement({...s,sessionTail:48000}),'unknown field still rejected');
});

test('tails: render extends past the last clip and racks can ring into the silence',()=>{
 const s=fixture(480);
 assert.equal(arrangementEnd(s),480);
 const m=renderRackedArrangement(s,sources(),full);
 assert.equal(m.channels[0].length,960,'output is session plus tail');
 assert.equal(m.channels[0][959],0.5,'the processor reached into the tail region');
 const neutral=renderRackedArrangement(s,sources(),ch=>ch);
 assert.equal(neutral.channels[0].length,960);
 assert.equal(neutral.channels[0][959],0,'without active DSP the tail is silence');
 assert.ok(Math.abs(neutral.channels[0][0]-0.2)<1e-6,'session audio is unchanged');
});

test('tails: guards still hold and the dry mixer keeps the session boundary',()=>{
 const s=fixture(480);
 assert.throws(()=>renderRackedArrangement(s,sources(),ch=>[ch[0].slice(0,10),ch[1].slice(0,10)]),'length-changing rack rejected');
 const empty=emptyArrangement();empty.tailFrames=4800;
 assert.throws(()=>renderRackedArrangement(empty,[],ch=>ch),'a tail does not rescue an empty session');
 const dry=renderArrangement(fixture(480),sources());
 assert.equal(dry.channels[0].length,480,'dry mix ends at the session boundary');
});

test('tails: the session.tail command is bounded, atomic and undoable',async()=>{
 resetArrangement();const off=registerArrangeCommands();
 try{
  await commandDispatcher.runCommand('sound.arrange.session.tail',{seconds:2});
  assert.equal(getArrangementState().document.tailFrames,96000);
  await commandDispatcher.runCommand('sound.arrange.session.tail',{seconds:99});
  assert.equal(getArrangementState().document.tailFrames,48000*ARRANGE_LIMITS.tailSeconds,'clamped to the bound');
  await commandDispatcher.runCommand('sound.arrange.session.tail',{seconds:-5});
  assert.equal(getArrangementState().document.tailFrames,0,'negative clamps to zero');
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.session.tail',{}),'missing payload rejected');
  await commandDispatcher.runCommand('sound.arrange.undo');
  assert.equal(getArrangementState().document.tailFrames,48000*ARRANGE_LIMITS.tailSeconds,'undo restores the previous value');
 }finally{off();resetArrangement();}
});
