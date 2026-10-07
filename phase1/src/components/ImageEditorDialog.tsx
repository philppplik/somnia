import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {Button} from './ui/button';
import {ImageEditorViewport} from './ImageEditorViewport';
import {TransformPanel} from './imgedit/TransformPanel';
import {AdjustPanel} from './imageedit/AdjustPanel';
import {useT} from '../lib/useT';
import {
 ImageEditorRenderer,createOperationRegistry,exportImage,exportSettings,loadImage,withOperations,
 type ExportFormat,type ImageOperation,type LoadedImage
} from '../lib/image-editor';
import {TRANSFORM_HANDLERS} from '../lib/imgedit/handlers';
import type {AspectPreset,CropRect} from '../lib/imgedit/transform';
import {DEFAULT_ADJUST_PARAMS,adjustHandler,adjustToJson,isNeutralAdjust,type AdjustParams} from '../lib/imageedit/adjust';
import {defaultImageHost,editedName,type ImageEditorHost} from '../lib/imageEditorHost';
import '../styles/image-editor-dialog.css';

interface Snapshot{stack:readonly ImageOperation[];adjust:AdjustParams}
const EMPTY:Snapshot={stack:[],adjust:DEFAULT_ADJUST_PARAMS};
const ADJUST_ID='adjust-live';
const MAX_HISTORY=100;
function buildRegistry(){const r=createOperationRegistry();for(const h of TRANSFORM_HANDLERS)r.register(h);r.register(adjustHandler);return r;}
/** Image size after the transform stack, without pixel work. */
function sizeAfter(width:number,height:number,stack:readonly ImageOperation[]){
 let size={width,height};
 for(const op of stack){if(!op.enabled)continue;const h=TRANSFORM_HANDLERS.find(x=>x.type===op.type);if(h)size=h.outputSize(size.width,size.height,op.params);}
 return size;}
/** Modal image editor: crop, resize, rotate, flip and adjust a copy of one image. The source file is never changed. */
export function ImageEditorDialog({host:injected}:{host?:ImageEditorHost}){
 const {t}=useT();
 const [open,setOpen]=useState(false);
 const [source,setSource]=useState<{loaded:LoadedImage;renderer:ImageEditorRenderer;name:string}|null>(null);
 const [snap,setSnap]=useState<Snapshot>(EMPTY);const [past,setPast]=useState<Snapshot[]>([]);const [future,setFuture]=useState<Snapshot[]>([]);
 const [frame,setFrame]=useState<HTMLCanvasElement|null>(null);const [backend,setBackend]=useState('');
 const [cropRect,setCropRect]=useState<CropRect|null>(null);const [aspect,setAspect]=useState<AspectPreset>('free');
 const [format,setFormat]=useState<ExportFormat>('png');const [quality,setQuality]=useState(92);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [status,setStatus]=useState('');
 const hostRef=useRef<ImageEditorHost|null>(injected??null);const registry=useMemo(buildRegistry,[]);
 const adjustBase=useRef<Snapshot|null>(null);const generation=useRef(0);const current=useRef(source);current.current=source;
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('somnia:edit-image',show);return()=>window.removeEventListener('somnia:edit-image',show);},[]);
 const release=useCallback(()=>{const s=current.current;if(s){s.renderer.dispose();s.loaded.dispose();}},[]);
 useEffect(()=>()=>release(),[release]);
 const doc=useMemo(()=>{
  if(!source)return null;
  const ops=[...snap.stack];
  if(!isNeutralAdjust(snap.adjust))ops.push({id:ADJUST_ID,type:'adjust',version:1,enabled:true,params:adjustToJson(snap.adjust)});
  return withOperations(source.loaded.document,ops);
 },[source,snap]);
 useEffect(()=>{
  if(!source||!doc)return;
  const ac=new AbortController();
  void source.renderer.render(doc,{preview:true,signal:ac.signal}).then(r=>{if(ac.signal.aborted)return;setFrame(r.canvas);setBackend(r.backend);setError('');}).catch(e=>{if(!ac.signal.aborted)setError(e instanceof Error?e.message:String(e));});
  return()=>ac.abort();
 },[source,doc]);
 const commit=(next:Snapshot)=>{setPast(p=>[...p.slice(-(MAX_HISTORY-1)),snap]);setFuture([]);setSnap(next);};
 const undo=()=>{adjustBase.current=null;const prev=past[past.length-1];if(!prev)return;setPast(p=>p.slice(0,-1));setFuture(f=>[snap,...f]);setSnap(prev);setCropRect(null);};
 const redo=()=>{adjustBase.current=null;const next=future[0];if(!next)return;setFuture(f=>f.slice(1));setPast(p=>[...p,snap]);setSnap(next);setCropRect(null);};
 const openFile=async()=>{
  if(busy)return;setBusy(true);setError('');setStatus('');
  const id=++generation.current;
  try{
   hostRef.current??=await defaultImageHost();
   const picked=await hostRef.current.pick();if(!picked||id!==generation.current)return;
   const loaded=await loadImage(picked.blob,picked.name);
   if(id!==generation.current){loaded.dispose();return;}
   release();
   setSource({loaded,renderer:new ImageEditorRenderer(loaded,registry),name:picked.name});
   setSnap(EMPTY);setPast([]);setFuture([]);setCropRect(null);setAspect('free');setFrame(null);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 };
 const save=async()=>{
  if(!source||!doc||busy)return;setBusy(true);setError('');setStatus('');
  try{
   const {extension}=exportSettings({format});
   const blob=await exportImage(source.renderer,doc,{format,quality:quality/100});
   hostRef.current??=await defaultImageHost();
   const saved=await hostRef.current.save(blob,editedName(source.name,extension));
   setStatus(saved?t('imageeditor.saved'):'');
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 };
 const close=()=>{if(busy)return;generation.current++;release();setSource(null);setFrame(null);setSnap(EMPTY);setPast([]);setFuture([]);setError('');setStatus('');setOpen(false);};
 const base=source?source.loaded.document.source:null;
 const size=base?sizeAfter(base.width,base.height,snap.stack):{width:1,height:1};
 const addOp=(op:ImageOperation)=>{commit({...snap,stack:[...snap.stack,op]});setCropRect(null);setAspect('free');};
 return <Dialog open={open} onOpenChange={v=>{if(!v)close();}}><DialogContent className="export-popup image-editor-dialog" aria-label={t('imageeditor.title')}>
  <header className="export-head"><DialogTitle>{t('imageeditor.title')}</DialogTitle><DialogDescription>{t('imageeditor.desc')}</DialogDescription></header>
  <div className="image-editor-body">
   <div className="image-editor-stage" data-testid="image-editor-stage">
    {source?<ImageEditorViewport image={frame}/>:<p className="image-editor-empty">{t('imageeditor.empty')}</p>}
   </div>
   <aside className="image-editor-side" aria-label={t('imageeditor.tools')}>
    {source&&<>
     <TransformPanel width={size.width} height={size.height} cropRect={cropRect} aspect={aspect} disabled={busy}
      onAspectChange={(a,r)=>{setAspect(a);setCropRect(r);}} onCropRectChange={setCropRect} onCommit={addOp}/>
     <AdjustPanel params={snap.adjust} disabled={busy} onChange={a=>{adjustBase.current??=snap;setSnap(x=>({...x,adjust:a}));}} onCommit={()=>{const base=adjustBase.current;adjustBase.current=null;if(base){setPast(p=>[...p.slice(-(MAX_HISTORY-1)),base]);setFuture([]);}}}/>
    </>}
   </aside>
  </div>
  {error&&<p role="alert" className="export-error">{error}</p>}
  {status&&<p role="status" className="image-editor-note">{status}</p>}
  {source&&<p className="image-editor-note">{size.width} x {size.height} px · {backend==='webgl2'?t('imageeditor.gpu'):t('imageeditor.cpu')}</p>}
  <footer className="export-foot image-editor-foot">
   <Button disabled={busy} onClick={()=>void openFile()}>{source?t('imageeditor.openOther'):t('imageeditor.open')}</Button>
   {source&&<>
    <Button disabled={busy||!past.length} onClick={undo}>{t('imageeditor.undo')}</Button>
    <Button disabled={busy||!future.length} onClick={redo}>{t('imageeditor.redo')}</Button>
    <label className="image-editor-format">{t('imageeditor.format')}<select value={format} disabled={busy} onChange={e=>setFormat(e.target.value as ExportFormat)}><option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option></select></label>
    {format!=='png'&&<label className="image-editor-format">{t('imageeditor.quality')} {quality}%<input type="range" min={10} max={100} value={quality} disabled={busy} onChange={e=>setQuality(Number(e.target.value))}/></label>}
   </>}
   <Button disabled={busy} onClick={close}>{t('imageeditor.close')}</Button>
   {source&&<Button variant="primary" disabled={busy} onClick={()=>void save()}>{busy?t('imageeditor.working'):t('imageeditor.save')}</Button>}
  </footer>
 </DialogContent></Dialog>;
}
