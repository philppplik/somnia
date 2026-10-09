/// <reference lib="webworker" />
import init,{PhotosCore} from '../../../photos-engine/pkg/somnia_photos_spike.js';
import {validateDevelop,validatePhotoInput,photosEngines} from './registry';
import type {PhotosRequest,PhotosResponse} from './engine';
const scope=self as unknown as DedicatedWorkerGlobalScope;
let ready:Promise<unknown>|undefined,core:PhotosCore|undefined;
// Serialize even initialization: async onmessage handlers must not race source replacement.
let chain=Promise.resolve();
scope.onmessage=({data}:MessageEvent<PhotosRequest>)=>{chain=chain.then(async()=>{
 try{
  ready??=init({module_or_path:data.wasmUrl});await ready;
  let result:Partial<PhotosResponse>={},transfer:Transferable[]=[];
  if(data.op==='load'){
   validatePhotoInput(data.bytes);const next=new PhotosCore(new Uint8Array(data.bytes),photosEngines.lightcraft.sourceEdge);
   core?.free();core=next;result={width:core.source_width(),height:core.source_height(),raw:core.raw()};
  }else{
   if(!core)throw Error('Load a photo first.');
   const settings=validateDevelop(data.settings);
   const edge=data.op==='export'?photosEngines.lightcraft.sourceEdge:photosEngines.lightcraft.previewEdge;
   const rgba=core.render(JSON.stringify(settings),edge);
   result={width:core.width(),height:core.height(),raw:core.raw()};
   const bytes=data.op==='export'?(data.format==='png'?core.export_png():core.export_jpeg()):rgba;
   result.bytes=bytes.buffer as ArrayBuffer;transfer=[result.bytes];
  }
  scope.postMessage({id:data.id,ok:true,...result},transfer);
 }catch(error){scope.postMessage({id:data.id,ok:false,error:String(error)});}
});};
