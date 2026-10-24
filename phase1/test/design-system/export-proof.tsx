import {useEffect,useState} from 'react';
import {patchState} from '../../src/store/appStore';
import {ExportDialog} from '../../src/components/ExportDialog';
import {ImageConversionDialog} from '../../src/components/ImageConversionDialog';

/** Real project export dialog with a fabricated single-page project. */
export function ExportProof(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  patchState({projectName:'proof-project',designFile:'index.html',files:{'index.html':'<!doctype html><title>Proof</title><p>proof</p>'},exportDialog:true});
  setReady(true);
 },[]);
 if(!ready)return null;
 return <main data-testid="export-proof"><h1>Export DS adoption</h1><p>Actual project export dialog; every control renders through native control primitives.</p>
  <ExportDialog/></main>;
}

/** Real image conversion dialog, opened through its window event with a real PNG file. */
export function ConvertProof(){
 useEffect(()=>{
  void(async()=>{
   const cv=document.createElement('canvas');cv.width=64;cv.height=48;
   const ctx=cv.getContext('2d')!;ctx.fillStyle='#8855ee';ctx.fillRect(0,0,64,48);
   const blob=await new Promise<Blob>(r=>cv.toBlob(b=>r(b!),'image/png'));
   window.dispatchEvent(new CustomEvent('somnia:convert-image',{detail:new File([blob],'proof.png',{type:'image/png'})}));
  })();
 },[]);
 return <main data-testid="convert-proof"><h1>Image conversion DS adoption</h1><p>Actual image conversion dialog with a loaded source; every control renders through native control primitives.</p>
  <ImageConversionDialog/></main>;
}
