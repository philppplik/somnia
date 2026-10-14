import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,findComp,validateDocument,type AnimationDocument} from './model';
import {applyEdit,applyEdits} from './edit';
import {bytesToDataUrl,channelPeaks,MAX_AUDIO_BYTES,parseWav,peakBinCount,sniffMp3,validateAudioAsset,validateAudioAssets,wavPeaks,type AudioAsset} from './audioCore';
import {withPrecompAudio,visiblePeaks,audibleLayers,audioSignature,clipSpan,gainCurve,playbackPlan,segmentsBetween,sourceTickAt} from './audioTiming';
import {AudioPreview,AudioUnavailable,START_LEAD,type AudioContextLike,type SourceLike,type GainLike} from './audioPreview';
import {playbackAt} from './playback';
import {serializeAnimationSnapshot,parseAnimationSnapshot} from './persistence';
import {defaultView} from './recovery';
import {frameSvg} from './exportFrames';
import {frameToTick,TICKS_PER_SECOND as sec} from './time';
function wav(frames:number,rate=8000,ch=1,fn:(i:number)=>number=()=>0,bits:16|8|32=16,float=false):Uint8Array{
 const align=ch*bits/8,size=frames*align,b=new Uint8Array(44+size),v=new DataView(b.buffer);
 const w=(o:number,s:string)=>[...s].forEach((c,i)=>b[o+i]=c.charCodeAt(0));
 w(0,'RIFF');v.setUint32(4,36+size,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,float?3:1,true);v.setUint16(22,ch,true);v.setUint32(24,rate,true);v.setUint32(28,rate*align,true);v.setUint16(32,align,true);v.setUint16(34,bits,true);w(36,'data');v.setUint32(40,size,true);
 for(let i=0;i<frames;i++)for(let c=0;c<ch;c++){const s=fn(i),o=44+i*align+c*bits/8;if(float)v.setFloat32(o,s,true);else if(bits===16)v.setInt16(o,Math.round(s*32767),true);else if(bits===8)v.setUint8(o,Math.round(128+s*127));else v.setInt32(o,Math.round(s*2147483647),true);}
 return b;
}
const hex=(n:number)=>n.toString(16).padStart(64,'0');
function asset(bytes:Uint8Array,n=1,name='clip.wav'):AudioAsset{
 const w=parseWav(bytes);return {id:`audio-${hex(n)}`,hash:hex(n),mime:'audio/wav',data:bytesToDataUrl(bytes,'audio/wav'),sourceName:name,sourceType:'wav',durationTicks:w.durationTicks,sampleRate:w.sampleRate,channels:w.channels,peaks:wavPeaks(bytes,w),license:'user-provided-unverified'};
}
const TWO_S=wav(16000,8000,1,i=>Math.sin(i/20)*0.5);
const withAudio=(a=asset(TWO_S))=>applyEdit(createDocument(),{type:'audio.import',asset:a,id:'aud'});
const layer=(d:AnimationDocument,id='aud')=>findComp(d)!.layers.find(l=>l.id===id)!;

test('WAV parser accepts bounded PCM/float and reports exact duration',()=>{
 const w=parseWav(wav(8000,8000,2,()=>0));assert.equal(w.channels,2);assert.equal(w.durationTicks,sec);
 assert.equal(parseWav(wav(100,22050,1,()=>0,8)).bits,8);assert.equal(parseWav(wav(100,44100,1,()=>0,32,true)).float,true);assert.equal(parseWav(wav(100,44100,1,()=>0,32)).bits,32);
});
test('WAV parser refuses malformed, truncated, unsupported and oversize input',()=>{
 assert.throws(()=>parseWav(new Uint8Array(10)));assert.throws(()=>parseWav(new TextEncoder().encode('RIFF'.padEnd(60,'x'))));
 const good=wav(100);assert.throws(()=>parseWav(good.subarray(0,60)),/Truncated/);
 const three=wav(100,8000,2);new DataView(three.buffer).setUint16(22,3,true);assert.throws(()=>parseWav(three),/mono and stereo/);
 const rate=wav(100);new DataView(rate.buffer).setUint32(24,1000,true);assert.throws(()=>parseWav(rate),/Sample rate/);
 const tag=wav(100);new DataView(tag.buffer).setUint16(20,2,true);assert.throws(()=>parseWav(tag),/PCM/);
 const align=wav(100);new DataView(align.buffer).setUint16(32,3,true);assert.throws(()=>parseWav(align),/block size/);
 assert.throws(()=>parseWav(new Uint8Array(MAX_AUDIO_BYTES+1)),/2 MB/);
});
test('MP3 sniff needs two consecutive Layer III frames and skips ID3',()=>{
 const frame=(len:number)=>{const f=new Uint8Array(len);f.set([0xff,0xfb,0x90,0x00]);return f;};
 const two=new Uint8Array(417*2+10);two.set(frame(417),0);two.set(frame(417),417);
 const m=sniffMp3(two);assert.equal(m.sampleRate,44100);assert.equal(m.channels,2);
 const id3=new Uint8Array(10+20+417*2);id3.set([0x49,0x44,0x33,4,0,0,0,0,0,20],0);id3.set(frame(417),30);id3.set(frame(417),30+417);assert.equal(sniffMp3(id3).sampleRate,44100);
 const lone=new Uint8Array(1000);lone.set(frame(417),0);assert.throws(()=>sniffMp3(lone));
 assert.throws(()=>sniffMp3(new Uint8Array(500)));
 const layer2=new Uint8Array(900);layer2.set([0xff,0xfd,0x90,0x00],0);assert.throws(()=>sniffMp3(layer2));
});
test('peaks are bounded integers that follow the signal',()=>{
 const bytes=wav(16000,8000,1,i=>i<8000?0.5:1);const w=parseWav(bytes);const p=wavPeaks(bytes,w);
 assert.equal(p.length,peakBinCount(16000));assert.equal(p.length,1024);
 assert.ok(p.slice(0,500).every(v=>Math.abs(v-128)<=2));assert.ok(p.slice(520).every(v=>v>=254));
 assert.deepEqual(wavPeaks(bytes,w,0,4),p.slice(0,4));
 assert.equal(peakBinCount(10),10);assert.deepEqual(channelPeaks([Float32Array.of(0,0.5,-1,0.25)]),[0,128,255,64]);
});
test('asset validation re-reads the embedded bytes and enforces limits',()=>{
 const a=asset(TWO_S);validateAudioAsset(a);
 assert.throws(()=>validateAudioAsset({...a,sampleRate:16000}));assert.throws(()=>validateAudioAsset({...a,durationTicks:a.durationTicks+1}));
 assert.throws(()=>validateAudioAsset({...a,id:'audio-x'}));assert.throws(()=>validateAudioAsset({...a,data:'data:audio/wav;base64,@@@'}));
 assert.throws(()=>validateAudioAsset({...a,peaks:[300]}));assert.throws(()=>validateAudioAsset({...a,mime:'audio/mpeg'}));
 assert.throws(()=>validateAudioAsset({...a,license:'mit' as never}));
 assert.throws(()=>validateAudioAsset({...a,data:a.data.replace('base64,','base64,AAAA')}));
 validateAudioAssets([a]);assert.throws(()=>validateAudioAssets([a,a]));
 const many=Array.from({length:9},(_,i)=>asset(TWO_S,i+1));assert.throws(()=>validateAudioAssets(many),/Invalid audio assets/);
 const big=wav(900000,8000,1,()=>0);assert.ok(big.length<MAX_AUDIO_BYTES);
 const bigs=[1,2,3].map(n=>asset(big,n));assert.throws(()=>validateAudioAssets(bigs),/4 MB/);
});
test('audio.import adds an asset and a clip layer; edits validate and undo-safe prune works',()=>{
 let d=withAudio();const l=layer(d);assert.equal(l.kind,'audio');assert.equal(l.outT,2*sec);assert.equal(l.audio!.trimIn,0);assert.equal(d.audioAssets!.length,1);assert.deepEqual(validateDocument(d),[]);
 const again=applyEdit(d,{type:'audio.import',asset:d.audioAssets![0],id:'aud2'});assert.equal(again.audioAssets!.length,1);
 d=applyEdit(d,{type:'audio.update',layer:'aud',trimIn:sec/2,length:sec,offset:sec});const u=layer(d);
 assert.deepEqual([u.audio!.trimIn,u.outT-u.inT,u.offset],[sec/2,sec,sec]);
 assert.throws(()=>applyEdit(d,{type:'audio.update',layer:'aud',trimIn:sec,length:2*sec}),/inside the audio file/);
 assert.throws(()=>applyEdit(d,{type:'audio.update',layer:'aud',trimIn:-1}));assert.throws(()=>applyEdit(d,{type:'audio.update',layer:'aud',length:0}));
 assert.throws(()=>applyEdit(d,{type:'audio.update',layer:'aud',offset:1.5}));assert.throws(()=>applyEdit(d,{type:'audio.update',layer:'aud',offset:1e12}));
 assert.throws(()=>applyEdit(d,{type:'layer.timing',layer:'aud',inT:0,outT:sec}));
 assert.throws(()=>applyEdit(createDocument(),{type:'audio.update',layer:'x',offset:0}));
 const removed=applyEdit(d,{type:'layer.remove',layer:'aud'});assert.equal(removed.audioAssets!.length,0);
 const two=applyEdit(again,{type:'layer.remove',layer:'aud'});assert.equal(two.audioAssets!.length,1,'second layer still uses the file');
});
test('volume keyframes: set, animate, key and remove keep the document valid',()=>{
 let d=withAudio();
 d=applyEdit(d,{type:'audio.volume.set',layer:'aud',value:50,t:0});assert.equal(layer(d).audio!.volume.value,50);assert.equal(layer(d).audio!.volume.keys.length,0);
 d=applyEdit(d,{type:'audio.volume.animate',layer:'aud',on:true,t:0});assert.equal(layer(d).audio!.volume.keys.length,1);
 d=applyEdit(d,{type:'audio.volume.set',layer:'aud',value:150,t:sec});assert.deepEqual(layer(d).audio!.volume.keys.map(k=>[k.t,k.v]),[[0,50],[sec,150]]);
 assert.throws(()=>applyEdit(d,{type:'audio.volume.set',layer:'aud',value:201,t:0}));assert.throws(()=>applyEdit(d,{type:'audio.volume.set',layer:'aud',value:-1,t:0}));
 assert.throws(()=>applyEdit(d,{type:'audio.volume.set',layer:'aud',value:NaN,t:0}));assert.throws(()=>applyEdit(d,{type:'audio.volume.set',layer:'aud',value:10,t:99*sec}));
 assert.deepEqual(validateDocument(d),[]);
 d=applyEdit(d,{type:'audio.volume.key.remove',layer:'aud',t:sec});assert.equal(layer(d).audio!.volume.keys.length,1);assert.throws(()=>applyEdit(d,{type:'audio.volume.key.remove',layer:'aud',t:sec}));
 d=applyEdit(d,{type:'audio.volume.animate',layer:'aud',on:false,t:0});assert.equal(layer(d).audio!.volume.keys.length,0);assert.equal(layer(d).audio!.volume.value,50);
 d=applyEdit(d,{type:'layer.update',layer:'aud',locked:true});assert.throws(()=>applyEdit(d,{type:'audio.volume.set',layer:'aud',value:10,t:0}),/locked/);
});
test('validation rejects audio layers without a file, with out-of-range trim, or on other kinds',()=>{
 const d=withAudio();const c=findComp(d)!;
 const mod=(f:(l:typeof c.layers[number])=>object)=>({...d,compositions:[{...c,layers:c.layers.map(l=>({...l,...f(l)}))}]}) as AnimationDocument;
 assert.ok(validateDocument(mod(()=>({audio:{...layer(d).audio!,assetId:'audio-nope'}}))).length);
 assert.ok(validateDocument(mod(()=>({audio:{...layer(d).audio!,trimIn:sec}}))).length,'trim + length beyond file');
 assert.ok(validateDocument(mod(()=>({kind:'solid'}))).length,'solid with audio params');
 assert.ok(validateDocument(mod(()=>({inT:5}))).length);
 assert.ok(validateDocument(mod(()=>({audio:{...layer(d).audio!,volume:{type:'scalar',value:300,keys:[]}}}))).length);
});
test('snapshot round-trips embedded audio and refuses a tampered one',()=>{
 const d=applyEdit(withAudio(),{type:'audio.update',layer:'aud',trimIn:sec/4,length:sec,offset:sec/2});
 const back=parseAnimationSnapshot(serializeAnimationSnapshot(d,defaultView()));
 assert.deepEqual(back.doc.audioAssets,d.audioAssets);assert.deepEqual(layer(back.doc).audio,layer(d).audio);
 const bad={...d,audioAssets:[{...d.audioAssets![0],sampleRate:44100}]};assert.throws(()=>serializeAnimationSnapshot(bad,defaultView()));
});
test('audible layers follow the eye and solo; clip span and file position use offset and trim',()=>{
 let d=withAudio();d=applyEdit(d,{type:'audio.update',layer:'aud',trimIn:sec/2,length:sec,offset:sec});const c=findComp(d)!,l=layer(d);
 assert.deepEqual(clipSpan(l),{start:sec,end:2*sec});assert.equal(sourceTickAt(l,sec-1),null);assert.equal(sourceTickAt(l,sec),sec/2);assert.equal(sourceTickAt(l,sec+sec/2),sec);assert.equal(sourceTickAt(l,2*sec),null);
 assert.equal(audibleLayers(c).length,1);
 assert.equal(audibleLayers(findComp(applyEdit(d,{type:'layer.update',layer:'aud',visible:false}))!).length,0);
 const s=applyEdits(d,[{type:'layer.add',kind:'solid',id:'s'},{type:'layer.update',layer:'s',solo:true}]);assert.equal(audibleLayers(findComp(s)!).length,0,'solo on another layer mutes audio');
});
test('segments clip to the pass window with trim, offset and file length',()=>{
 let d=withAudio();d=applyEdit(d,{type:'audio.update',layer:'aud',trimIn:sec/2,length:sec,offset:sec});const c=findComp(d)!;
 const all=segmentsBetween(c,0,5*sec);assert.equal(all.length,1);assert.deepEqual([all[0].when,all[0].offset,all[0].duration],[1,0.5,1]);
 const mid=segmentsBetween(c,sec+sec/4,5*sec)[0];assert.deepEqual([mid.when,mid.offset,mid.duration],[0,0.75,0.75]);
 assert.equal(segmentsBetween(c,2*sec,5*sec).length,0);assert.equal(segmentsBetween(c,0,sec).length,0);
});
test('playback plan agrees with playbackAt for every start, loop and work area',()=>{
 const fps={num:30,den:1},area={in:frameToTick(10,fps),out:frameToTick(70,fps)};
 for(const loop of [true,false])for(const start of [0,frameToTick(5,fps),frameToTick(10,fps),frameToTick(40,fps),frameToTick(69,fps),frameToTick(70,fps),frameToTick(100,fps)]){
  const plan=playbackPlan(start,area,fps,loop);assert.equal(plan.startTick,playbackAt(start,0,area,fps,loop).tick);
  const p0=plan.passes(0)!;assert.equal(p0.from,plan.startTick);assert.equal(p0.to,frameToTick(70,fps));
  if(loop){const p1=plan.passes(1)!,p2=plan.passes(2)!;
   const at=playbackAt(start,p1.startSec*1000+1,area,fps,true);assert.equal(at.tick,frameToTick(10,fps),'pass 1 starts exactly at the work-area start');
   assert.ok(Math.abs((p2.startSec-p1.startSec)-60/30)<1e-9);
   const before=playbackAt(start,p1.startSec*1000-1,area,fps,true);assert.ok(before.tick>=area.in&&before.tick<=frameToTick(69,fps));}
  else assert.equal(plan.passes(1),null);
 }
});
test('gain curve is constant without keys and samples keyed volume, clamped and bounded',()=>{
 let d=withAudio();assert.deepEqual(gainCurve(layer(d),0,sec),{constant:1});
 d=applyEdit(d,{type:'audio.volume.set',layer:'aud',value:0,t:0});d=applyEdit(d,{type:'audio.volume.animate',layer:'aud',on:true,t:0});d=applyEdit(d,{type:'audio.volume.set',layer:'aud',value:200,t:sec});
 const g=gainCurve(layer(d),0,sec) as {curve:Float32Array};assert.equal(g.curve.length,31);assert.equal(g.curve[0],0);assert.ok(Math.abs(g.curve[30]-2)<1e-6);assert.ok(g.curve.every((v,i)=>i===0||v>=g.curve[i-1]));
 const long=gainCurve(layer(d),0,3600*sec) as {curve:Float32Array};assert.equal(long.curve.length,1024);
 assert.ok(audioSignature(d,findComp(d)).length>0);assert.equal(audioSignature(createDocument(),findComp(createDocument())),'');
 assert.notEqual(audioSignature(d,findComp(d)),audioSignature(applyEdit(d,{type:'audio.update',layer:'aud',offset:1}),findComp(applyEdit(d,{type:'audio.update',layer:'aud',offset:1}))));
});
class FakeCtx implements AudioContextLike{
 currentTime=10;state='suspended';destination={};outputLatency=0.02;baseLatency=0;decoded=0;created:FakeSource[]=[];
 async resume(){this.state='running';}
 async decodeAudioData(b:ArrayBuffer){this.decoded++;assert.ok(b.byteLength>44);return {duration:2};}
 createBufferSource(){const s=new FakeSource();this.created.push(s);return s;}
 createGain(){return new FakeGain();}
}
class FakeSource implements SourceLike{buffer=null as {duration:number}|null;started:{when:number;offset:number;duration:number}|null=null;stopped=false;connect(){}disconnect(){}start(when:number,offset:number,duration:number){this.started={when,offset,duration};}stop(){this.stopped=true;}}
class FakeGain implements GainLike{curves:unknown[]=[];set:unknown[]=[];gain={value:1,setValueAtTime:(v:number,t:number)=>{this.set.push([v,t]);},setValueCurveAtTime:(c:Float32Array,t:number,d:number)=>{this.curves.push([c.length,t,d]);}};connect(){}disconnect(){}}
test('preview schedules sources on the audio clock and the playhead follows that clock',async()=>{
 let d=withAudio();d=applyEdit(d,{type:'audio.update',layer:'aud',trimIn:sec/2,length:sec,offset:sec});const c=findComp(d)!;
 const ctx=new FakeCtx(),p=new AudioPreview(()=>ctx);
 const start=await p.start(d,c,frameToTick(15,c.fps),false);assert.equal(start,frameToTick(15,c.fps));assert.equal(ctx.state,'running');
 const t0=10+START_LEAD,src=ctx.created[0];
 // playhead 0.5 s, clip starts at 1 s: begins 0.5 s after t0, 0.5 s into the file
 assert.ok(Math.abs(src.started!.when-(t0+0.5))<1e-9);assert.ok(Math.abs(src.started!.offset-0.5)<1e-9);assert.ok(Math.abs(src.started!.duration-1)<1e-9);
 assert.equal(p.elapsedMs(),0);ctx.currentTime=t0+0.75;assert.ok(Math.abs(p.elapsedMs()-730)<1e-6,'latency subtracted');
 ctx.currentTime=t0+0.5+0.02+0.001;const e=playbackAt(start!,p.elapsedMs(),c.workArea,c.fps,false);
 assert.equal(e.tick,frameToTick(30,c.fps),'at the clip start the picture is exactly on 1 s');
 p.stop();assert.ok(src.stopped);assert.equal(p.active,false);
});
test('looped preview keeps one pass of lookahead and re-arms at the exact wrap time',async()=>{
 let d=withAudio();d=applyEdit(d,{type:'comp.update',settings:{duration:2*sec}});d=applyEdit(d,{type:'layer.update',layer:'aud',visible:true});
 const c=findComp(d)!,ctx=new FakeCtx(),p=new AudioPreview(()=>ctx);
 await p.start(d,c,0,true);const t0=10+START_LEAD;
 assert.equal(ctx.created.length,2,'pass 0 and pass 1 scheduled');assert.ok(Math.abs(ctx.created[1].started!.when-(t0+2))<1e-9);assert.equal(ctx.created[1].started!.offset,0);
 ctx.currentTime=t0+2.5;p.poll();assert.equal(ctx.created.length,3);assert.ok(Math.abs(ctx.created[2].started!.when-(t0+4))<1e-9);
 p.poll();assert.equal(ctx.created.length,3,'no duplicate scheduling');
 assert.ok(ctx.created[0].stopped===false);p.stop();assert.ok(ctx.created[2].stopped&&ctx.created[1].stopped);
});
test('keyed volume reaches the gain node as a curve over the segment; decode is cached across starts',async()=>{
 let d=withAudio();d=applyEdit(d,{type:'audio.volume.animate',layer:'aud',on:true,t:0});d=applyEdit(d,{type:'audio.volume.set',layer:'aud',value:0,t:sec});
 const c=findComp(d)!,ctx=new FakeCtx(),p=new AudioPreview(()=>ctx),gains:FakeGain[]=[];const mk=ctx.createGain.bind(ctx);ctx.createGain=()=>{const g=mk();gains.push(g);return g;};
 await p.start(d,c,0,false);assert.equal(gains[0].curves.length,1);assert.deepEqual((gains[0].curves[0] as number[]).slice(0,1),[61]);
 await p.start(d,c,0,false);assert.equal(ctx.decoded,1);
});
test('preview reports unavailable audio and stays silent when nothing is audible',async()=>{
 const d=withAudio(),c=findComp(d)!;
 await assert.rejects(()=>new AudioPreview(()=>null).start(d,c,0,false),AudioUnavailable);
 const muted=applyEdit(d,{type:'layer.update',layer:'aud',visible:false});assert.equal(await new AudioPreview(()=>null).start(muted,findComp(muted)!,0,false),null);
 const failing=new FakeCtx();failing.decodeAudioData=async()=>{throw Error('bad');};await assert.rejects(()=>new AudioPreview(()=>failing).start(d,c,0,false),AudioUnavailable);
});
test('visible peaks stay bounded and follow the trimmed range',()=>{
 const peaks=[...Array(100).fill(0),...Array(100).fill(255)];
 assert.equal(visiblePeaks(peaks,sec,0,sec,5000).length,400);
 const half=visiblePeaks(peaks,sec,0,sec/2,10);assert.ok(half.every(v=>v===0));
 const second=visiblePeaks(peaks,sec,sec/2,sec/2,10);assert.ok(second.every(v=>v===1));
 const mixed=visiblePeaks(peaks,sec,0,sec,2);assert.deepEqual(mixed,[0,1]);
 assert.deepEqual(visiblePeaks([],sec,0,sec,10),[]);assert.deepEqual(visiblePeaks(peaks,sec,0,0,10),[]);
});
test('audio layers are never drawn and do not break frame rendering',()=>{
 const d=applyEdits(withAudio(),[{type:'layer.add',kind:'solid',id:'bg'}]);const c=findComp(d)!;
 const svg=frameSvg(c,0,false,d.assets);assert.ok(svg.startsWith('<svg'));assert.equal((svg.match(/<g transform/g)??[]).length,1,'only the solid is drawn');
});

test('P48 audio of nested compositions is mapped into the parent: shift, cut, hide, solo, loop, speed',()=>{
 const base=withAudio();const clip=layer(base);const len=clipSpan(clip).end-clipSpan(clip).start;assert.ok(len>=sec);
 let d=applyEdit(base,{type:'comp.add',id:'par'});d=applyEdit(d,{type:'precomp.add',comp:base.activeComp,id:'pc'});
 const par=()=>findComp(d)!,mix=()=>withPrecompAudio(par(),d.compositions),spans=()=>audibleLayers(mix()).map(l=>[l.id,clipSpan(l).start,clipSpan(l).end,l.audio!.trimIn]);
 assert.equal(par().layers.some(l=>l.kind==='audio'),false);
 assert.deepEqual(spans(),[['pc:0:aud',0,len,0]],'comp layer at 0: same position');
 // shifted comp layer: clip starts later, cut at the comp layer's out point
 d=applyEdit(d,{type:'layer.timing',layer:'pc',inT:sec,outT:sec+len/2});
 assert.deepEqual(spans(),[['pc:0:aud',sec,sec+len/2,0]]);
 // comp layer starts after the clip start: the clip is trimmed into the file
 d=applyEdit(d,{type:'layer.timing',layer:'pc',inT:0,outT:len});d=applyEdit(d,{type:'layer.update',layer:'pc',source:{timeOffset:sec/2}});
 assert.deepEqual(spans(),[['pc:0:aud',0,len-sec/2,sec/2]],'start time in the child trims the front');
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{timeOffset:0}});
 // segments reach the scheduler as parent-time clips
 const seg=segmentsBetween(mix(),0,len);assert.equal(seg.length,1);assert.equal(seg[0].when,0);
 // hidden, soloed elsewhere
 assert.equal(audibleLayers(withPrecompAudio(findComp(applyEdit(d,{type:'layer.update',layer:'pc',visible:false}))!,d.compositions)).length,0);
 const s=applyEdits(d,[{type:'layer.add',kind:'solid',id:'s'},{type:'layer.update',layer:'s',solo:true}]);assert.equal(audibleLayers(withPrecompAudio(findComp(s)!,s.compositions)).length,0);
 const so=applyEdit(s,{type:'layer.update',layer:'pc',solo:true});assert.equal(audibleLayers(withPrecompAudio(findComp(so)!,so.compositions)).length,1,'soloed comp layer keeps its sound');
 // speed 200 %: the file plays twice as fast, so the 2 s clip lasts half as long and its front cut counts double
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{speed:200}});
 assert.deepEqual(spans(),[['pc:0:aud',0,len/2,0]]);assert.equal(audibleLayers(mix())[0].audio!.rate,2);
 const fast=segmentsBetween(mix(),0,len/2)[0];assert.deepEqual([fast.rate,fast.duration,fast.fileDuration],[2,len/2/sec,len/sec]);
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{timeOffset:sec/2}});
 assert.deepEqual(spans(),[['pc:0:aud',0,len/2-sec/4,sec/2]],'offset in child time is halved on the parent timeline');
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{speed:50,timeOffset:0}});
 const slow=audibleLayers(mix())[0];assert.deepEqual([clipSpan(slow).start,clipSpan(slow).end,slow.audio!.rate],[0,Math.min(len*2,par().layers[0].outT),0.5]);
 assert.equal(sourceTickAt(slow,sec),sec/2,'half rate: 1 s of timeline is 0.5 s of file');
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{speed:100}});
 // loop: the child clip repeats while the comp layer lasts
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{speed:100,loop:true}});
 d=applyEdit(d,{type:'comp.update',comp:base.activeComp,settings:{duration:sec}});d=applyEdit(d,{type:'layer.timing',layer:'pc',inT:0,outT:Math.min(par().duration,sec*3)});
 assert.deepEqual(audibleLayers(mix()).map(l=>[clipSpan(l).start,clipSpan(l).end]),[[0,sec],[sec,2*sec],[2*sec,3*sec]],'repeats per child pass');assert.equal(new Set(audibleLayers(mix()).map(l=>l.id)).size,audibleLayers(mix()).length);
 // nothing nested: same object, no work
 assert.equal(withPrecompAudio(findComp(base)!,base.compositions),findComp(base));
 assert.notEqual(audioSignature(d,par()),'');
});

test('P52 comp layer volume scales nested audio and its keys; invalid values are rejected',()=>{
 let b=withAudio();
 b=applyEdit(b,{type:'audio.volume.set',layer:'aud',value:80,t:0});b=applyEdit(b,{type:'audio.volume.animate',layer:'aud',on:true,t:0});b=applyEdit(b,{type:'audio.volume.set',layer:'aud',value:160,t:sec});
 let d=applyEdit(b,{type:'comp.add',id:'par'});d=applyEdit(d,{type:'precomp.add',comp:b.activeComp,id:'pc'});
 const vol=()=>audibleLayers(withPrecompAudio(findComp(d)!,d.compositions))[0].audio!.volume;
 assert.deepEqual(vol().keys.map(k=>k.v),[80,160]);
 d=applyEdit(d,{type:'layer.update',layer:'pc',source:{volume:50}});assert.deepEqual(vol().keys.map(k=>k.v),[40,80]);
 assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'pc',source:{volume:201}}));assert.throws(()=>applyEdit(d,{type:'layer.update',layer:'pc',source:{volume:-1}}));
 const d2=applyEdit(d,{type:'layer.update',layer:'pc',source:{volume:100}});assert.notEqual(audioSignature(d,findComp(d)),audioSignature(d2,findComp(d2)));
});
