import {useEffect} from 'react';
import {addMediaFile,getMedia,setActiveMedia,useMedia} from '../../src/lib/media';
import {setPhotoEngineFactory} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';

function frameOf(){const w=240,h=150,b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
  b[i]=Math.round(40+180*(x/w));b[i+1]=Math.round(50+140*(y/h));b[i+2]=140;b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};}
function fakeEngine():PhotoEngineLike{
 return{async load(){return{id:0,ok:true,...frameOf()};},async renderPhoto(){return{id:0,ok:true,...frameOf()};},async exportPhoto(){return{id:0,ok:true,...frameOf()};},dispose(){}};
}
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

/** Real workspace driven by the media store like PhotosCanvas does: one photo, zoom preset stops in the bar. */
export function PhotosZoomProof(){
 const media=useMedia();
 useEffect(()=>{
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   if(!getMedia().items.some(i=>i.name==='zoom.png'))await addMediaFile(new Blob([PNG],{type:'image/png'}),'zoom.png');
   setActiveMedia('zoom.png');
  })();
 },[]);
 const item=media.items.find(i=>i.name===media.active&&i.kind==='image');
 if(!item)return null;
 return <main data-testid="photos-zoom-proof" style={{height:820,display:'flex',flexDirection:'column'}}><PhotosWorkspace key={item.name} item={item}/></main>;
}
