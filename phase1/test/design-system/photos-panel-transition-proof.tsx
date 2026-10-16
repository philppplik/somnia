import {useEffect,useState} from 'react';
import {addMediaFile,getMedia,setActiveMedia} from '../../src/lib/media';
import {openPhoto,setPhotoEngineFactory} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import {LightPanel} from '../../src/components/photos/panels/AdjustPanels';

function frame(){const w=240,h=150,b=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;b[i]=Math.round(40+180*(x/w));b[i+1]=Math.round(50+140*(y/h));b[i+2]=140;b[i+3]=255;}
 return{bytes:b.buffer as ArrayBuffer,width:w,height:h};}
async function png():Promise<Blob>{
 const f=frame(),c=document.createElement('canvas');c.width=f.width;c.height=f.height;
 const ctx=c.getContext('2d')!,img=ctx.createImageData(f.width,f.height);
 img.data.set(new Uint8ClampedArray(f.bytes));ctx.putImageData(img,0,0);
 return new Promise<Blob>((res,rej)=>c.toBlob(v=>v?res(v):rej(Error('toBlob failed')),'image/png'));
}
function fakeEngine():PhotoEngineLike{
 return{async load(){return{id:0,ok:true,...frame()};},async renderPhoto(){return{id:0,ok:true,...frame()};},async exportPhoto(){return{id:0,ok:true,...frame()};},dispose(){}};
}

/** The shell default mounts the Light panel before any photo exists: this drives exactly that empty -> photo
 * re-render of the same panel instance, which used to crash the studio on a hook-count change. */
export function PhotosPanelTransitionProof(){
 const [opening,setOpening]=useState(false);
 useEffect(()=>{setPhotoEngineFactory(fakeEngine);},[]);
 const open=async()=>{
  setOpening(true);
  if(!getMedia().items.some(i=>i.name==='panel-photo.png'))await addMediaFile(await png(),'panel-photo.png');
  setActiveMedia('panel-photo.png');
  const item=getMedia().items.find(i=>i.name==='panel-photo.png');
  if(item)await openPhoto(item);
 };
 return <main data-testid="photos-panel-transition-proof" className="grid w-72 gap-2 p-3">
  <LightPanel/>
  <button type="button" data-testid="open-photo" disabled={opening} onClick={()=>void open()}>open photo</button>
 </main>;
}
