import {useEffect} from 'react';
import {addMediaFile,getMedia,setActiveMedia,useMedia} from '../../src/lib/media';
import {setPhotoEngineFactory} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';
import {HistoryPanel} from '../../src/components/photos/panels/HistoryPanel';

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

/** Real workspace plus the real history panel: one photo whose frame flips warm/cool with the exposure sign, for version save/apply/undo checks. */
export function PhotosVersionsProof(){
 const media=useMedia();
 useEffect(()=>{
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   if(!getMedia().items.some(it=>it.name==='versions-proof.png'))await addMediaFile(new Blob([PNG],{type:'image/png'}),'versions-proof.png');
   setActiveMedia('versions-proof.png');
  })();
 },[]);
 const item=media.items.find(i=>i.name===media.active&&i.kind==='image');
 if(!item)return null;
 return <main data-testid="photos-versions-proof" style={{height:820,display:'flex',gap:8,padding:8}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><PhotosWorkspace key={item.name} item={item}/></div>
  <div style={{width:280,flexShrink:0,overflowY:'auto'}}><HistoryPanel/></div>
 </main>;
}
