import {diagnosePptx} from './diagnostics';
import {readRuns,makeEditedCopy} from './editCopy';
/// <reference lib="webworker" />
import init,{SlidesEngine} from '../../../slides-engine/pkg/somnia_slides.js';
import type {SlidesRequest,SlidesReply} from './protocol';
let engine:SlidesEngine|undefined;let wasmMemory:WebAssembly.Memory|undefined;
// Serialize even asynchronous initialization. No user-defined method invocation.
let queue=Promise.resolve();
self.onmessage=({data}:{data:SlidesRequest})=>{queue=queue.then(async()=>{
 try{
  let result:SlidesReply['result'];
  switch(data.op){
   case 'init':wasmMemory=(await init()).memory;engine?.free();engine=new SlidesEngine();result=true;break;
   case 'open':if(!engine)throw new Error('Worker not initialized');result=JSON.parse(engine.open(data.bytes));break;
   case 'memory':result={wasmBytes:wasmMemory?.buffer.byteLength??0};break;
   case 'diagnostics':result=diagnosePptx(data.bytes);break;
   case 'runs':result=readRuns(data.bytes);break;
   case 'copy':result=makeEditedCopy(data.bytes,data.edits);break;
   case 'read':if(!engine)throw new Error('Worker not initialized');result=JSON.parse(engine.read_slide(data.index));break;
   case 'render':if(!engine)throw new Error('Worker not initialized');result=engine.render_png(data.index,data.scale);break;
   default:throw new Error('Unknown Slides operation');
  }
  self.postMessage({id:data.id,result},result instanceof Uint8Array?[result.buffer]:[]);
 }catch(error){self.postMessage({id:data.id,error:String(error)});}
});};
