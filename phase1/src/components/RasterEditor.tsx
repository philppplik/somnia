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
import {Image,MousePointer2,SlidersHorizontal,RotateCcw,Info,Undo2,Redo2,PanelLeft,PanelRight,X,Upload,FolderOpen} from '../lib/icons';
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
import {defaultImageHost,editedName,type ImageEditorHost} from '../lib/imageEditorHost';
import {addMediaFile,closeMedia,getMedia,registerMediaCloseGuard,setActiveMedia,useMedia} from '../lib/media';
import {registerCommandScope,type Command} from '../lib/commands';
import '../styles/image-editor-dialog.css';

interface Source{loaded:LoadedImage;renderer:ImageEditorRenderer;url:string;originToken?:string;host?:ImageEditorHost}
function buildRegistry(){const r=createOperationRegistry();for(const h of TRANSFORM_HANDLERS)r.register(h);r.register(adjustHandler);registerFilterOps(r);registerSelectionOps(r);return r;}
function sizeAfter(width:number,height:number,stack:readonly ImageOperation[]){let size={width,height};for(const op of stack){if(!op.enabled)continue;const h=TRANSFORM_HANDLERS.find(x=>x.type===op.type);if(h)size=h.outputSize(size.width,size.height,op.params);}return size;}
interface RasterContextValue{active:boolean;name:string|null;source:Source|null;frame:HTMLCanvasElement|null;frameRevision:number;docState:RasterDocumentState;busy:boolean;size:{width:number;height:number};backend:string;cropRect:CropRect|null;aspect:AspectPreset;selectMode:boolean;selection:SelectionMask|null;format:ExportFormat;quality:number;optionsSlot:HTMLElement|null;
 setOptionsSlot:(node:HTMLDivElement|null)=>void;setCropRect:(r:CropRect|null)=>void;setAspect:(a:AspectPreset)=>void;setSelection:(s:SelectionMask|null)=>void;setFormat:(f:ExportFormat)=>void;setQuality:(q:number)=>void;
 openFile:()=>Promise<void>;save:()=>Promise<void>;close:()=>void;undo:()=>void;redo:()=>void;toggleSelection:()=>void;commit:(next:RasterSnapshot)=>void;live:(next:RasterSnapshot)=>void;endLive:()=>void;jump:(i:number)=>void;addOp:(op:ImageOperation)=>void;}
const Context=createContext<RasterContextValue|null>(null);
export function useRasterEditor(){const c=useContext(Context);if(!c)throw Error('RasterEditorProvider is missing.');return c;}
const EMPTY_STATE=createRasterState();
const emptySize={width:1,height:1};
/** Owns source resources once per media tab. Intent/undo live in appStore.rasterDoc[fileId]. */
export function RasterEditorProvider({children,host:injected}:{children:ReactNode;host?:ImageEditorHost}){
 const {t}=useT();const app=useAppStore();const media=useMedia();
 const [requested,setRequested]=useState(false),[version,setVersion]=useState(0),[frame,setFrame]=useState<HTMLCanvasElement|null>(null),[backend,setBackend]=useState(''),[frameRevision,setFrameRevision]=useState(0);
 const [busy,setBusy]=useState(false),[cropRect,setCropRect]=useState<CropRect|null>(null),[aspect,setAspect]=useState<AspectPreset>('free'),[selection,setSelection]=useState<SelectionMask|null>(null);
 const [format,setFormat]=useState<ExportFormat>('png'),[quality,setQuality]=useState(92),[optionsSlot,setOptionsSlot]=useState<HTMLDivElement|null>(null);
 const registry=useMemo(buildRegistry,[]),sources=useRef(new Map<string,Source>()),grants=useRef(new Map<string,{originToken?:string;host:ImageEditorHost}>());
 const hostRef=useRef<ImageEditorHost|null>(injected??null),savingName=useRef<string|null>(null),liveBase=useRef<{name:string;snapshot:RasterSnapshot}|null>(null),mounted=useRef(true);
 const item=media.items.find(i=>i.name===media.active&&i.kind==='image');const name=item?.name??null;
 const active=!!item||(requested&&!media.active);const cached=name?sources.current.get(name):null;const source=cached?.url===item?.url?cached??null:null;
 const docState=name?app.rasterDoc[name]??EMPTY_STATE:EMPTY_STATE;const snap=docState.now;const selectMode=app.editorTool==='selection';
 const notice=(message:string)=>patchState({notice:message});
 const update=(key:string,fn:(d:RasterDocumentState)=>RasterDocumentState)=>{const all=getState().rasterDoc;patchState({rasterDoc:{...all,[key]:fn(all[key]??createRasterState())}});};
 const dirty=(key:string)=>{const d=getState().rasterDoc[key];return !!d&&rasterDirty(d);};
 const confirmDiscard=(key:string)=>!dirty(key)||window.confirm(t('imageeditor.discardPrompt',{name:key}));
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;for(const s of sources.current.values()){s.renderer.dispose();s.loaded.dispose();}sources.current.clear();};},[]);
 useEffect(()=>{const show=()=>{setRequested(true);const m=getMedia();const image=m.items.find(i=>i.name===m.active&&i.kind==='image');if(!image)setActiveMedia(null);patchState({sidebarOpen:true,inspectorOpen:true});};window.addEventListener('somnia:edit-image',show);return()=>window.removeEventListener('somnia:edit-image',show);},[]);
 useEffect(()=>registerMediaCloseGuard(key=>savingName.current!==key&&confirmDiscard(key)),[busy]);
 useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(Object.values(getState().rasterDoc).some(rasterDirty)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[]);
 useEffect(()=>{patchState({editorKind:active?'raster':null});},[active]);
 useEffect(()=>{for(const [key,s] of sources.current){if(!media.items.some(i=>i.name===key&&i.url===s.url)){s.renderer.dispose();s.loaded.dispose();sources.current.delete(key);const all={...getState().rasterDoc};delete all[key];patchState({rasterDoc:all});}}},[media.items]);
 useEffect(()=>{
  setFrame(null);setCropRect(null);setSelection(null);setAspect('free');endLive();
  if(!item||source)return;
  const ac=new AbortController();
  void fetch(item.url,{signal:ac.signal}).then(r=>r.blob()).then(blob=>loadImage(blob,item.name,ac.signal)).then(loaded=>{
   if(!mounted.current||ac.signal.aborted){loaded.dispose();return;}
   const grant=grants.current.get(item.url);
   sources.current.set(item.name,{loaded,renderer:new ImageEditorRenderer(loaded,registry),url:item.url,...grant});
   update(item.name,d=>d);setVersion(v=>v+1);
  }).catch(e=>{if(!ac.signal.aborted)notice(e instanceof Error?e.message:String(e));});
  return()=>ac.abort();
 },[item?.url,name]);
 const doc=useMemo(()=>{if(!source)return null;const ops=[...snap.stack];if(!isNeutralAdjust(snap.adjust))ops.push({id:'adjust-live',type:'adjust',version:1,enabled:true,params:adjustToJson(snap.adjust)});if(snap.filter)ops.push(snap.filter);return withOperations(source.loaded.document,ops);},[source,snap,version]);
 useEffect(()=>{if(!source||!doc)return;const ac=new AbortController();void source.renderer.render(doc,{preview:true,signal:ac.signal}).then(r=>{if(!ac.signal.aborted){setFrame(r.canvas);setFrameRevision(v=>v+1);setBackend(r.backend);}}).catch(e=>{if(!ac.signal.aborted)notice(e instanceof Error?e.message:String(e));});return()=>ac.abort();},[source,doc]);
 const commit=(next:RasterSnapshot)=>{if(name){liveBase.current=null;update(name,d=>rasterCommit(d,next));}};
 const live=(next:RasterSnapshot)=>{if(!name)return;liveBase.current??={name,snapshot:getState().rasterDoc[name].now};update(name,d=>({...d,now:next}));};
 const endLive=()=>{const base=liveBase.current;liveBase.current=null;if(base)update(base.name,d=>rasterSignature(base.snapshot)===rasterSignature(d.now)?d:{...d,past:[...d.past.slice(-99),base.snapshot],future:[]});};
 const undo=()=>{endLive();if(name)update(name,rasterUndo);setSelection(null);setCropRect(null);};
 const redo=()=>{endLive();if(name)update(name,rasterRedo);setSelection(null);setCropRect(null);};
 const openFile=async()=>{if(busy)return;setBusy(true);try{hostRef.current??=await defaultImageHost();const picked=await hostRef.current.pick();if(!picked)return;const result=await addMediaFile(picked.blob,picked.name);if('error' in result){notice(result.error);return;}const it=getMedia().items.find(i=>i.name===result.name)!;grants.current.set(it.url,{originToken:picked.originToken,host:hostRef.current});setRequested(false);patchState({sidebarOpen:true,inspectorOpen:true});}catch(e){notice(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const save=async()=>{if(!source||!doc||!name||busy)return;endLive();setBusy(true);savingName.current=name;const signature=rasterSignature(snap);try{const {extension}=exportSettings({format});const blob=await exportImage(source.renderer,doc,{format,quality:quality/100});hostRef.current??=await defaultImageHost();const host=source.host??hostRef.current;let saved=false;
  if(getState().workflowPrefs.imageSaveMode==='overwrite'&&host.overwrite&&source.originToken){const r=await host.overwrite(blob,source.originToken,extension);saved=r==='saved';if(saved)notice(t('imageeditor.savedOverwrite'));}
  if(!saved){saved=await host.save(blob,editedName(name,extension));if(saved)notice(t('imageeditor.saved'));}
  if(saved)update(name,d=>({...d,saved:signature}));
 }catch(e){notice(e instanceof Error?e.message:String(e));}finally{savingName.current=null;setBusy(false);}};
 const close=()=>{if(busy)return;if(name)closeMedia(name);else setRequested(false);};
 const jump=(i:number)=>{endLive();if(name)update(name,d=>{const r=jumpTo(d.past,d.now,d.future,i);return r?{...d,now:r.now as RasterSnapshot,past:r.past as RasterSnapshot[],future:r.future as RasterSnapshot[]}:d;});setCropRect(null);setSelection(null);};
 const addOp=(op:ImageOperation)=>{setSelection(null);commit({...snap,stack:[...snap.stack,op]});setCropRect(null);setAspect('free');};
 // Stable scope resolver reads the current context, never stale snapshots. Shared menu/palette/shortcuts route here.
 const actions=useRef({active,name,busy,docState,source,openFile,save,close,undo,redo,commit,snap});actions.current={active,name,busy,docState,source,openFile,save,close,undo,redo,commit,snap};
 useEffect(()=>registerCommandScope(id=>{const a=actions.current;if(!a.active)return;const commands:Record<string,Command>={
  'edit.undo':{id:'edit.undo',title:t('imageeditor.undo'),category:'Edit',shortcut:'Mod+Z',enabled:()=>!a.busy&&!!a.docState.past.length,run:a.undo},
  'edit.redo':{id:'edit.redo',title:t('imageeditor.redo'),category:'Edit',shortcut:'Mod+Shift+Z',enabled:()=>!a.busy&&!!a.docState.future.length,run:a.redo},
  'project.save':{id:'project.save',title:t('imageeditor.save'),category:'Project',shortcut:'Mod+S',allowInInput:true,enabled:()=>!a.busy&&!!a.source,run:a.save},
  'tab.close':{id:'tab.close',title:t('imageeditor.close'),category:'View',shortcut:'Mod+W',enabled:()=>!a.busy,run:a.close},
  'tools.editImage':{id:'tools.editImage',title:t('imageeditor.openOther'),category:'Tools',enabled:()=>!a.busy,run:a.openFile},
 };return commands[id];}),[t]);
 const size=source?sizeAfter(source.loaded.document.source.width,source.loaded.document.source.height,snap.stack):emptySize;
 const value:RasterContextValue={active,name,source,frame,frameRevision,docState,busy,size,backend,cropRect,aspect,selectMode,selection,format,quality,optionsSlot,setOptionsSlot,setCropRect,setAspect,setSelection,setFormat,setQuality,openFile,save,close,undo,redo,toggleSelection:()=>{setSelection(null);patchState({editorTool:selectMode?'pan':'selection'});},commit,live,endLive,jump,addOp};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
function ToolButton({label,onClick,disabled,pressed,children}:{label:string;onClick:()=>void;disabled?:boolean;pressed?:boolean;children:ReactNode}){return <Button size="icon" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</Button>;}
export function RasterToolbar(){const c=useRasterEditor();const {t}=useT();return <>
 <ToolButton label={c.source?t('imageeditor.openOther'):t('imageeditor.open')} disabled={c.busy} onClick={()=>void c.openFile()}><FolderOpen/></ToolButton>
 <ToolButton label={t('imageeditor.undo')} disabled={c.busy||!c.docState.past.length} onClick={c.undo}><Undo2/></ToolButton>
 <ToolButton label={t('imageeditor.redo')} disabled={c.busy||!c.docState.future.length} onClick={c.redo}><Redo2/></ToolButton>
 <ToolButton label="Toggle sidebar" onClick={()=>patchState({sidebarOpen:!getState().sidebarOpen})}><PanelLeft/></ToolButton>
 <ToolButton label="Toggle inspector" onClick={()=>patchState({inspectorOpen:!getState().inspectorOpen})}><PanelRight/></ToolButton>
 <span className="grow"/>
 {c.source&&<><label className="image-editor-format">{t('imageeditor.format')}<select value={c.format} disabled={c.busy} onChange={e=>c.setFormat(e.target.value as ExportFormat)}><option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option></select></label>{c.format!=='png'&&<label className="image-editor-format">{t('imageeditor.quality')} {c.quality}%<input aria-label={t('imageeditor.quality')} type="range" min={10} max={100} value={c.quality} disabled={c.busy} onChange={e=>c.setQuality(Number(e.target.value))}/></label>}<Button variant="primary" disabled={c.busy} onClick={()=>void c.save()}><Upload/>{c.busy?t('imageeditor.working'):t('imageeditor.save')}</Button></>}
 <ToolButton label={t('imageeditor.close')} disabled={c.busy} onClick={c.close}><X/></ToolButton>
 <div ref={c.setOptionsSlot} className="raster-selection-options"/>
 </>;}
export function RasterLeftPanel(){const c=useRasterEditor();const {t}=useT();return <aside className="raster-panel" aria-label={t('imageeditor.tools')}><div className="raster-panel-tabs" role="toolbar" aria-label="Raster tools"><ToolButton label={t('imgedit.transform.title')} pressed={!c.selectMode} onClick={()=>patchState({editorTool:'pan'})}><Image/></ToolButton><ToolButton label={t('imageeditor.select')} disabled={!c.frame||c.busy} pressed={c.selectMode} onClick={()=>{c.setSelection(null);patchState({editorTool:'selection'});}}><MousePointer2/></ToolButton></div><div className="raster-panel-scroll">{c.source&&<TransformPanel width={c.size.width} height={c.size.height} cropRect={c.cropRect} aspect={c.aspect} disabled={c.busy} onAspectChange={(a,r)=>{c.setAspect(a);c.setCropRect(r);}} onCropRectChange={c.setCropRect} onCommit={c.addOp}/>}</div></aside>;}
export function RasterRightPanel(){const c=useRasterEditor();const app=useAppStore();const {t}=useT();const tab=app.editorPanel.right;const snap=c.docState.now;const tabs=[['adjust',t('raster.adjust'),SlidersHorizontal],['filter',t('imageeditor.filter'),Image],['history',t('imageeditor.history.title'),RotateCcw],['info','Info',Info]] as const;return <aside className="raster-panel" aria-label="Image inspector"><div className="raster-panel-tabs" role="tablist" aria-label="Image inspector tabs">{tabs.map(([id,label,Icon])=><button key={id} role="tab" id={`raster-tab-${id}`} aria-controls={`raster-panel-${id}`} aria-selected={tab===id} title={label} aria-label={label} onClick={()=>patchState({editorPanel:{...app.editorPanel,right:id}})}><Icon size={17}/></button>)}</div><div className="raster-panel-scroll" role="tabpanel" id={`raster-panel-${tab}`} aria-labelledby={`raster-tab-${tab}`}>
 {c.source&&tab==='adjust'&&<AdjustPanel params={snap.adjust} disabled={c.busy} onChange={adjust=>c.live({...snap,adjust})} onCommit={c.endLive}/>}
 {c.source&&tab==='filter'&&<section className="image-editor-filter"><label className="image-editor-format">{t('imageeditor.filter')}<select value={snap.filter?.type??''} disabled={c.busy} data-testid="image-editor-filter-select" onChange={e=>{const type=e.target.value as FilterType|'';c.commit({...snap,filter:type?newFilterOperation(`filter-${crypto.randomUUID()}`,type):null});}}><option value="">{t('imageeditor.filterNone')}</option>{FILTER_TYPES.map(f=><option key={f} value={f}>{t(`imageedit.filters.${f}`)}</option>)}</select></label>{snap.filter&&<><FilterPanel operation={snap.filter} disabled={c.busy} onChange={filter=>c.live({...snap,filter})} onCommit={c.endLive}/><Button size="compact" disabled={c.busy} onClick={()=>c.commit({...snap,stack:[...snap.stack,snap.filter!],filter:null})}>{t('imageeditor.filterApply')}</Button></>}</section>}
 {c.source&&tab==='history'&&<ImageHistory past={c.docState.past} now={snap} future={c.docState.future} disabled={c.busy} onJump={c.jump} onToggle={id=>c.commit({...snap,stack:toggleOp(snap.stack,id)})} onRemove={id=>c.commit({...snap,stack:removeOp(snap.stack,id)})}/>}
 {c.source&&tab==='info'&&<div className="p-3 text-xs"><p>{c.name}</p><p>{c.size.width} x {c.size.height} px</p><p>{c.source.loaded.document.source.mime}</p></div>}
 </div></aside>;}
export function RasterEditor(){const c=useRasterEditor();const {t}=useT();const raster=useMemo(()=>{if(!c.selectMode||!c.frame)return null;const copy=document.createElement('canvas');copy.width=c.frame.width;copy.height=c.frame.height;const ctx=copy.getContext('2d',{willReadFrequently:true});if(!ctx)return null;ctx.drawImage(c.frame,0,0);return ctx.getImageData(0,0,copy.width,copy.height);},[c.selectMode,c.frame,c.frameRevision]);return <EditorShell kind="raster" tabs={<FileTabs/>} toolbar={<RasterToolbar/>} canvas={<div className="image-editor-stage" data-testid="image-editor-stage">{c.source?(c.selectMode&&raster?<SelectionEditor image={c.frame} revision={c.frameRevision} raster={raster} selection={c.selection} onSelectionChange={c.setSelection} onCommit={c.addOp} controlsSlot={c.optionsSlot} disabled={c.busy}/>:<ImageEditorViewport image={c.frame} revision={c.frameRevision}/>):<div className="image-editor-empty"><p>{t('imageeditor.empty')}</p></div>}</div>} footer={<>{c.source&&<><span>{c.size.width} x {c.size.height} px</span><span>{c.source.loaded.document.source.mime}</span></>}</>}/>;}
