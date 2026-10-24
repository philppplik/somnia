import {useEffect,useState} from 'react';
import {addMediaFile,getMedia,setActiveMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';

/** Engine that really decodes the loaded source bytes: a brushed (pre-processed) source visibly changes the preview frame. */
function decodeEngine():PhotoEngineLike{
 let last:ArrayBuffer|null=null;
 async function frameOf(bytes:ArrayBuffer){
  const bmp=await createImageBitmap(new Blob([bytes]));
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
  const ctx=c.getContext('2d');if(!ctx)throw Error('no 2d');
  ctx.drawImage(bmp,0,0);bmp.close();
  const img=ctx.getImageData(0,0,c.width,c.height);
  return{id:0,ok:true,bytes:img.data.buffer as ArrayBuffer,width:c.width,height:c.height};
 }
 return{
  async load(bytes){last=bytes.slice(0);return frameOf(last);},
  async renderPhoto(_settings:PhotoSettings){return frameOf(last!);},
  async exportPhoto(){return frameOf(last!);},
  dispose(){}};
}
/** Flat mid-gray field: a brush stroke reads as a clean bright/dark patch with no texture noise. */
async function grayPng():Promise<Blob>{
 const w=240,h=160,c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d')!;ctx.fillStyle='rgb(128,128,128)';ctx.fillRect(0,0,w,h);
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}

/** Real PhotosWorkspace on a decoding-engine session: painting an adjustment-brush stroke changes the preview itself. */
export function PhotosBrushProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(decodeEngine);
   if(!getMedia().items.some(i=>i.name==='brush-proof.png')){
    const added=await addMediaFile(await grayPng(),'brush-proof.png');
    if('error' in added)return;
   }
   const it=getMedia().items.find(i=>i.name==='brush-proof.png');
   if(!it)return;
   setActiveMedia(it.name);
   await openPhoto({name:it.name,url:it.url,mime:'image/png'});
   if(live)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-brush-proof" style={{height:760,display:'flex',padding:8}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><PhotosWorkspace key={item.name} item={item}/></div>
 </main>;
}
