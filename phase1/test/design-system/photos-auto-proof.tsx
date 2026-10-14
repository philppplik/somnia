import {useEffect,useState} from 'react';
import {addMediaFile,getMedia,setActiveMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';
import {LightPanel,ColorPanel} from '../../src/components/photos/panels/AdjustPanels';

/** Engine that really decodes the loaded source bytes, like the other preprocess proofs. */
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
/** Dark, warm-cast gradient: raised black floor, low white ceiling, red over blue - auto tone and auto WB both have work to do. */
async function castPng():Promise<Blob>{
 const w=240,h=160,c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d')!;
 for(let x=0;x<w;x++){
  const v=Math.round(40+(x/(w-1))*140); // 40..180: raised floor, low ceiling
  ctx.fillStyle=`rgb(${Math.min(255,v+50)},${v},${Math.max(0,v-30)})`; // warm cast
  ctx.fillRect(x,0,1,h);
 }
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}
/** Uniform mid gray, identical to the other proofs: the parity capture compares this pristine canvas across worktrees. */
async function grayPng():Promise<Blob>{
 const c=document.createElement('canvas');c.width=240;c.height=160;
 const ctx=c.getContext('2d')!;
 ctx.fillStyle='rgb(120,120,120)';ctx.fillRect(0,0,240,160);
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}

/** Real workspace plus the real Light and Color panels: the Auto buttons derive settings from the decoded frame. */
export function PhotosAutoProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(decodeEngine);
   if(!getMedia().items.some(i=>i.name==='auto-proof.png')){const a=await addMediaFile(await castPng(),'auto-proof.png');if('error' in a)return;}
   if(!getMedia().items.some(i=>i.name==='auto-gray.png')){const a=await addMediaFile(await grayPng(),'auto-gray.png');if('error' in a)return;}
   const gray=new URLSearchParams(location.search).has('gray');
   const it=getMedia().items.find(i=>i.name===(gray?'auto-gray.png':'auto-proof.png'));
   if(!it)return;
   setActiveMedia(it.name);
   await openPhoto({name:it.name,url:it.url,mime:'image/png'});
   if(live)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-auto-proof" style={{height:820,display:'flex',gap:8,padding:8}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><PhotosWorkspace item={item}/></div>
  <div style={{width:280,flexShrink:0,overflowY:'auto',display:'grid',gap:12,alignContent:'start'}}><LightPanel/><ColorPanel/></div>
 </main>;
}
