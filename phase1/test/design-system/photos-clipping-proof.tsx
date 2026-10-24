import {useEffect,useState} from 'react';
import {addMediaFile,getMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';

function frame(){const w=240,h=160,b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
  if(x<40){b[i]=0;b[i+1]=0;b[i+2]=0;}
  else if(x>=200){b[i]=255;b[i+1]=255;b[i+2]=255;}
  else{b[i]=Math.round(40+180*(x/w));b[i+1]=Math.round(50+140*(y/h));b[i+2]=140;}
  b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};}
function fakeEngine():PhotoEngineLike{
 return{async load(){return{id:0,ok:true,...frame()};},async renderPhoto(){return{id:0,ok:true,...frame()};},async exportPhoto(){return{id:0,ok:true,...frame()};},dispose(){}};
}
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

/** Real PhotosWorkspace on a stubbed-engine session with clipped bands: false-color clipping overlay and its toggle. */
export function PhotosClippingProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   const added=await addMediaFile(new Blob([PNG],{type:'image/png'}),'clipping-proof.png');
   if('error' in added)return;
   const it=getMedia().items.find(i=>i.name===added.name);
   if(live&&it)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-clipping-proof" style={{height:760,display:'flex',flexDirection:'column'}}><PhotosWorkspace item={item}/></main>;
}
