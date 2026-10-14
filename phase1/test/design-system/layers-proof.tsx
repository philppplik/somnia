import {useEffect,useState} from 'react';
import {addMediaFile,setActiveMedia} from '../../src/lib/media';
import {patchState} from '../../src/store/appStore';
import {RasterEditorProvider,RasterToolbar,RasterRightPanel} from '../../src/components/RasterEditor';
import {LayersPanel} from '../../src/components/LayersPanel';
import type {ImageEditorHost} from '../../src/lib/imageEditorHost';

const host={async save(){return true},async pick(){return null}} as unknown as ImageEditorHost;

/** Real migrated layers surfaces: raster toolbar (format/quality), inspector tabs, and the design layers tree. */
export function LayersProof(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  let live=true;
  void(async()=>{
   const cv=document.createElement('canvas');cv.width=64;cv.height=48;
   const ctx=cv.getContext('2d')!;ctx.fillStyle='#8855ee';ctx.fillRect(0,0,64,48);ctx.fillStyle='#226688';ctx.fillRect(8,8,24,18);
   const blob=await new Promise<Blob>(r=>cv.toBlob(b=>r(b!),'image/png'));
   const added=await addMediaFile(blob,'proof.png');
   if('error' in added)return;
   if(live)setReady(true);
  })();
  return()=>{live=false;};
 },[]);
 if(!ready)return null;
 return <main data-testid="layers-proof"><h1>Layers DS adoption</h1><p>Actual raster toolbar and inspector tabs; every control renders through native control primitives.</p>
  <RasterEditorProvider host={host}>
   <div data-testid="raster-toolbar"><RasterToolbar/></div>
   <RasterRightPanel/>
  </RasterEditorProvider></main>;
}

/** Design layers tree with a fabricated node set (no active media, so the context domain is web). */
export function LayersTreeProof(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  setActiveMedia(null);
  patchState({coreConnected:true,designFile:'proof.html',activeFile:'proof.html',nodes:[
   {id:'n1',tag:'div',attrs:{id:'hero'},children:[{id:'n2',tag:'h1',attrs:{},children:[],from:0,to:0,contentFrom:0,contentTo:0,locked:false,hidden:false}],from:0,to:0,contentFrom:0,contentTo:0,locked:false,hidden:false},
   {id:'n3',tag:'p',attrs:{class:'lede'},children:[],from:0,to:0,contentFrom:0,contentTo:0,locked:true,hidden:false},
  ]});
  setReady(true);
 },[]);
 if(!ready)return null;
 return <main data-testid="layers-tree-proof"><h1>Design layers DS adoption</h1><p>Actual design layers tree (filter input, drag label, context menu); every control renders through native control primitives.</p>
  <LayersPanel/></main>;
}
