import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {X} from '../lib/icons';
import {convertImage,downloadConvertedImage,loadConversionImage,IMAGE_CONVERSION_ACCEPT} from '../lib/imageConversion';
import type {ConvertedImage,ImageFormat,ImageSize} from '../lib/imageConversion';
import '../styles/image-conversion.css';
/** Independent utility: conversion does not mutate the current project or overwrite its source. */
export function ImageConversionDialog(){
 const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[size,setSize]=useState<ImageSize|null>(null);
 const [width,setWidth]=useState(''),[height,setHeight]=useState(''),[lock,setLock]=useState(true),[format,setFormat]=useState<ImageFormat>('png');
 const [quality,setQuality]=useState(92),[background,setBackground]=useState('#ffffff'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [result,setResult]=useState<ConvertedImage|null>(null),[preview,setPreview]=useState('');const generation=useRef(0);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('somnia:convert-image',show);return()=>window.removeEventListener('somnia:convert-image',show);},[]);
 useEffect(()=>{if(!result)return;const url=URL.createObjectURL(result.blob);setPreview(url);return()=>URL.revokeObjectURL(url);},[result]);
 const resetResult=()=>{setResult(null);setPreview('');setError('');};
 const choose=async(next:File|undefined)=>{const id=++generation.current;resetResult();setFile(next??null);setSize(null);if(!next)return;setBusy(true);try{const loaded=await loadConversionImage(next);loaded.dispose();if(id!==generation.current)return;setSize(loaded.size);setWidth(String(loaded.size.width));setHeight(String(loaded.size.height));}catch(e){if(id===generation.current)setError(e instanceof Error?e.message:String(e));}finally{if(id===generation.current)setBusy(false);}};
 const dimension=(axis:'width'|'height',v:string)=>{resetResult();if(axis==='width')setWidth(v);else setHeight(v);if(lock&&size&&Number(v)>0){if(axis==='width')setHeight(String(Math.max(1,Math.round(Number(v)*size.height/size.width))));else setWidth(String(Math.max(1,Math.round(Number(v)*size.width/size.height))));}};
 const run=async()=>{if(!file)return;resetResult();setBusy(true);try{setResult(await convertImage(file,file.name,{format,width:Number(width),height:Number(height),quality:quality/100,background}));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const close=()=>{if(busy)return;generation.current++;setOpen(false);setFile(null);setSize(null);resetResult();};
 return <Dialog open={open} onOpenChange={v=>{if(!v)close();}}><DialogContent className="export-popup image-conversion" aria-label="Convert image">
  <header className="export-head"><DialogTitle>Convert image</DialogTitle><DialogDescription>PNG, JPEG, WebP and standalone SVG. All processing stays on this device.</DialogDescription><button className="export-close" aria-label="Close image conversion" disabled={busy} onClick={close}><X size={16}/></button></header>
  <div className="export-body">
   <label className="image-conversion-file">Source image<input type="file" accept={IMAGE_CONVERSION_ACCEPT} disabled={busy} onChange={e=>void choose(e.target.files?.[0])}/></label>
   {size&&<p className="image-conversion-note">Original: {size.width} x {size.height} px. The source file stays unchanged.</p>}
   <fieldset disabled={busy||!size} className="image-conversion-fields"><legend className="sr-only">Conversion options</legend>
    <label>Output format<select value={format} onChange={e=>{setFormat(e.target.value as ImageFormat);resetResult();}}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
    <div className="image-conversion-size"><label>Width (px)<input type="number" min="1" max="8192" step="1" value={width} onChange={e=>dimension('width',e.target.value)}/></label><label>Height (px)<input type="number" min="1" max="8192" step="1" value={height} onChange={e=>dimension('height',e.target.value)}/></label></div>
    <label className="image-conversion-lock"><input type="checkbox" checked={lock} onChange={e=>{setLock(e.target.checked);resetResult();if(e.target.checked&&size&&Number(width)>0)setHeight(String(Math.max(1,Math.round(Number(width)*size.height/size.width))));}}/>Keep original proportions</label>
    {format!=='png'&&<label>Quality ({quality}%)<input type="range" min="1" max="100" value={quality} onChange={e=>{setQuality(Number(e.target.value));resetResult();}}/></label>}
    {format==='jpeg'&&<label>Background for transparency<input type="color" value={background} onChange={e=>{setBackground(e.target.value);resetResult();}}/></label>}
   </fieldset>
   <p className="image-conversion-note">25 MB source limit. Up to 8192 px per side and 32 million pixels. SVG external resources, embedded images and animation are not supported. Animated raster images become a single frame; metadata is not retained.</p>
   {error&&<p role="alert" className="export-error">{error}</p>}
   {result&&<div className="image-conversion-result"><img src={preview} alt="Converted image preview"/><p role="status">{result.filename} · {result.width} x {result.height} px · {(result.blob.size/1024).toFixed(1)} KB</p></div>}
  </div>
  <footer className="export-foot"><Button disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy||!size} onClick={()=>void run()}>{busy?'Processing...':'Convert'}</Button>{result&&<Button variant="primary" onClick={()=>downloadConvertedImage(result)}>Download</Button>}</footer>
 </DialogContent></Dialog>;
}
