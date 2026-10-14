import test from 'node:test';import assert from 'node:assert/strict';
import {toMono16k,whisperSTT,awaitVoiceJob,type VoiceInvoke} from './nativeVoice';
test('explicit channel mean and 16kHz conversion keep sample count, bound and finite samples',()=>{
 assert.deepEqual([...toMono16k([new Float32Array([1,-1]),new Float32Array([-1,1])],16000)],[0,0]);assert.equal(toMono16k([new Float32Array(480)],48000).length,160);assert.deepEqual([...toMono16k([new Float32Array([2,-2])],16000)],[32767,-32767]);
 for(const [channels,rate] of [[[],16000],[[new Float32Array([NaN])],16000],[[new Float32Array(20)],1]] as const)assert.throws(()=>toMono16k(channels,rate));
});
test('native adapter sends only bounded PCM, waits matching terminal result, never tools',async()=>{
 const calls:{command:string;args?:Record<string,unknown>}[]=[];const call:VoiceInvoke=async<T>(command:string,args?:Record<string,unknown>)=>{calls.push({command,args});return (command==='local_voice_transcribe'?'job':{id:'job',phase:'complete',bytes:44,total:44,transcript:'Final words'}) as T;};
 const adapter=whisperSTT(call,async()=>new Int16Array([0,1,-1]));const result=await adapter.transcribe({audio:new Blob(['test']),mime:'test',durationMs:20},new AbortController().signal);assert.deepEqual(result,{text:'Final words',final:true});assert.deepEqual(calls.map(c=>c.command),['local_voice_transcribe','local_voice_poll','local_voice_cancel']);assert.deepEqual(calls[0].args,{pcm:[0,1,-1]});
});
test('mismatched job or failed native result cancels owned job and rejects transcript',async()=>{
 const calls:string[]=[];const call:VoiceInvoke=async<T>(command:string)=>{calls.push(command);return {id:'wrong',phase:'complete',bytes:0,total:0,transcript:'Unrelated'}as T;};await assert.rejects(awaitVoiceJob('mine',new AbortController().signal,call),/identity/);assert.ok(calls.includes('local_voice_cancel'));
});
test('abort while native start is pending cancels the returned id and never polls/applies',async()=>{
 const abort=new AbortController(),calls:string[]=[];const call:VoiceInvoke=async<T>(command:string)=>{calls.push(command);if(command==='local_voice_transcribe'){abort.abort();return 'late-job' as T;}return undefined as T;};await assert.rejects(whisperSTT(call,async()=>new Int16Array([0])).transcribe({audio:new Blob(),mime:'x',durationMs:1},abort.signal));assert.ok(calls.includes('local_voice_cancel'));assert.ok(!calls.includes('local_voice_poll'));
});
test('invalid final native text never becomes transcript and native retained text clears',async()=>{
 const calls:string[]=[];const call:VoiceInvoke=async<T>(command:string)=>{calls.push(command);return(command==='local_voice_transcribe'?'job':{id:'job',phase:'complete',transcript:'bad\0text'})as T;};await assert.rejects(whisperSTT(call,async()=>new Int16Array([0])).transcribe({audio:new Blob(),mime:'x',durationMs:1},new AbortController().signal),/Invalid final/);assert.ok(calls.includes('local_voice_cancel'));
});
