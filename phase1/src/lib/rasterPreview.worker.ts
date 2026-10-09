/// <reference lib="webworker" />
import init,{preview_png} from '../../packages/raster-codec/pkg/somnia_raster_codec.js';
const scope=self as unknown as DedicatedWorkerGlobalScope;
/** Disposable worker: limits decode lifetime on desktop and browser alike. */
scope.onmessage=async({data}:MessageEvent<{bytes:Uint8Array;name:string;wasmUrl:string}>)=>{
 try{
  await init({module_or_path:data.wasmUrl});
  const png=preview_png(data.bytes,data.name);
  scope.postMessage({png},[png.buffer as ArrayBuffer]);
 }catch(error){scope.postMessage({error:`Raster image could not be decoded: ${String(error)}`});}
};
