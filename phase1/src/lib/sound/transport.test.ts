import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getSoundPlayback,playSound,pauseSound,closeSoundPlayback} from './transport';
import {openSound,setSoundEngineFactory,closeSound,createSoundLifecycleAdapter} from './session';
import {jobScheduler} from '../jobs/scheduler';
import type {SoundEngineLike} from './engine';
class AudioFixture extends EventTarget {
 static all:AudioFixture[]=[];currentTime=0;duration=2;paused=true;src='';preload='';
 constructor(){super();AudioFixture.all.push(this);}
 load(){queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));}
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
 removeAttribute(){this.src='';}
}
test('app-owned audio continues without a mounted workspace and releases real-time lease on pause/close',async()=>{
 const previous=globalThis.Audio;Object.assign(globalThis,{Audio:AudioFixture});
 const engine={init:async()=>[],process:async()=>({wav:new ArrayBuffer(4),peaks:new Float32Array(2),ms:1,report:{input:{duration_s:2},output:{duration_s:2},steps:[]}}),dispose(){}} as unknown as SoundEngineLike;
 setSoundEngineFactory(()=>engine);
 try{
  await openSound({name:'transport.wav',url:'data:audio/wav;base64,AAAA'});
  await playSound('transport.wav');assert.equal(getSoundPlayback('transport.wav').playing,true);
  assert.equal(jobScheduler.hasLease('sound.playback:transport.wav'),true);
  assert.equal(AudioFixture.all[0].paused,false,'no React workspace owns or pauses this element');
  pauseSound('transport.wav');assert.equal(jobScheduler.hasLease('sound.playback:transport.wav'),false);
  await playSound('transport.wav');closeSoundPlayback('transport.wav');
  assert.equal(jobScheduler.hasLease('sound.playback:transport.wav'),false);assert.equal(AudioFixture.all[0].src,'');
 }finally{closeSoundPlayback('transport.wav');closeSound('transport.wav');Object.assign(globalThis,{Audio:previous});}
});
test('lifecycle suspend closes app-owned playback through the registered suspend hook',async()=>{
 const previous=globalThis.Audio;Object.assign(globalThis,{Audio:AudioFixture});
 const engine={init:async()=>[],process:async()=>({wav:new ArrayBuffer(4),peaks:new Float32Array(2),ms:1,report:{input:{duration_s:2},output:{duration_s:2},steps:[]}}),dispose(){}} as unknown as SoundEngineLike;
 setSoundEngineFactory(()=>engine);
 try{
  await openSound({name:'suspend.wav',url:'data:audio/wav;base64,AAAA'});
  await playSound('suspend.wav');assert.equal(getSoundPlayback('suspend.wav').playing,true);
  await createSoundLifecycleAdapter().suspend!();
  assert.equal(getSoundPlayback('suspend.wav').playing,false,'suspend closed the playback entry');
  assert.equal(jobScheduler.hasLease('sound.playback:suspend.wav'),false,'playback lease released at suspend');
 }finally{closeSoundPlayback('suspend.wav');closeSound('suspend.wav');Object.assign(globalThis,{Audio:previous});}
});
