import {useEffect} from 'react';
import {addMediaFile,getMedia,setActiveMedia,useMedia} from '../../src/lib/media';
import {setPhotoEngineFactory} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';

function frameOf(hue:number){const w=240,h=150,b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
  if(hue===0){b[i]=Math.round(40+180*(x/w));b[i+1]=Math.round(50+140*(y/h));b[i+2]=140;}
  else if(hue===1){b[i]=60;b[i+1]=Math.round(80+140*(x/w));b[i+2]=Math.round(160+60*(y/h));}
  else{b[i]=Math.round(150+80*(y/h));b[i+2]=Math.round(60+150*(x/w));b[i+1]=90;}
  b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};}
let which=0;
function fakeEngine():PhotoEngineLike{
 return{async load(){return{id:0,ok:true,...frameOf(0)};},async renderPhoto(){return{id:0,ok:true,...frameOf(which++)};},async exportPhoto(){return{id:0,ok:true,...frameOf(0)};},dispose(){}};
}
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

/** Real workspace driven by the media store like PhotosCanvas does: three photos, prev/next switches the active one. */
export function PhotosNavProof(){
 const media=useMedia();
 useEffect(()=>{
  let live=true;
  void(async()=>{
   if(getMedia().items.length)return;
   setPhotoEngineFactory(fakeEngine);
   for(const n of['nav-1.png','nav-2.png','nav-3.png'])await addMediaFile(new Blob([PNG],{type:'image/png'}),n);
   setActiveMedia('nav-1.png');
  })();
  return()=>{live=false;};
 },[]);
 const item=media.items.find(i=>i.name===media.active&&i.kind==='image');
 if(!item)return null;
 return <main data-testid="photos-nav-proof" style={{height:820,display:'flex',flexDirection:'column'}}><PhotosWorkspace key={item.name} item={item}/></main>;
}
