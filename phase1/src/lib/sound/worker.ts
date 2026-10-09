/// <reference lib="webworker" />
import init,{process_with_progress,list_plugins} from '../../../sound/pkg/somnia_sound.js';
import type {SoundRequest,SoundResponse,SoundPlugin} from './protocol';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let ready:Promise<unknown>|undefined;
scope.onmessage=async({data}:MessageEvent<SoundRequest>)=>{
 const send=(m:SoundResponse,transfer:Transferable[]=[])=>scope.postMessage(m,transfer);
 try{
  if(data.kind==='init'){
   const start=performance.now();ready??=init({module_or_path:data.wasmUrl});await ready;
   send({id:data.id,ok:true,kind:'ready',plugins:JSON.parse(list_plugins()) as SoundPlugin[],initMs:performance.now()-start});return;
  }
  if(!ready)throw new Error('Sound engine not initialized');await ready;
  const start=performance.now();
  const progress={report:(stage:string,index:number,total:number)=>send({id:data.id,ok:true,kind:'progress',stage,index,total})};
  const result=process_with_progress(new Uint8Array(data.bytes),data.ext,JSON.stringify(data.recipe),progress);
  try{
   const wav=result.wav,peaks=result.peaks,report=JSON.parse(result.report);
   // wasm-bindgen returns owned copies, so their buffers can be transferred.
   send({id:data.id,ok:true,kind:'result',wav:wav.buffer as ArrayBuffer,peaks:peaks.buffer as ArrayBuffer,report,ms:performance.now()-start},[wav.buffer as ArrayBuffer,peaks.buffer as ArrayBuffer]);
  }finally{result.free();}
 }catch(error){send({id:data.id,ok:false,error:error instanceof Error?error.message:String(error)});}
};
