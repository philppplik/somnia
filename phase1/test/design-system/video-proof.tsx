import {useEffect,useState} from 'react';
import {setVideoEngineFactory,openVideo,getVideoSession,selectTimelineClip} from '../../src/lib/video/session';
import {addTitleClip} from '../../src/lib/video/titleSession';
import {VideoControls} from '../../src/components/video/VideoInspector';
import type {VideoEngineLike} from '../../src/lib/video/engine';
import type {VideoProbe,VideoReport} from '../../src/lib/video/protocol';

const PROBE:VideoProbe={duration:2,video:{codec:'vp9',width:320,height:180,fps:25},audio:{codec:'opus',channels:2,rate:48000}};
const REPORT:VideoReport={format:'webm',duration_s:2,bytes:1,videoCodec:'vp9',audioCodec:'opus',steps:['proof']};
function fakeEngine():VideoEngineLike{
 return{async probe(){return PROBE;},async capabilities(){return{webmVideo:'vp9',mp4Video:'h264',opus:true,aac:true};},
  async export(){return{bytes:new Uint8Array([0]).buffer as ArrayBuffer,mime:'video/webm',report:REPORT};},
  cancelExport(){},dispose(){}};
}

/** Real migrated video inspector on a stubbed-engine session with a selected title clip. */
export function VideoProof(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setVideoEngineFactory(fakeEngine);
   await openVideo({name:'proof.webm',url:URL.createObjectURL(new Blob([new Uint8Array([0])],{type:'video/webm'}))});
   addTitleClip('proof.webm',0,{text:'Proof title'});
   const s=getVideoSession('proof.webm');
   const title=[...(s?.clips??[])].reverse().find(c=>c.id!==s?.clips[0]?.id);
   if(title)selectTimelineClip('proof.webm',title.id);
   if(live)setReady(true);
  })();
  return()=>{live=false;};
 },[]);
 if(!ready)return null;
 return <main data-testid="video-proof"><h1>Video DS adoption</h1><p>Actual video inspector (with title clip controls) on a stubbed-engine session; every control renders through native control primitives.</p>
  <VideoControls name="proof.webm"/></main>;
}
