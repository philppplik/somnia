export interface VoiceClip {audio:Blob;mime:string;durationMs:number}
export interface VoiceCapture {stop():Promise<VoiceClip>;cancel():void}
export type CaptureFactory=(signal:AbortSignal,onLevel:(level:number)=>void)=>Promise<VoiceCapture>;
export interface STTAdapter {id:string;local:true;transcribe(clip:VoiceClip,signal:AbortSignal):Promise<{text:string;final:true}>}
export function validateTranscript(value:{text:string;final:true}):string{if(value.final!==true||typeof value.text!=='string'||!value.text.trim()||value.text.length>12000||value.text.includes('\0'))throw Error('Invalid final transcript');return value.text;}
/** Browser capture only, no recognition or upload. Codec is explicit; native PCM conversion is future work. */
export const captureMicrophone:CaptureFactory=async(signal,onLevel)=>{
 signal.throwIfAborted();if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Microphone capture unavailable');
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true},video:false});
 if(signal.aborted){stream.getTracks().forEach(t=>t.stop());signal.throwIfAborted();}
 let context:AudioContext|undefined,frame=0,done=false;const parts:BlobPart[]=[];let bytes=0;const started=performance.now();let failure:Error|undefined;
 let cancel=()=>{};
 const clean=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());void context?.close().catch(()=>{});signal.removeEventListener('abort',cancel);onLevel(0);};
 let recorder:MediaRecorder;try{recorder=new MediaRecorder(stream);context=new AudioContext();const source=context.createMediaStreamSource(stream),meter=context.createAnalyser();meter.fftSize=512;source.connect(meter);const values=new Float32Array(meter.fftSize);const sample=()=>{if(done)return;meter.getFloatTimeDomainData(values);onLevel(Math.min(1,Math.sqrt(values.reduce((n,v)=>n+v*v,0)/values.length)));frame=requestAnimationFrame(sample);};frame=requestAnimationFrame(sample);}catch(e){stream.getTracks().forEach(t=>t.stop());void context?.close();throw e;}
 let resolveStop:(clip:VoiceClip)=>void=()=>{},rejectStop:(e:Error)=>void=()=>{};
 const stopped=new Promise<VoiceClip>((resolve,reject)=>{resolveStop=resolve;rejectStop=reject;});void stopped.catch(()=>{});
 cancel=()=>{if(done)return;done=true;parts.length=0;if(recorder.state!=='inactive')recorder.stop();clean();rejectStop(Error('Capture cancelled'));};
 recorder.ondataavailable=e=>{if(done)return;bytes+=e.data.size;if(bytes>20_000_000){failure=Error('Audio exceeds capture limit');cancel();}else parts.push(e.data);};
 recorder.onerror=()=>{failure=Error('Microphone recording failed');cancel();};
 recorder.onstop=()=>{if(done)return;done=true;clean();if(failure)rejectStop(failure);else resolveStop({audio:new Blob(parts,{type:recorder.mimeType}),mime:recorder.mimeType,durationMs:performance.now()-started});parts.length=0;};
 for(const track of stream.getTracks())track.onended=()=>{if(recorder.state==='recording'){failure=Error('Microphone disconnected');recorder.stop();}};
 signal.addEventListener('abort',cancel,{once:true});recorder.start(250);
 return {cancel,stop(){if(done)return stopped;if(recorder.state==='recording')recorder.stop();return stopped;}};
};
/** Bounded lifecycle: late permission/result cannot survive cancel, reset or unmount. */
export class VoiceInputSession {
 private generation=0;private controller:AbortController|null=null;private capture:VoiceCapture|null=null;
 constructor(private factory:CaptureFactory,private adapter:STTAdapter){}
 async start(onLevel:(n:number)=>void){this.cancel();const token=this.generation,controller=new AbortController();this.controller=controller;const capture=await this.factory(controller.signal,onLevel);if(token!==this.generation||controller.signal.aborted){capture.cancel();throw Error('Capture cancelled');}this.capture=capture;}
 async finish(){const token=this.generation,controller=this.controller,capture=this.capture;if(!controller||!capture)throw Error('No active capture');const clip=await capture.stop();this.capture=null;controller.signal.throwIfAborted();if(token!==this.generation||clip.audio.size>20_000_000||clip.durationMs>120000||clip.durationMs<0)throw Error('Invalid or stale capture');const result=await this.adapter.transcribe(clip,controller.signal);controller.signal.throwIfAborted();if(token!==this.generation)throw Error('Stale transcript');return validateTranscript(result);}
 cancel(){this.generation++;this.controller?.abort();this.capture?.cancel();this.capture=null;this.controller=null;}
}
