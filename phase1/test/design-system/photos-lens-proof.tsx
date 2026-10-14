import {useEffect,useState} from 'react';
import {addMediaFile,getMedia,setActiveMedia} from '../../src/lib/media';
import type {MediaItem} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import type {PhotoSettings} from '../../src/lib/photos/studioSettings';
import {PhotosWorkspace} from '../../src/components/photos/PhotosWorkspace';
import {EffectsPanel,DetailPanel} from '../../src/components/photos/panels/AdjustPanels';

/** Engine that really decodes the loaded source bytes: lens correction is visible in the preview itself. */
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
/** Gray field, a flat purple block (no interior edge), and a white square with a purple fringe column on its left edge. */
async function fringePng():Promise<Blob>{
 const w=240,h=160,c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d')!;
 ctx.fillStyle='rgb(128,128,128)';ctx.fillRect(0,0,w,h);
 ctx.fillStyle='rgb(180,0,180)';ctx.fillRect(20,20,20,12);
 ctx.fillStyle='rgb(240,240,240)';ctx.fillRect(160,45,70,70);
 ctx.fillStyle='rgb(200,0,200)';ctx.fillRect(160,45,1,70);
 return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('png encode failed')),'image/png'));
}

/** Real workspace plus the real effects and detail panels: vignette and defringe sliders drive the preprocess chain. */
export function PhotosLensProof(){
 const [item,setItem]=useState<MediaItem|null>(null);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(decodeEngine);
   if(!getMedia().items.some(i=>i.name==='lens-proof.png')){
    const added=await addMediaFile(await fringePng(),'lens-proof.png');
    if('error' in added)return;
   }
   const it=getMedia().items.find(i=>i.name==='lens-proof.png');
   if(!it)return;
   setActiveMedia(it.name);
   await openPhoto({name:it.name,url:it.url,mime:'image/png'});
   if(live)setItem(it);
  })();
  return()=>{live=false;};
 },[]);
 if(!item)return null;
 return <main data-testid="photos-lens-proof" style={{height:820,display:'flex',gap:8,padding:8}}>
  <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}><PhotosWorkspace key={item.name} item={item}/></div>
  <div style={{width:280,flexShrink:0,overflowY:'auto',display:'grid',gap:12,alignContent:'start'}}><EffectsPanel/><DetailPanel/></div>
 </main>;
}
