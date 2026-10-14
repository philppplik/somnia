import {useEffect,useState} from 'react';
import {addMediaFile,getMedia,setActiveMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';
import {HslPanel} from '../../src/components/photos/panels/HslPanel';

/** Engine that really decodes the loaded source bytes: a mixed (pre-processed) source visibly changes the preview. */
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
function hslToRgb(h:number,s:number,l:number):[number,number,number]{
 const c=(1-Math.abs(2*l-1))*s,hp=(((h%360)+360)%360)/60,x=c*(1-Math.abs(hp%2-1)),m=l-c/2;
 const seg=Math.floor(hp)%6;
 const[rn,gn,bn]=seg===0?[c,x,0]:seg===1?[x,c,0]:seg===2?[0,c,x]:seg===3?[0,x,c]:seg===4?[x,0,c]:[c,0,x];
 return[Math.round((rn+m)*255),Math.round((gn+m)*255),Math.round((bn+m)*255)];
}
/** Horizontal hue sweep 0..360 at s=0.6, l=0.5: every column is one hue, muted enough for boosts to show. */
async function sweepPng():Promise<Blob>{
 const c=document.createElement('canvas');c.width=240;c.height=160;
 const ctx=c.getContext('2d');if(!ctx)throw Error('no 2d');
 for(let x=0;x<240;x++){const[r,g,b]=hslToRgb((x/239)*360,0.6,0.5);ctx.fillStyle=`rgb(${r},${g},${b})`;ctx.fillRect(x,0,1,160);}
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}
/** Uniform mid gray, identical to the heal/grad/rad/curves proofs: the parity capture compares this pristine canvas across worktrees. */
async function grayPng():Promise<Blob>{
 const c=document.createElement('canvas');c.width=240;c.height=160;
 const ctx=c.getContext('2d');if(!ctx)throw Error('no 2d');
 ctx.fillStyle='rgb(120,120,120)';ctx.fillRect(0,0,240,160);
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}

/** Real PhotosWorkspace plus the real mixer panel: band sliders reshape the hue sweep, one undo per drag. */
export function PhotosHslProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(decodeEngine);
   if(!getMedia().items.some(i=>i.name==='hsl-proof.png')){const a=await addMediaFile(await sweepPng(),'hsl-proof.png');if('error' in a)return;}
   if(!getMedia().items.some(i=>i.name==='hsl-gray.png')){const a=await addMediaFile(await grayPng(),'hsl-gray.png');if('error' in a)return;}
   const gray=new URLSearchParams(location.search).has('gray');
   const it=getMedia().items.find(i=>i.name===(gray?'hsl-gray.png':'hsl-proof.png'));
   if(!it)return;
   setActiveMedia(it.name);
   await openPhoto({name:it.name,url:it.url,mime:'image/png'});
   if(live)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-hsl-proof" style={{height:820,display:'flex',gap:8,padding:8}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><PhotosWorkspace item={item}/></div>
  <div style={{width:280,flexShrink:0,overflowY:'auto'}}><HslPanel/></div>
 </main>;
}
