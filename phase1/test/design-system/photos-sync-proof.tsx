import {useEffect,useState} from 'react';
import {addMediaFile,getMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto,commitPhotoSettings} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';

function frameOf(warm:boolean){const w=240,h=140,b=new Uint8Array(w*h*4);
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

/** Two real workspaces on one stubbed engine: A carries edited (warm) settings, B is neutral (cool). Copy in A, paste in B. */
export function PhotosSyncProof(){
 const [items,setItems]=useState<MediaItem[]|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   const a=await addMediaFile(new Blob([PNG],{type:'image/png'}),'sync-a.png');
   const b=await addMediaFile(new Blob([PNG],{type:'image/png'}),'sync-b.png');
   if('error' in a||'error' in b)return;
   const ia=getMedia().items.find(i=>i.name===a.name),ib=getMedia().items.find(i=>i.name===b.name);
   if(!ia||!ib)return;
   await openPhoto({name:ia.name,url:ia.url,mime:'image/png'});
   await openPhoto({name:ib.name,url:ib.url,mime:'image/png'});
   commitPhotoSettings(ia.name,s=>({...s,exposure:1.2}));
   if(live)setItems([ia,ib]);
  })();
  return()=>{live=false;};
 },[]);
 if(!items)return null;
 return <main data-testid="photos-sync-proof" style={{display:'grid',gridTemplateRows:'1fr 1fr',height:900}}>
  <div data-testid="photos-sync-a" style={{display:'flex',minHeight:0}}><PhotosWorkspace item={items[0]}/></div>
  <div data-testid="photos-sync-b" style={{display:'flex',minHeight:0}}><PhotosWorkspace item={items[1]}/></div>
 </main>;
}
