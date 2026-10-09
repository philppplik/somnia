/// <reference lib="webworker" />
import {cancelExport,exportTimeline,probeCapabilities,probeVideo} from './pipeline';
import type {VideoRequest,VideoResponse} from './protocol';
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async({data}:MessageEvent<VideoRequest>)=>{
 const send=(m:VideoResponse,transfer:Transferable[]=[])=>scope.postMessage(m,transfer);
 try{
  if(data.kind==='cancel'){cancelExport();return;}
  if(data.kind==='probe'){send({id:data.id,ok:true,kind:'probe',probe:await probeVideo(data.bytes)});return;}
  if(data.kind==='capabilities'){send({id:data.id,ok:true,kind:'capabilities',capabilities:await probeCapabilities()});return;}
  const {bytes,mime,report}=await exportTimeline(data.sources,data.clips,data.format,(ratio,processed_s)=>send({id:data.id,ok:true,kind:'progress',stage:'encode',ratio,processed_s}));
  send({id:data.id,ok:true,kind:'export',bytes,mime,report},[bytes]);
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  send({id:data.id,ok:false,error:message,cancelled:/cancelled/i.test(message)});
 }
};
