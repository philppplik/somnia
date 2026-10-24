import test from 'node:test';import assert from 'node:assert/strict';
import {transcribeAudioFile,validateTranscript,filePCM} from './transcript/transcribeFile';
import {toMono16k,toMono16kBounded,type VoiceInvoke} from './agent/nativeVoice';
const file={} as File,decode=async()=>new Int16Array([1,0,-1]);
test('file budget does not widen prompt PCM budget',()=>{const audio=new Float32Array(8000*121);assert.throws(()=>toMono16k([audio],8000));assert.equal(toMono16kBounded([audio],8000,600).length,16000*121);assert.throws(()=>toMono16kBounded([new Float32Array(8000*600+1)],8000,600));assert.throws(()=>toMono16kBounded([new Float32Array([NaN])],16000,600));});
test('long transcript accepted without prompt cap; invalid output rejected',()=>{assert.equal(validateTranscript('x'.repeat(120000)).length,120000);assert.equal(validateTranscript('ü'.repeat(120000)).length,120000);for(const value of ['',null,'a\0b','x'.repeat(120001)])assert.throws(()=>validateTranscript(value));});
test('native file route, progress, result release and no prompt mutation',async()=>{const calls:string[]=[],phases:string[]=[];const call:VoiceInvoke=async<T>(command:string,args?:Record<string,unknown>)=>{calls.push(command);if(command==='local_voice_transcribe_file'){assert.deepEqual(args,{pcm:[1,0,-1],language:'en'});return 'f' as T;}return {id:'f',phase:'complete',transcript:'long '.repeat(3000)} as T;};assert.equal((await transcribeAudioFile(file,'en',new AbortController().signal,p=>phases.push(p),call,decode)).length,14999);assert.deepEqual(phases,['decoding','transcribing']);assert.deepEqual(calls,['local_voice_transcribe_file','local_voice_poll','local_voice_cancel']);});
test('abort after native start always cancels late job without polling',async()=>{const controller=new AbortController(),calls:string[]=[];const call:VoiceInvoke=async<T>(command:string)=>{calls.push(command);controller.abort();return 'late' as T;};await assert.rejects(transcribeAudioFile(file,'de',controller.signal,undefined,call,decode));assert.ok(calls.includes('local_voice_cancel'));assert.ok(!calls.includes('local_voice_poll'));});
test('failed and malformed outputs are released',async()=>{for(const job of [{id:'f',phase:'failed'},{id:'other',phase:'complete',transcript:'text'},{id:'f',phase:'complete',transcript:'bad\0text'}]){const calls:string[]=[];const call:VoiceInvoke=async<T>(command:string)=>{calls.push(command);return(command==='local_voice_transcribe_file'?'f':job) as T;};await assert.rejects(transcribeAudioFile(file,'en',new AbortController().signal,undefined,call,decode));assert.equal(calls.at(-1),'local_voice_cancel');}});
test('oversize and empty inputs rejected before decoder construction',async()=>{for(const size of [0,20000001])await assert.rejects(filePCM({size} as File,new AbortController().signal),/size limits/);});
test('decodeAudioData mixes channels and always closes context on failure or abort',async()=>{
 const original=globalThis.AudioContext;let closed=0;const controller=new AbortController();
 class FakeContext{async decodeAudioData(){return {duration:0.000125,length:2,numberOfChannels:2,sampleRate:16000,getChannelData:(i:number)=>new Float32Array(i?[1,-1]:[-1,1])};}async close(){closed++;}}
 try{
  Object.assign(globalThis,{AudioContext:FakeContext});const input={size:4,arrayBuffer:async()=>new ArrayBuffer(4)} as File;
  assert.deepEqual(await filePCM(input,controller.signal),new Int16Array([0,0]));assert.equal(closed,1);
  class FailingContext extends FakeContext{async decodeAudioData():Promise<never>{throw Error('Unsupported codec');}}
  Object.assign(globalThis,{AudioContext:FailingContext});await assert.rejects(filePCM(input,controller.signal),/Unsupported/);assert.equal(closed,2);
  Object.assign(globalThis,{AudioContext:FakeContext});const abortInput={size:4,arrayBuffer:async()=>{controller.abort();return new ArrayBuffer(4);}} as File;
  await assert.rejects(filePCM(abortInput,controller.signal));assert.equal(closed,3);
 }finally{Object.assign(globalThis,{AudioContext:original});}
});
