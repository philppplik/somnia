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
const hues=new Map<string,number>();
let currentHue=0;
function keyOf(buf:ArrayBuffer){const b=new Uint8Array(buf);let s=`${b.byteLength}:`;for(let i=0;i<Math.min(32,b.length);i++)s+=b[i].toString(16).padStart(2,'0');return s;}
async function pngOf(hue:number):Promise<Blob>{
 const f=frameOf(hue),c=document.createElement('canvas');c.width=f.width;c.height=f.height;
 const ctx=c.getContext('2d')!,img=ctx.createImageData(f.width,f.height);
 img.data.set(new Uint8ClampedArray(f.bytes));ctx.putImageData(img,0,0);
 const blob=await new Promise<Blob>((res,rej)=>c.toBlob(v=>v?res(v):rej(Error('toBlob failed')),'image/png'));
 hues.set(keyOf(await blob.arrayBuffer()),hue);
 return blob;
}
function fakeEngine():PhotoEngineLike{
 return{async load(bytes){currentHue=hues.get(keyOf(bytes))??0;return{id:0,ok:true,...frameOf(currentHue)};},async renderPhoto(){return{id:0,ok:true,...frameOf(currentHue)};},async exportPhoto(){return{id:0,ok:true,...frameOf(currentHue)};},dispose(){}};
}

/** Real workspace driven by the media store like PhotosCanvas does: three real PNG photos, the filmstrip switches the active one. */
export function PhotosFilmstripProof(){
 const media=useMedia();
 useEffect(()=>{
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   for(let i=0;i<3;i++){const n=`strip-${i+1}.png`;if(!getMedia().items.some(it=>it.name===n))await addMediaFile(await pngOf(i),n);}
   setActiveMedia('strip-1.png');
  })();
 },[]);
 const item=media.items.find(i=>i.name===media.active&&i.kind==='image');
 if(!item)return null;
 return <main data-testid="photos-filmstrip-proof" style={{height:820,display:'flex',flexDirection:'column'}}><PhotosWorkspace key={item.name} item={item}/></main>;
}
