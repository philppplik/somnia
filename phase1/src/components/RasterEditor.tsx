import {DevelopPanel} from './photos/DevelopPanel';
import {effectiveWorkflow} from '../lib/projectSettingsIO';
import {registerRasterPhotoPort,notifyRasterPhotoChange,savePhotoCopy} from '../lib/agent/photoWorkspace';
import {LayerSession,type CraftLayerQuery} from '../lib/craft/layerSession';
import {CraftSelectionBridge} from '../lib/craft/selectionBridge';
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Button} from './ui/button';
import {EditorShell} from './EditorShell';
import {FileTabs} from './FileTabs';
import {ImageEditorViewport} from './ImageEditorViewport';
import {TransformPanel} from './imgedit/TransformPanel';
import {AdjustPanel} from './imageedit/AdjustPanel';
import {SelectionEditor} from './imgedit/SelectionEditor';
import {ImageHistory} from './imageedit/ImageHistory';
import {FilterPanel} from './imageedit/FilterPanel';
import {Image,MousePointer2,SlidersHorizontal,RotateCcw,Info,Layers,Copy,Eye,EyeOff,Undo2,Redo2,PanelLeft,PanelRight,X,Upload,FolderOpen} from '../lib/icons';
import {useT} from '../lib/useT';
import {ImageEditorRenderer,createOperationRegistry,exportImage,exportSettings,loadImage,withOperations,type ExportFormat,type ImageOperation,type LoadedImage} from '../lib/image-editor';
import {registerSelectionOps,type SelectionMask} from '../lib/imgedit/select';
import {jumpTo,removeOp,toggleOp} from '../lib/imageedit/historyView';
import {FILTER_TYPES,newFilterOperation,registerFilterOps,type FilterType} from '../lib/imageedit/filters';
import {TRANSFORM_HANDLERS} from '../lib/imgedit/handlers';
import type {AspectPreset,CropRect} from '../lib/imgedit/transform';
import {adjustHandler,adjustToJson,isNeutralAdjust} from '../lib/imageedit/adjust';
import {getState,patchState,useAppStore} from '../store/appStore';
import {createRasterState,rasterCommit,rasterDirty,rasterRedo,rasterSignature,rasterUndo,type RasterDocumentState,type RasterSnapshot} from '../store/rasterState';
import {isTauri} from '@tauri-apps/api/core';
import {defaultImageHost,webImageHost,editedName,type ImageEditorHost} from '../lib/imageEditorHost';
import {addMediaFile,closeMedia,getMedia,registerMediaCloseGuard,setActiveMedia,useMedia} from '../lib/media';
import {registerCommandScope,type Command} from '../lib/commands';
import '../styles/image-editor-dialog.css';

interface Source{loaded:LoadedImage;renderer:ImageEditorRenderer;url:string;originToken?:string;host?:ImageEditorHost;layerSession?:LayerSession}
function buildRegistry(){const r=createOperationRegistry();for(const h of TRANSFORM_HANDLERS)r.register(h);r.register(adjustHandler);registerFilterOps(r);registerSelectionOps(r);return r;}
function sizeAfter(width:number,height:number,stack:readonly ImageOperation[]){let size={width,height};for(const op of stack){if(!op.enabled)continue;const h=TRANSFORM_HANDLERS.find(x=>x.type===op.type);if(h)size=h.outputSize(size.width,size.height,op.params);}return size;}
interface RasterContextValue{layerQuery:CraftLayerQuery|null;startLayered:()=>Promise<void>;layerCommand:(command:'duplicate'|'visible'|'opacity'|'mask'|'clear-mask'|'undo'|'redo',index?:number,value?:boolean|number)=>Promise<void>;active:boolean;name:string|null;source:Source|null;frame:HTMLCanvasElement|null;frameRevision:number;docState:RasterDocumentState;busy:boolean;size:{width:number;height:number};backend:string;previewScale:number;cropRect:CropRect|null;aspect:AspectPreset;selectMode:boolean;selection:SelectionMask|null;format:ExportFormat;quality:number;optionsSlot:HTMLElement|null;
 setOptionsSlot:(node:HTMLDivElement|null)=>void;setCropRect:(r:CropRect|null)=>void;setAspect:(a:AspectPreset)=>void;selectionBackend:CraftSelectionBridge['select'];setSelection:(s:SelectionMask|null)=>void;setFormat:(f:ExportFormat)=>void;setQuality:(q:number)=>void;
 openFile:()=>Promise<void>;save:()=>Promise<void>;close:()=>void;undo:()=>void;redo:()=>void;toggleSelection:()=>void;commit:(next:RasterSnapshot)=>void;live:(next:RasterSnapshot)=>void;endLive:()=>void;jump:(i:number)=>void;addOp:(op:ImageOperation)=>void;}
const Context=createContext<RasterContextValue|null>(null);
export function useRasterEditor(){const c=useContext(Context);if(!c)throw Error('RasterEditorProvider is missing.');return c;}
const EMPTY_STATE=createRasterState();
const emptySize={width:1,height:1};
/** Owns source resources once per media tab. Intent/undo live in appStore.rasterDoc[fileId]. */
export function RasterEditorProvider({children,host:injected}:{children:ReactNode;host?:ImageEditorHost;layerSession?:LayerSession}){
 const {t}=useT();const app=useAppStore();const media=useMedia();
 const [requested,setRequested]=useState(false),[version,setVersion]=useState(0),[frame,setFrame]=useState<HTMLCanvasElement|null>(null),[backend,setBackend]=useState(''),[frameRevision,setFrameRevision]=useState(0),[previewScale,setPreviewScale]=useState(1);
 const [busy,setBusy]=useState(false),[cropRect,setCropRect]=useState<CropRect|null>(null),[aspect,setAspect]=useState<AspectPreset>('free'),[selection,setSelection]=useState<SelectionMask|null>(null);
 const [format,setFormat]=useState<ExportFormat>('png'),[quality,setQuality]=useState(92),[optionsSlot,setOptionsSlot]=useState<HTMLDivElement|null>(null);
 const registry=useMemo(buildRegistry,[]),sources=useRef(new Map<string,Source>()),grants=useRef(new Map<string,{originToken?:string;host:ImageEditorHost}>());
 const hostRef=useRef<ImageEditorHost|null>(injected??(isTauri()?null:webImageHost())),savingName=useRef<string|null>(null),liveBase=useRef<{name:string;snapshot:RasterSnapshot}|null>(null),mounted=useRef(true);
 const item=media.items.find(i=>i.name===media.active&&i.kind==='image');const name=item?.name??null;
 const active=!!item||(requested&&!media.active);const cached=name?sources.current.get(name):null;const source=cached?.url===item?.url?cached??null:null;
 const docState=name?app.rasterDoc[name]??EMPTY_STATE:EMPTY_STATE;const snap=docState.now;const selectMode=app.editorTool==='selection';
 const notice=(message:string)=>patchState({notice:message});
 const selectionBridge=useRef<CraftSelectionBridge|null>(null);
 useEffect(()=>()=>{selectionBridge.current?.dispose();selectionBridge.current=null;},[]);
 const update=(key:string,fn:(d:RasterDocumentState)=>RasterDocumentState)=>{const all=getState().rasterDoc;patchState({rasterDoc:{...all,[key]:fn(all[key]??createRasterState())}});};
 const dirty=(key:string)=>{const d=getState().rasterDoc[key];return !!d&&rasterDirty(d);};
 const confirmDiscard=(key:string)=>!dirty(key)||window.confirm(t('imageeditor.discardPrompt',{name:key}));
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const s of sources.current.values()){s.renderer.dispose();s.loaded.dispose();s.layerSession?.dispose();}sources.current.clear();};},[]);
 useEffect(()=>{const show=()=>{setRequested(true);const m=getMedia();const image=m.items.find(i=>i.name===m.active&&i.kind==='image');if(!image)setActiveMedia(null);patchState({sidebarOpen:true,inspectorOpen:true});};window.addEventListener('somnia:edit-image',show);return()=>window.removeEventListener('somnia:edit-image',show);},[]);
 useEffect(()=>registerMediaCloseGuard(key=>savingName.current!==key&&confirmDiscard(key)),[busy]);
 useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(Object.values(getState().rasterDoc).some(rasterDirty)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[]);
 useEffect(()=>{patchState({editorKind:active?'raster':null});},[active]);
 useEffect(()=>{for(const [key,s] of sources.current){if(!media.items.some(i=>i.name===key&&i.url===s.url)){s.renderer.dispose();s.loaded.dispose();s.layerSession?.dispose();sources.current.delete(key);const all={...getState().rasterDoc};delete all[key];patchState({rasterDoc:all});}}},[media.items]);
 useEffect(()=>{
  setFrame(null);setCropRect(null);setSelection(null);setAspect('free');endLive();
  if(!item||source)return;
  const ac=new AbortController();
  void fetch(item.url,{signal:ac.signal}).then(r=>r.blob()).then(blob=>loadImage(blob,item.name,ac.signal)).then(loaded=>{
   if(!mounted.current||ac.signal.aborted){loaded.dispose();return;}
   const grant=grants.current.get(item.url);
   sources.current.set(item.name,{loaded,renderer:new ImageEditorRenderer(loaded,registry,notice),url:item.url,...grant});
   update(item.name,d=>d);setVersion(v=>v+1);
  }).catch(e=>{if(!ac.signal.aborted)notice(e instanceof Error?e.message:String(e));});
  return()=>ac.abort();
 },[item?.url,name]);
 const doc=useMemo(()=>{if(!source)return null;const ops=[...snap.stack];if(!isNeutralAdjust(snap.adjust))ops.push({id:`adjust-live-${snap.stack.length}`,type:'adjust',version:1,enabled:true,params:adjustToJson(snap.adjust)});if(snap.filter)ops.push(snap.filter);return withOperations(source.loaded.document,ops);},[source,snap,version]);
 useEffect(()=>{if(!source||!doc||source.layerSession)return;const ac=new AbortController();void source.renderer.render(doc,{preview:!selectMode,signal:ac.signal}).then(r=>{if(!ac.signal.aborted){setFrame(r.canvas);setFrameRevision(v=>v+1);setBackend(r.backend);setPreviewScale(r.previewScale??1);}}).catch(e=>{if(!ac.signal.aborted)notice(e instanceof Error?e.message:String(e));});return()=>ac.abort();},[source,doc,selectMode]);
 const commit=(next:RasterSnapshot)=>{if(source?.layerSession)return;if(name){liveBase.current=null;update(name,d=>rasterCommit(d,next));}};
 const live=(next:RasterSnapshot)=>{if(source?.layerSession||!name)return;liveBase.current??={name,snapshot:getState().rasterDoc[name].now};update(name,d=>({...d,now:next}));};
 const endLive=()=>{const base=liveBase.current;liveBase.current=null;if(base)update(base.name,d=>rasterSignature(base.snapshot)===rasterSignature(d.now)?d:{...d,past:[...d.past.slice(-99),base.snapshot],future:[]});};
 const undo=()=>{if(source?.layerSession){void layerCommand('undo');return;}endLive();if(name)update(name,rasterUndo);setSelection(null);setCropRect(null);};
 const redo=()=>{if(source?.layerSession){void layerCommand('redo');return;}endLive();if(name)update(name,rasterRedo);setSelection(null);setCropRect(null);};
 const openFile=async()=>{if(busy)return;setBusy(true);try{hostRef.current??=await defaultImageHost();const picked=await hostRef.current.pick();if(!picked)return;const result=await addMediaFile(picked.blob,picked.name);if('error' in result){notice(result.error);return;}const it=getMedia().items.find(i=>i.name===result.name)!;grants.current.set(it.url,{originToken:picked.originToken,host:hostRef.current});setRequested(false);patchState({sidebarOpen:true,inspectorOpen:true});}catch(e){notice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const save=async()=>{if(!source||!doc||!name||busy)return;endLive();setBusy(true);savingName.current=name;const signature=rasterSignature(snap);try{const {extension}=exportSettings({format});const composite=source.layerSession?await source.layerSession.render():null;const blob=composite?await encodeComposite(composite,format,quality/100):await exportImage(source.renderer,doc,{format,quality:quality/100});hostRef.current??=await defaultImageHost();const host=source.host??hostRef.current;let saved=false;
  if(effectiveWorkflow().imageSaveMode==='overwrite'&&host.overwrite&&source.originToken){const r=await host.overwrite(blob,source.originToken,extension);saved=r==='saved';if(saved)notice(t('imageeditor.savedOverwrite'));}
  if(!saved){saved=await host.save(blob,editedName(name,extension));if(saved)notice(t('imageeditor.saved'));}
  if(saved){source.layerSession?.markSaved();update(name,d=>({...d,saved:signature,layerDirty:false}));}
 }catch(e){notice(e instanceof Error?e.message:String(e));}finally{savingName.current=null;setBusy(false);}};
 const refreshLayer=async(key:string,s:Source)=>{const frame=await s.layerSession!.render();if(!mounted.current||sources.current.get(key)!==s)return;update(key,d=>({...d,layerDirty:s.layerSession!.dirty}));if(getMedia().active===key){setFrame(frame);setFrameRevision(v=>v+1);setPreviewScale(1);setVersion(v=>v+1);}};
 const startLayered=async()=>{if(!source||!name||!frame||busy)return;if(snap.stack.length||snap.filter||!isNeutralAdjust(snap.adjust)){notice('Start layers only from a pristine raster. Existing edits will not be baked into a fake adjustment layer.');return;}if(size.width*size.height>1_048_576){notice('Layer documents are limited to 1 MP until tiled storage is ready.');return;}setBusy(true);try{const original=await source.renderer.render(doc!,{preview:false});source.layerSession=await LayerSession.open(original.canvas);patchState({editorTool:'pan',editorPanel:{...getState().editorPanel,right:'layers'}});await refreshLayer(name,source);}catch(e){notice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const layerCommand=async(command:'duplicate'|'visible'|'opacity'|'mask'|'clear-mask'|'undo'|'redo',index?:number,value?:boolean|number)=>{if(!source?.layerSession||!name||busy)return;setBusy(true);try{const bytes=command==='mask'&&selection?new Uint8Array(selection.data.map(v=>v*255)).buffer:undefined;if(command==='mask'&&!bytes)throw Error('Select pixels before creating a layer mask.');await source.layerSession.command(command,index,value,bytes);await refreshLayer(name,source);}catch(e){notice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 useEffect(()=>{if(source?.layerSession&&name)void refreshLayer(name,source).catch(e=>notice(e instanceof Error?e.message:String(e)));},[name,source]);
 const close=()=>{if(busy)return;if(name)closeMedia(name);else setRequested(false);};
 const jump=(i:number)=>{endLive();if(name)update(name,d=>{const r=jumpTo(d.past,d.now,d.future,i);return r?{...d,now:r.now as RasterSnapshot,past:r.past as RasterSnapshot[],future:r.future as RasterSnapshot[]}:d;});setCropRect(null);setSelection(null);};
 const addOp=(op:ImageOperation)=>{setSelection(null);commit({...snap,stack:[...snap.stack,op]});setCropRect(null);setAspect('free');};
 // Stable scope resolver reads the current context, never stale snapshots. Shared menu/palette/shortcuts route here.
 const actions=useRef({active,name,busy,docState,source,openFile,save,close,undo,redo,commit,snap});actions.current={active,name,busy,docState,source,openFile,save,close,undo,redo,commit,snap};
 useEffect(()=>registerCommandScope(id=>{const a=actions.current;if(!a.active)return;const commands:Record<string,Command>={
  'edit.undo':{id:'edit.undo',title:t('imageeditor.undo'),category:'Edit',shortcut:'Mod+Z',enabled:()=>!a.busy&&!!(a.source?.layerSession?.query?.undo??a.docState.past.length),run:a.undo},
  'edit.redo':{id:'edit.redo',title:t('imageeditor.redo'),category:'Edit',shortcut:'Mod+Shift+Z',enabled:()=>!a.busy&&!!(a.source?.layerSession?.query?.redo??a.docState.future.length),run:a.redo},
  'project.save':{id:'project.save',title:t('imageeditor.save'),category:'Project',shortcut:'Mod+S',allowInInput:true,enabled:()=>!a.busy&&!!a.source,run:a.save},
  'tab.close':{id:'tab.close',title:t('imageeditor.close'),category:'View',shortcut:'Mod+W',enabled:()=>!a.busy,run:a.close},
  'tools.editImage':{id:'tools.editImage',title:t('imageeditor.openOther'),category:'Tools',enabled:()=>!a.busy,run:a.openFile},
 };return commands[id];}),[t]);
 const photoActions=useRef({selection,busy});photoActions.current={selection,busy};
 useEffect(()=>registerRasterPhotoPort(key=>{
  const src=sources.current.get(key),state=getState().rasterDoc[key];if(!src||!state)return null;
  const now=state.now,ops=[...now.stack];if(!isNeutralAdjust(now.adjust))ops.push({id:`adjust-live-${now.stack.length}`,type:'adjust',version:1,enabled:true,params:adjustToJson(now.adjust)});if(now.filter)ops.push(now.filter);
  const document={...withOperations(src.loaded.document,ops),revision:ops.length};
  return {sourceURL:src.url,document,renderer:src.renderer,state,busy:photoActions.current.busy||!!liveBase.current,layered:!!src.layerSession,selection:getMedia().active===key&&!!photoActions.current.selection,
   commit:next=>{update(key,d=>rasterCommit(d,next));setSelection(null);setCropRect(null);},undo:()=>{update(key,rasterUndo);setSelection(null);setCropRect(null);},
   saveCopy:async()=>{const signature=rasterSignature(state.now);savingName.current=key;setBusy(true);try{
    const job=new ImageEditorRenderer(src.loaded,registry);let blob:Blob;try{blob=await exportImage(job,document,{format:'png'});}finally{job.dispose();}
    if(sources.current.get(key)!==src||rasterSignature(getState().rasterDoc[key].now)!==signature)throw Error('Photo changed during export. Review again.');
    hostRef.current??=await defaultImageHost();const saved=await (src.host??hostRef.current).save(blob,editedName(key.replace(/^.*[\\/]/,''),'png'));
    if(saved&&sources.current.get(key)===src&&rasterSignature(getState().rasterDoc[key].now)===signature)update(key,d=>({...d,saved:signature}));return saved;
   }finally{savingName.current=null;setBusy(false);}}
  };
 }),[]);
 useEffect(()=>{notifyRasterPhotoChange();},[version,selection,busy]);
 const size=source?sizeAfter(source.loaded.document.source.width,source.loaded.document.source.height,snap.stack):emptySize;
 const value:RasterContextValue={layerQuery:source?.layerSession?.query??null,startLayered,layerCommand,active,name,source,frame,frameRevision,docState,busy,size,backend,previewScale,cropRect,aspect,selectMode,selection,format,quality,optionsSlot,selectionBackend:(image,tool,points,tolerance)=>{selectionBridge.current??=new CraftSelectionBridge(notice);return selectionBridge.current.select(image,tool,points,tolerance);},setOptionsSlot,setCropRect,setAspect,setSelection,setFormat,setQuality,openFile,save,close,undo,redo,toggleSelection:()=>{setSelection(null);patchState({editorTool:selectMode?'pan':'selection'});},commit,live,endLive,jump,addOp};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
function ToolButton({label,onClick,disabled,pressed,children,testId}:{label:string;onClick:()=>void;disabled?:boolean;pressed?:boolean;children:ReactNode;testId?:string}){return <Button size="icon" data-testid={testId} title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</Button>;}
export function RasterToolbar(){const c=useRasterEditor();const {t}=useT();return <>
 <ToolButton label={c.source?t('imageeditor.openOther'):t('imageeditor.open')} disabled={c.busy} onClick={()=>void c.openFile()}><FolderOpen/></ToolButton>
 <ToolButton label={t('imageeditor.undo')} disabled={c.busy||!(c.layerQuery?.undo??c.docState.past.length)} onClick={c.undo}><Undo2/></ToolButton>
 <ToolButton label={t('imageeditor.redo')} disabled={c.busy||!(c.layerQuery?.redo??c.docState.future.length)} onClick={c.redo}><Redo2/></ToolButton>
 <ToolButton label="Toggle sidebar" onClick={()=>patchState({sidebarOpen:!getState().sidebarOpen})}><PanelLeft/></ToolButton>
 <ToolButton label="Toggle inspector" onClick={()=>patchState({inspectorOpen:!getState().inspectorOpen})}><PanelRight/></ToolButton>
 <span className="grow"/>{c.source&&!c.layerQuery&&<Button size="compact" aria-label="Save Photo copy as PNG" title="Save Photo copy as PNG (never overwrite)" disabled={c.busy||!!c.selection} onClick={()=>void savePhotoCopy(c.name!).catch(e=>patchState({notice:String(e)}))}>PNG copy</Button>}
 {c.source&&<><label className="image-editor-format">{t('imageeditor.format')}<select value={c.format} disabled={c.busy} onChange={e=>c.setFormat(e.target.value as ExportFormat)}><option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option></select></label>{c.format!=='png'&&<label className="image-editor-format">{t('imageeditor.quality')} {c.quality}%<input aria-label={t('imageeditor.quality')} type="range" min={10} max={100} value={c.quality} disabled={c.busy} onChange={e=>c.setQuality(Number(e.target.value))}/></label>}<Button variant="primary" disabled={c.busy} onClick={()=>void c.save()}><Upload/>{c.busy?t('imageeditor.working'):t('imageeditor.save')}</Button></>}
 <ToolButton label={t('imageeditor.close')} disabled={c.busy} onClick={c.close}><X/></ToolButton>
 <div ref={c.setOptionsSlot} className="raster-selection-options"/>
 </>;}
export function RasterLeftPanel(){const c=useRasterEditor();const {t}=useT();return <aside className="raster-panel" aria-label={t('imageeditor.tools')}><div className="raster-panel-tabs" role="toolbar" aria-label="Raster tools"><ToolButton testId="raster-transform-tool" label={t('imgedit.transform.title')} pressed={!c.selectMode} onClick={()=>patchState({editorTool:'pan'})}><Image/></ToolButton><ToolButton label={t('imageeditor.select')} disabled={!c.frame||c.busy} pressed={c.selectMode} onClick={()=>{c.setSelection(null);patchState({editorTool:'selection'});}}><MousePointer2/></ToolButton></div><div className="raster-panel-scroll">{c.source&&<TransformPanel width={c.size.width} height={c.size.height} cropRect={c.cropRect} aspect={c.aspect} disabled={c.busy||!!c.layerQuery} onAspectChange={(a,r)=>{c.setAspect(a);c.setCropRect(r);}} onCropRectChange={c.setCropRect} onCommit={c.addOp}/>}</div></aside>;}
export function RasterRightPanel(){const c=useRasterEditor();const app=useAppStore();const {t}=useT();const tab=app.editorPanel.right;const snap=c.docState.now;const tabs=[['adjust',t('raster.adjust'),SlidersHorizontal],['filter',t('imageeditor.filter'),Image],['layers','Layers',Layers],['history',t('imageeditor.history.title'),RotateCcw],['info','Info',Info],['develop','Develop (experimental)',SlidersHorizontal]] as const;return <aside className="raster-panel" aria-label="Image inspector"><div className="raster-panel-tabs" role="tablist" aria-label="Image inspector tabs">{tabs.map(([id,label,Icon])=><button key={id} role="tab" id={`raster-tab-${id}`} aria-controls={`raster-panel-${id}`} aria-selected={tab===id} title={label} aria-label={label} onClick={()=>patchState({editorPanel:{...app.editorPanel,right:id}})}><Icon size={17}/></button>)}</div><div className="raster-panel-scroll" role="tabpanel" id={`raster-panel-${tab}`} aria-labelledby={`raster-tab-${tab}`}>
 {c.source&&c.layerQuery&&['adjust','filter'].includes(tab)&&<p className="p-3 text-xs">Layer mode: legacy adjustments and transforms are disabled until non-destructive migration is ready.</p>}
 {c.source&&!c.layerQuery&&tab==='adjust'&&<AdjustPanel params={snap.adjust} disabled={c.busy} onChange={adjust=>c.live({...snap,adjust})} onCommit={c.endLive}/>}
 {c.source&&!c.layerQuery&&tab==='filter'&&<section className="image-editor-filter"><label className="image-editor-format">{t('imageeditor.filter')}<select value={snap.filter?.type??''} disabled={c.busy} data-testid="image-editor-filter-select" onChange={e=>{const type=e.target.value as FilterType|'';c.commit({...snap,filter:type?newFilterOperation(`filter-${crypto.randomUUID()}`,type):null});}}><option value="">{t('imageeditor.filterNone')}</option>{FILTER_TYPES.map(f=><option key={f} value={f}>{t(`imageedit.filters.${f}`)}</option>)}</select></label>{snap.filter&&<><FilterPanel operation={snap.filter} disabled={c.busy} onChange={filter=>c.live({...snap,filter})} onCommit={c.endLive}/><Button size="compact" disabled={c.busy} onClick={()=>c.commit({...snap,stack:[...snap.stack,snap.filter!],filter:null})}>{t('imageeditor.filterApply')}</Button></>}</section>}
 {c.source&&tab==='develop'&&<DevelopPanel key={c.source.url}/>}
 {c.source&&tab==='layers'&&<RasterLayersPanel/>}
 {c.source&&tab==='history'&&c.layerQuery&&<p className="p-3 text-xs">Worker layer history: {c.layerQuery.undo} undo / {c.layerQuery.redo} redo. Use Undo and Redo in the options bar.</p>}
 {c.source&&!c.layerQuery&&tab==='history'&&<ImageHistory past={c.docState.past} now={snap} future={c.docState.future} disabled={c.busy} onJump={c.jump} onToggle={id=>c.commit({...snap,stack:toggleOp(snap.stack,id)})} onRemove={id=>c.commit({...snap,stack:removeOp(snap.stack,id)})}/>}
 {c.source&&tab==='info'&&<div className="p-3 text-xs"><p>{c.name}</p><p>{c.size.width} x {c.size.height} px</p><p>{c.source.loaded.document.source.mime}</p></div>}
 </div></aside>;}
export function RasterEditor(){const c=useRasterEditor();const {t}=useT();const raster=useMemo(()=>{if(!c.selectMode||!c.frame||c.previewScale<1)return null;const copy=document.createElement('canvas');copy.width=c.frame.width;copy.height=c.frame.height;const ctx=copy.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(c.frame,0,0);return ctx.getImageData(0,0,copy.width,copy.height);},[c.selectMode,c.frame,c.frameRevision,c.previewScale]);return <EditorShell kind="raster" tabs={<FileTabs/>} toolbar={<RasterToolbar/>} canvas={<div className="image-editor-stage" data-testid="image-editor-stage">{c.source?(c.selectMode&&raster?<SelectionEditor selectionBackend={c.selectionBackend} image={c.frame} revision={c.frameRevision} raster={raster} selection={c.selection} onSelectionChange={c.setSelection} allowPixelEdits={!c.layerQuery} onCommit={c.addOp} controlsSlot={c.optionsSlot} disabled={c.busy}/>:<ImageEditorViewport image={c.frame} revision={c.frameRevision}/>):<div className="image-editor-empty"><p>{t('imageeditor.empty')}</p></div>}</div>} footer={<>{c.source&&<><span>{c.size.width} x {c.size.height} px</span><span>{c.source.loaded.document.source.mime}</span>{c.layerQuery&&<span>PhotoCraft layer mode (bounded)</span>}{c.previewScale<1&&<span title="Preview is bounded to 0.9 MP. Export uses full source resolution.">Preview {Math.round(c.previewScale*100)}%</span>}</>}</>}/>;}

async function encodeComposite(canvas:HTMLCanvasElement,format:ExportFormat,quality:number){const {mime}=exportSettings({format});let target=canvas;if(format==='jpg'){target=document.createElement('canvas');target.width=canvas.width;target.height=canvas.height;const ctx=target.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,target.width,target.height);ctx.drawImage(canvas,0,0);}const blob=await new Promise<Blob>((resolve,reject)=>target.toBlob(b=>b?resolve(b):reject(Error('Image encoding failed')),mime,quality));if(blob.type!==mime)throw Error('Export format is not supported by this webview.');return blob;}
function RasterLayersPanel(){const c=useRasterEditor();if(!c.layerQuery)return <div className="p-3 text-xs"><p>Start a PhotoCraft layered document from a pristine raster up to 1 MP. Legacy tools are disabled in this interim mode. Save exports a composite copy, not a layered file.</p><Button disabled={c.busy||c.size.width*c.size.height>1_048_576} onClick={()=>void c.startLayered()}>Start layered document</Button></div>;return <div className="p-3 flex flex-col gap-3 text-xs"><p>PhotoCraft layers · composite export</p>{[...c.layerQuery.layers].reverse().map((layer,reverseIndex)=>{const index=c.layerQuery!.layers.length-1-reverseIndex;return <section key={layer.id} className="rounded-lg bg-hover p-2 flex flex-col gap-2"><div className="flex items-center gap-1"><ToolButton label={`Toggle ${layer.name}`} disabled={c.busy} pressed={layer.visible} onClick={()=>void c.layerCommand('visible',index,!layer.visible)}>{layer.visible?<Eye/>:<EyeOff/>}</ToolButton><span>{layer.name}</span><ToolButton label={`Duplicate ${layer.name}`} disabled={c.busy} onClick={()=>void c.layerCommand('duplicate',index)}><Copy/></ToolButton></div><label>Opacity<input aria-label={`Opacity ${layer.name}`} type="number" min={0} max={100} value={Math.round(layer.opacity*100)} disabled={c.busy} onChange={e=>{const v=e.currentTarget.valueAsNumber;if(Number.isFinite(v)&&v>=0&&v<=100)void c.layerCommand('opacity',index,v/100);}}/></label><Button size="compact" disabled={c.busy||(!layer.mask&&!c.selection)} onClick={()=>void c.layerCommand(layer.mask?'clear-mask':'mask',index)}>{layer.mask?'Remove mask':'Mask from selection'}</Button></section>;})}</div>;}
