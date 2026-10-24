import {useEffect,useState} from 'react';
import {addMediaFile,getMedia,setActiveMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';
import {MaskPanel} from '../../src/components/photos/panels/MaskPanel';

/** Engine that really decodes the loaded source bytes: the masked source visibly changes the preview. */
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
/** Checker quadrants (black, dark gray, light gray, white) plus a saturated red square: the luma zones and the hue window both have visible targets. */
async function checkerPng():Promise<Blob>{
 const c=document.createElement('canvas');c.width=240;c.height=160;
 const ctx=c.getContext('2d')!;
 ctx.fillStyle='rgb(32,32,32)';ctx.fillRect(0,0,120,80); // near-black: the brush-style gain is multiplicative, pure black would never lift
 ctx.fillStyle='rgb(85,85,85)';ctx.fillRect(120,0,120,80);
 ctx.fillStyle='rgb(170,170,170)';ctx.fillRect(0,80,120,80);
 ctx.fillStyle='rgb(255,255,255)';ctx.fillRect(120,80,120,80);
 ctx.fillStyle='rgb(229,0,0)';ctx.fillRect(196,116,36,36);
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}
/** Uniform mid gray, identical to the other preprocess proofs: the parity capture compares this pristine canvas across worktrees. */
async function grayPng():Promise<Blob>{
 const c=document.createElement('canvas');c.width=240;c.height=160;
 const ctx=c.getContext('2d')!;
 ctx.fillStyle='rgb(120,120,120)';ctx.fillRect(0,0,240,160);
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}

/** Real PhotosWorkspace plus the real mask panel: zones reshape the luma window, the hue window narrows it, the overlay paints the weight map. */
export function PhotosMaskProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(decodeEngine);
   if(!getMedia().items.some(i=>i.name==='mask-proof.png')){const a=await addMediaFile(await checkerPng(),'mask-proof.png');if('error' in a)return;}
   if(!getMedia().items.some(i=>i.name==='mask-gray.png')){const a=await addMediaFile(await grayPng(),'mask-gray.png');if('error' in a)return;}
   const gray=new URLSearchParams(location.search).has('gray');
   const it=getMedia().items.find(i=>i.name===(gray?'mask-gray.png':'mask-proof.png'));
   if(!it)return;
   setActiveMedia(it.name);
   await openPhoto({name:it.name,url:it.url,mime:'image/png'});
   if(live)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-mask-proof" style={{height:820,display:'flex',gap:8,padding:8}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><PhotosWorkspace item={item}/></div>
  <div style={{width:280,flexShrink:0,overflowY:'auto'}}><MaskPanel/></div>
 </main>;
}
