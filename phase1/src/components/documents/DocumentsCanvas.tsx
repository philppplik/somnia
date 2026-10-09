import {StudioEmptyState} from '../studios/StudioEmptyState';
import {createBlankProject} from '../../lib/studios/blank';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {FileText,Minus,Plus,Undo2,Redo2} from '../../lib/icons';
import {addMediaFile,findMedia,formatBytes,MEDIA_ACCEPT,useMedia} from '../../lib/media';
import {DocumentsEngine,inspectDocx,type OpenedDocument} from '../../lib/documents';
import {patchDocuments,resetDocuments,stepZoom,useDocuments} from '../../lib/documents/store';
import {attachEngine,clearCaret,deleteAtCaret,dragTo,editParagraph,loadBlocks,moveCaret,pointerAt,redoEdit,selectAllInParagraph,selectedText,splitAtCaret,syncGeometry,typeText,undoEdit} from '../../lib/documents/session';
import {saveCopy} from '../../lib/documents/saveCopy';
import {useT} from '../../lib/useT';
import {getState,patchState} from '../../store/appStore';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Only pages near the viewport are rasterised (IntersectionObserver with margin); the rest release their image. */
function Page({engine,index,width,height,zoom,rev,visible,onVisible}:{engine:DocumentsEngine;index:number;width:number;height:number;zoom:number;rev:number;visible:boolean;onVisible:(i:number,v:boolean)=>void}){
 const {t}=useT();const ref=useRef<HTMLDivElement>(null);const [src,setSrc]=useState('');const [failed,setFailed]=useState(false);
 useEffect(()=>{const el=ref.current;if(!el)return;const io=new IntersectionObserver(([e])=>onVisible(index,e.isIntersecting),{rootMargin:'600px 0px'});io.observe(el);return()=>io.disconnect();},[index,onVisible]);
 useEffect(()=>{
  if(!visible){setSrc('');return;}
  let live=true,url='';const scale=Math.min(2,Math.max(0.1,zoom*Math.min(window.devicePixelRatio||1,2)));
  setFailed(false);
  engine.render(index,scale).then(b=>{if(!live)return;url=URL.createObjectURL(b);setSrc(url);}).catch(()=>{if(live)setFailed(true);});
  return()=>{live=false;if(url)URL.revokeObjectURL(url);};
 },[engine,index,zoom,visible,rev]);
 const doc=useDocuments();const down=useRef(false);
 const at=(e:React.PointerEvent)=>{const r=ref.current!.getBoundingClientRect();return[(e.clientX-r.left)/zoom,(e.clientY-r.top)/zoom] as const;};
 const box=doc.caretBox&&doc.caretBox.page===index?doc.caretBox:null;
 return <div ref={ref} className="documents-page relative mx-auto shrink-0 cursor-text bg-white shadow-sm ring-1 ring-black/10" style={{width:width*zoom,height:height*zoom}} data-testid="documents-page" data-page={index+1} role="img" aria-label={t('documents.page',{n:index+1})}
  onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();down.current=true;e.currentTarget.setPointerCapture(e.pointerId);const [x,y]=at(e);void pointerAt(index,x,y,e.shiftKey);}}
  onPointerMove={e=>{if(down.current&&e.buttons&1){const [x,y]=at(e);dragTo(index,x,y);}}} onPointerUp={()=>{down.current=false;}} onPointerCancel={()=>{down.current=false;}}>
  {src&&<img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none"/>}
  {failed&&<span role="alert" className="absolute inset-0 grid place-items-center text-[12px] text-ink-3">{t('documents.pageFailed')}</span>}
  {doc.selRects.filter(r=>r[0]===index).map((r,i)=><span key={i} aria-hidden="true" className="pointer-events-none absolute bg-sky-500/30" data-testid="documents-selection" style={{left:r[1]*zoom,top:r[2]*zoom,width:r[3]*zoom,height:r[4]*zoom}}/>)}
  {box&&<><span aria-hidden="true" className="documents-caret pointer-events-none absolute bg-black" data-testid="documents-caret" style={{left:box.x*zoom-0.5,top:box.top*zoom,width:1.5,height:box.height*zoom}}/>
   <CaretInput left={box.x*zoom} top={box.top*zoom}/></>}
 </div>;
}
/** Invisible textarea that owns keyboard focus, IME and clipboard for the on-page caret. It never holds document text. */
function CaretInput({left,top}:{left:number;top:number}){
 const {t}=useT();const ref=useRef<HTMLTextAreaElement>(null);const composing=useRef(false);
 useEffect(()=>{const el=ref.current;if(!el)return;el.focus({preventScroll:true});
  /* React's onBeforeInput is a keypress shim without inputType, so this listens natively. */
  const h=(n:InputEvent)=>{if(composing.current||n.isComposing||n.inputType==='insertCompositionText')return;n.preventDefault();if((n.inputType==='insertText'||n.inputType==='insertReplacementText')&&n.data)void typeText(n.data);};
  el.addEventListener('beforeinput',h);return()=>el.removeEventListener('beforeinput',h);},[]);
 const keys:Record<string,'left'|'right'|'up'|'down'|'home'|'end'>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Home:'home',End:'end'};
 return <textarea ref={ref} data-testid="documents-input" aria-label={t('documents.caret.input')} className="absolute m-0 h-4 w-px resize-none overflow-hidden border-0 bg-transparent p-0 opacity-0" style={{left,top}} autoCapitalize="off" autoCorrect="off" spellCheck={false}
  onKeyDown={e=>{
   if(composing.current||e.nativeEvent.isComposing)return;const mod=e.ctrlKey||e.metaKey;
   if(keys[e.key]&&!mod&&!e.altKey){e.preventDefault();void moveCaret(keys[e.key],e.shiftKey);return;}
   if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();void deleteAtCaret(e.key==='Backspace'?-1:1);return;}
   if(e.key==='Escape'){e.preventDefault();clearCaret();return;}
   if(e.key==='Enter'){e.preventDefault();void splitAtCaret();return;}
   if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();selectAllInParagraph();return;}
   if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();void(e.shiftKey?redoEdit():undoEdit());return;}
   if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();void redoEdit();}
  }}
  onCompositionStart={()=>{composing.current=true;}}
  onCompositionEnd={e=>{composing.current=false;const d=e.data;if(ref.current)ref.current.value='';if(d)void typeText(d);}}
  onPaste={e=>{e.preventDefault();const d=e.clipboardData.getData('text/plain');if(d)void typeText(d);}}
  onCopy={e=>{const x=selectedText();if(x){e.preventDefault();e.clipboardData.setData('text/plain',x);}}}
  onCut={e=>{const x=selectedText();if(x){e.preventDefault();e.clipboardData.setData('text/plain',x);void deleteAtCaret(-1);}}}/>;
}
export function DocumentsCanvas(){
 const {t}=useT();const media=useMedia();const doc=useDocuments();
 const item=useMemo(()=>{const m=media.items.find(i=>i.name===media.active);return m?.kind==='docx'?m:null;},[media]);
 const engineRef=useRef<DocumentsEngine|null>(null);const [engine,setEngine]=useState<DocumentsEngine|null>(null);
 const [near,setNear]=useState<Set<number>>(new Set([0]));const [attempt,setAttempt]=useState(0);const [confirm,setConfirm]=useState(false);
 const bytesRef=useRef<Uint8Array|null>(null);
 useEffect(()=>{void syncGeometry();},[doc.caret,doc.rev,doc.zoom]);
 /** The Layers tree belongs to the web page, not to a document: land on Files when this studio opens. */
 useEffect(()=>{if(!['files','search','versions'].includes(getState().leftTab))patchState({leftTab:'files'});},[]);
 useEffect(()=>{
  if(!item){attachEngine(null);resetDocuments();return;}
  let live=true;const e=new DocumentsEngine();engineRef.current=e;setEngine(null);setNear(new Set([0]));
  patchDocuments({status:'loading',name:item.name,error:'',pages:0,risks:[],words:0,engineMs:null});
  (async()=>{
   const raw=new Uint8Array(await (await fetch(item.url)).arrayBuffer());bytesRef.current=raw;
   const check=inspectDocx(raw);if(!check.ok)throw new Error(check.error);
   await e.init();const d=await e.open(raw.slice().buffer);
   if(!live)return;attachEngine(e);patchDocuments({risks:check.risks,engineMs:Math.round(d.openMs+d.layoutMs)});await loadBlocks(d);
   if(!live)return;setEngine(e);patchDocuments({status:'ready'});
  })().catch(err=>{if(live)patchDocuments({status:'error',error:err instanceof Error?err.message:String(err)});});
  return()=>{live=false;e.dispose();engineRef.current=null;};
 },[item?.url,attempt]);
 const onVisible=useCallback((i:number,v:boolean)=>setNear(prev=>{if(prev.has(i)===v)return prev;const n=new Set(prev);v?n.add(i):n.delete(i);return n;}),[]);
 const pick=async()=>{const input=document.createElement('input');input.type='file';input.accept=MEDIA_ACCEPT.split(',').filter(x=>/docx|wordprocessingml/.test(x)).join(',');input.onchange=async()=>{const f=input.files?.[0];if(f){const r=await addMediaFile(f,f.name);if('error' in r)patchDocuments({status:'error',error:r.error});}};input.click();};
 const doSave=async()=>{setConfirm(false);patchDocuments({saving:true});try{await saveCopy(engineRef.current!,doc.name);}catch(err){patchDocuments({status:'error',error:err instanceof Error?err.message:String(err)});}finally{patchDocuments({saving:false});}};
 if(!item)return <section className="canvas-stage flex min-h-0 flex-1" aria-label={t('documents.title')}>
  <StudioEmptyState studio="documents" icon={<FileText/>} onOpen={pick} onCreate={()=>createBlankProject('documents')}/></section>;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('documents.title')}>
  <div className={bar}><span className="truncate" data-testid="documents-name">{item.name}</span><span className="text-ink-3">{formatBytes(item.size)}</span>
   {doc.status==='ready'&&<span className="text-ink-3" data-testid="documents-pages">{t('documents.pages',{n:doc.pages})}</span>}<span className="flex-1"/>
   <button className={tool} aria-label={t('documents.undo')} title={t('documents.undo')} disabled={!doc.canUndo} onClick={()=>void undoEdit()} data-testid="documents-undo"><Undo2 size={13}/></button>
   <button className={tool} aria-label={t('documents.redo')} title={t('documents.redo')} disabled={!doc.canRedo} onClick={()=>void redoEdit()} data-testid="documents-redo"><Redo2 size={13}/></button>
   <button className={tool} aria-label={t('documents.zoomOut')} title={t('documents.zoomOut')} disabled={doc.status!=='ready'} onClick={()=>stepZoom(-1)}><Minus size={13}/></button>
   <span className="w-10 text-center tabular-nums" data-testid="documents-zoom">{Math.round(doc.zoom*100)}%</span>
   <button className={tool} aria-label={t('documents.zoomIn')} title={t('documents.zoomIn')} disabled={doc.status!=='ready'} onClick={()=>stepZoom(1)}><Plus size={13}/></button>
   <button className={tool} disabled={doc.status!=='ready'||doc.saving} onClick={()=>doc.risks.length?setConfirm(true):void doSave()} data-testid="documents-save-copy">{t('documents.saveCopy')}</button></div>
  {doc.status==='loading'&&<div role="status" className="grid flex-1 place-items-center text-[12px] text-ink-3">{t('documents.loading')}</div>}
  {doc.status==='error'&&<div role="alert" className="grid flex-1 place-items-center"><div className="grid max-w-md justify-items-center gap-2 text-center"><p className="text-[13px] text-ink" data-testid="documents-error">{doc.error}</p><button className={tool+' border border-subtle'} onClick={()=>setAttempt(a=>a+1)}>{t('documents.retry')}</button></div></div>}
  {doc.caretLocked&&<p role="status" className="border-b border-subtle px-3 py-1 text-[12px] text-ink-3" data-testid="documents-caret-locked">{t('documents.caret.locked')}</p>}
  {doc.status==='ready'&&engine&&<div className="min-h-0 flex-1 overflow-auto bg-hover/40 p-6" data-testid="documents-scroll"><div className="flex flex-col gap-4">
   {doc.pageSizes.map((p,i)=><Page key={i} engine={engine} index={i} width={p.width} height={p.height} zoom={doc.zoom} rev={doc.rev} visible={near.has(i)} onVisible={onVisible}/>)}</div></div>}
  {confirm&&<div role="alertdialog" aria-modal="true" aria-labelledby="documents-confirm-title" className="absolute inset-0 z-20 grid place-items-center bg-black/30"><div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl">
   <h2 id="documents-confirm-title" className="text-[14px] font-medium">{t('documents.lossTitle')}</h2><p className="text-[12px] text-ink-2">{t('documents.lossBody')}</p>
   <ul className="list-disc pl-5 text-[12px] text-ink-2" data-testid="documents-loss-list">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul>
   <div className="flex justify-end gap-2"><button className={tool} autoFocus onClick={()=>setConfirm(false)}>{t('documents.cancel')}</button><button className={tool+' border border-subtle'} onClick={()=>void doSave()} data-testid="documents-save-anyway">{t('documents.saveAnyway')}</button></div></div></div>}
 </section>;
}
export function DocumentsInspector(){
 const {t}=useT();const doc=useDocuments();
 return <aside className="grid content-start gap-3 p-3 text-[12px]" aria-label={t('documents.inspector')} data-testid="documents-inspector">
  <h2 className="text-[12px] font-medium text-ink">{t('documents.inspector')}</h2>
  {doc.status!=='ready'?<p className="text-ink-3">{t('documents.inspector.none')}</p>:<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
   <dt className="text-ink-3">{t('documents.inspector.pages')}</dt><dd data-testid="documents-info-pages">{doc.pages}</dd>
   <dt className="text-ink-3">{t('documents.inspector.words')}</dt><dd>{doc.words}</dd>
   <dt className="text-ink-3">{t('documents.inspector.engine')}</dt><dd>{doc.engineMs} ms</dd></dl>}
  <p className="text-ink-3">{t('documents.inspector.readonly')}</p>
  {doc.status==='ready'&&<ParagraphEditor/>}
  {doc.status==='ready'&&doc.risks.length>0&&<div role="note"><p className="text-ink-2">{t('documents.inspector.risks')}</p><ul className="list-disc pl-5 text-ink-3">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul></div>}
 </aside>;
}

function ParagraphEditor(){
 const {t}=useT();const doc=useDocuments();
 return <section aria-label={t('documents.edit.title')} className="grid gap-2" data-testid="documents-editor">
  <h3 className="text-[12px] font-medium text-ink">{t('documents.edit.title')}</h3>
  {doc.editError&&<p role="alert" className="text-[12px] text-ink" data-testid="documents-edit-error">{doc.editError}</p>}
  <ul className="grid max-h-[50vh] gap-2 overflow-auto pr-1">
   {doc.blocks.map(b=><li key={b.index}>
    {b.kind==='table'?<p className="text-ink-3" data-testid="documents-block-locked">{t('documents.edit.table',{n:b.index+1})}</p>
     :b.editable?<ParagraphField index={b.index} text={b.text??''}/>
     :<p className="text-ink-3" data-testid="documents-block-locked">{t('documents.edit.objects',{n:b.index+1})}</p>}
   </li>)}
  </ul></section>;
}
function ParagraphField({index,text}:{index:number;text:string}){
 const {t}=useT();const [draft,setDraft]=useState(text);useEffect(()=>setDraft(text),[text]);
 return <textarea className="w-full resize-y rounded-sm border border-subtle bg-transparent p-1.5 text-[12px] text-ink" rows={Math.min(6,Math.max(1,Math.ceil(text.length/34)))} value={draft} aria-label={t('documents.edit.paragraph',{n:index+1})} data-testid={'documents-para-'+index}
  onChange={e=>setDraft(e.target.value.replace(/[\r\n]+/g,' '))} onBlur={()=>{if(draft!==text)void editParagraph(index,draft);}}/>;
}
