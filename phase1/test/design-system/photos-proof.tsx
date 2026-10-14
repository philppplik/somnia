import {useEffect,useState} from 'react';
import {addMediaFile,getMedia} from '../../src/lib/media';
import {setPhotoEngineFactory,openPhoto,commitPhotoSettings} from '../../src/lib/photos/studioSession';
import type {PhotoEngineLike} from '../../src/lib/photos/studioSession';
import {setPhotoExportState} from '../../src/lib/photos/exportState';
import {PhotosInspector} from '../../src/components/photos/PhotosInspector';
import {HistoryPanel} from '../../src/components/photos/panels/HistoryPanel';
import {PresetsPanel} from '../../src/components/photos/panels/PresetsPanel';
import {PhotoExportPopover} from '../../src/components/photos/PhotoExportPopover';

const FRAME={bytes:new Uint8Array([120,80,40,255,120,80,40,255,120,80,40,255,120,80,40,255]).buffer as ArrayBuffer,width:2,height:2};
function fakeEngine():PhotoEngineLike{
 return{async load(){return{id:0,ok:true,...FRAME};},async renderPhoto(){return{id:0,ok:true,...FRAME};},async exportPhoto(){return{id:0,ok:true,...FRAME};},dispose(){}};
}
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

/** Real migrated photos panels on a stubbed-engine session: inspector sliders, history rows, preset name input and the export format select. */
export function PhotosProof(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   setPhotoEngineFactory(fakeEngine);
   const added=await addMediaFile(new Blob([PNG],{type:'image/png'}),'proof.png');
   if('error' in added)return;
   const item=getMedia().items.find(i=>i.name===added.name);
   if(!item)return;
   await openPhoto({name:item.name,url:item.url,mime:'image/png'});
   commitPhotoSettings(item.name,s=>({...s,exposure:1.5,contrast:20}));
   setPhotoExportState({open:true});
   if(live)setReady(true);
  })();
  return()=>{live=false;};
 },[]);
 if(!ready)return null;
 return <main data-testid="photos-proof"><h1>Photos DS adoption</h1><p>Actual photos panels on a stubbed-engine session; every control renders through native control primitives.</p>
  <span data-hero-id="photos.export.open">Export anchor</span>
  <PhotoExportPopover/>
  <PhotosInspector/>
  <HistoryPanel/>
  <PresetsPanel/></main>;
}
