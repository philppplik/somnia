import {useEffect,useState} from 'react';
import {addMediaFile,getMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto,commitPhotoSettings} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';

function frameOf(warm:boolean){const w=240,h=160,b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
  if(warm){b[i]=Math.round(200+40*(x/w));b[i+1]=Math.round(90+80*(y/h));b[i+2]=60;}
  else{b[i]=Math.round(30+60*(x/w));b[i+1]=Math.round(120+80*(y/h));b[i+2]=210;}
  b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};}
function fakeEngine():PhotoEngineLike{
 return{
  async load(){return{id:0,ok:true,...frameOf(false)};},
  async renderPhoto(settings:PhotoSettings){return{id:0,ok:true,...frameOf(settings.exposure>0)};},
  async exportPhoto(){return{id:0,ok:true,...frameOf(true)};},
  dispose(){}};
}
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

/** Real PhotosWorkspace on a stubbed-engine session: original (cool) vs developed (warm) frames for the before/after split view. */
export function PhotosSplitProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   const added=await addMediaFile(new Blob([PNG],{type:'image/png'}),'split-proof.png');
   if('error' in added)return;
   const it=getMedia().items.find(i=>i.name===added.name);
   if(!it)return;
   await openPhoto({name:it.name,url:it.url,mime:'image/png'});
   commitPhotoSettings(it.name,s=>({...s,exposure:1.2}));
   if(live)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-split-proof" style={{height:760,display:'flex',flexDirection:'column'}}><PhotosWorkspace item={item}/></main>;
}
