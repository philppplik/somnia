import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyCrossfade,emptyArrangement,findCrossfadePair,newClip,newTrack} from './arrangement';
import {renderArrangement} from './mix';

const source={id:'src',name:'tone.wav',frames:96000,sampleRate:48000,channels:2 as const};
function session(){const s=emptyArrangement();s.sources.push(source);const a={...newClip('a',source,0),length:9600},b={...newClip('b',source,7200),length:9600};s.tracks.push({...newTrack('t','T'),clips:[a,b]});return s;}
const decoded={id:'src',sampleRate:48000,channels:[new Float32Array(96000).fill(1),new Float32Array(96000).fill(1)]};

test('crossfade: pair detection requires a staggered overlap, not containment or touch',()=>{
 const s=session();
 const pair=findCrossfadePair(s,'a');
 assert.ok(pair&&pair.earlier.id==='a'&&pair.later.id==='b');
 assert.equal(pair!.overlap,2400);
 assert.equal(findCrossfadePair(s,'b')!.overlap,2400,'direction does not matter');
 const inner=session();inner.tracks[0].clips[1].start=480;inner.tracks[0].clips[1].length=480;
 assert.equal(findCrossfadePair(inner,'a'),null,'containment has no crossfade region');
 const touching=session();touching.tracks[0].clips[1].start=9600;
 assert.equal(findCrossfadePair(touching,'a'),null,'touching clips do not overlap');
 const separate=session();separate.tracks[0].clips[1].start=48000;
 assert.equal(findCrossfadePair(separate,'a'),null);
 assert.throws(()=>applyCrossfade(separate,'a'),/staggered overlap/);
});

test('crossfade: complementary equal-power fades cover exactly the overlap and the mix stays steady',()=>{
 const s=session();applyCrossfade(s,'a');
 const [a,b]=s.tracks[0].clips;
 assert.equal(a.fadeOut,2400);assert.equal(a.fadeShape,'equalPower');
 assert.equal(b.fadeIn,2400);assert.equal(b.fadeShape,'equalPower');
 const m=renderArrangement(s,[decoded]);
 const mid=7200+1200;
 assert.ok(Math.abs(m.channels[0][mid]-Math.SQRT2)<0.02,'mid-overlap sums the two -3 dB sides');
 assert.ok(Math.abs(m.channels[0][7199]-1)<0.02,'before the overlap only the first clip plays');
 assert.ok(Math.abs(m.channels[0][9600]-1)<0.02,'after the overlap only the second clip plays');
});

test('crossfade: the command is atomic and undoable',async()=>{
 const {registerArrangeCommands}=await import('./arrangeCommands');
 const {commandDispatcher}=await import('../commandDispatcher');
 const {getArrangementState,resetArrangement,loadArrangement}=await import('./arrangeStore');
 const {serializeArrangement}=await import('./arrangement');
 resetArrangement();const off=registerArrangeCommands();
 try{
  loadArrangement(serializeArrangement(session()));
  await commandDispatcher.runCommand('sound.arrange.clip.crossfade',{id:'a'});
  assert.equal(getArrangementState().document.tracks[0].clips[0].fadeShape,'equalPower');
  await assert.rejects(commandDispatcher.runCommand('sound.arrange.clip.crossfade',{id:'missing'}));
  await commandDispatcher.runCommand('sound.arrange.undo');
  assert.equal(getArrangementState().document.tracks[0].clips[0].fadeOut,0,'undo restores the plain fades');
 }finally{off();resetArrangement();}
});
