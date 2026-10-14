import {StudioEmptyState} from '../studios/StudioEmptyState';
import {createBlankProject} from '../../lib/studios/blank';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {FileText,Minus,Plus,Undo2,Redo2} from '../../lib/icons';
import {addMediaFile,findMedia,formatBytes,MEDIA_ACCEPT,useMedia} from '../../lib/media';
import type {DocumentsEngine} from '../../lib/documents';
import {getDocumentsState,patchDocuments,resetDocuments,stepZoom,useDocuments} from '../../lib/documents/store';
import '../../lib/documents/guards';
import {CELL_BASE} from '../../lib/documents/edit';
import {clearCaret,deleteAtCaret,dragTo,editParagraph,getEngine,moveCaret,pasteText,settleDocument,switchDocument,pointerAt,redoEdit,selectAllText,setAlign,shiftListLevel,tabInCell,stepFontSize,stepIndent,toggleFormat,selectedText,splitAtCaret,syncGeometry,typeText,undoEdit} from '../../lib/documents/session';
import {saveCopy} from '../../lib/documents/saveCopy';
import {confirmDocumentsSaveCopy,patchDocumentsExportUi,registerDocumentsExport,useDocumentsExportUi} from '../../lib/documents/exportBridge';
import {executeCommand} from '../../lib/commands';
import {DocumentsExportDialog} from './DocumentsExportDialog';
import {registerDocumentPanelCommands} from '../../lib/documents/panelCommands';
import {registerDocumentsCommands} from '../../lib/documents/commands';
import {studioContextStore} from '../../lib/shell/studioContext';
import {useT} from '../../lib/useT';
import {getState,patchState} from '../../store/appStore';
import {FormatBar} from './FormatBar';
import {NativeButton,Textarea} from '../ui/native-controls';
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
 useEffect(()=>{const el=ref.current;if(el)el.scrollIntoView({block:'nearest',inline:'nearest'});},[left,top]);
 useEffect(()=>{const el=ref.current;if(!el)return;el.focus({preventScroll:true});
  /* React's onBeforeInput is a keypress shim without inputType, so this listens natively. */
  const h=(n:InputEvent)=>{if(composing.current||n.isComposing||n.inputType==='insertCompositionText')return;n.preventDefault();if((n.inputType==='insertText'||n.inputType==='insertReplacementText')&&n.data)void typeText(n.data);};
  el.addEventListener('beforeinput',h);return()=>el.removeEventListener('beforeinput',h);},[]);
 const keys:Record<string,'left'|'right'|'up'|'down'|'home'|'end'>={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Home:'home',End:'end'};
 return <Textarea ref={ref} data-testid="documents-input" aria-label={t('documents.caret.input')} className="absolute m-0 h-4 w-px resize-none overflow-hidden border-0 bg-transparent p-0 opacity-0" style={{left,top}} autoCapitalize="off" autoCorrect="off" spellCheck={false}
  onKeyDown={e=>{
   if(composing.current||e.nativeEvent.isComposing)return;const mod=e.ctrlKey||e.metaKey;
   /* Ctrl (Windows/Linux) or Alt (macOS) moves and deletes by word. */
   const word=mod||e.altKey;
   if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&word){e.preventDefault();void moveCaret(e.key==='ArrowLeft'?'wordLeft':'wordRight',e.shiftKey);return;}
   if((e.key==='Home'||e.key==='End')&&mod){e.preventDefault();void moveCaret(e.key==='Home'?'docStart':'docEnd',e.shiftKey);return;}
   if((e.key==='PageUp'||e.key==='PageDown')&&!mod&&!e.altKey){e.preventDefault();void moveCaret(e.key==='PageUp'?'pageUp':'pageDown',e.shiftKey);return;}
   if(keys[e.key]&&!mod&&!e.altKey){e.preventDefault();void moveCaret(keys[e.key],e.shiftKey);return;}
   if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();void deleteAtCaret(e.key==='Backspace'?-1:1,word);return;}
   if(e.key==='Escape'){e.preventDefault();clearCaret();return;}
   if(e.key==='Enter'){e.preventDefault();void splitAtCaret();return;}
   if(mod&&e.key.toLowerCase()==='a'){e.preventDefault();selectAllText();return;}
   if(mod&&!e.shiftKey&&!e.altKey&&'biu'.includes(e.key.toLowerCase())&&e.key.length===1){e.preventDefault();void toggleFormat(({b:'bold',i:'italic',u:'underline'} as const)[e.key.toLowerCase() as 'b'|'i'|'u']);return;}
   if(mod&&e.shiftKey&&(e.key==='>'||e.key==='<'||e.key==='.'||e.key===',')){e.preventDefault();void stepFontSize(e.key==='>'||e.key==='.'?1:-1);return;}
   if(mod&&!e.shiftKey&&!e.altKey&&e.key.length===1&&'lerj'.includes(e.key.toLowerCase())){e.preventDefault();void setAlign(({l:'left',e:'center',r:'right',j:'justify'} as const)[e.key.toLowerCase() as 'l'|'e'|'r'|'j']);return;}
   if(mod&&(e.key==='['||e.key===']')){e.preventDefault();void stepIndent(e.key===']'?1:-1);return;}
   if(e.key==='Tab'&&!mod&&!e.altKey){const l=getDocumentsState().para?.list;if(l==='bullet'||l==='numbered'){e.preventDefault();void shiftListLevel(e.shiftKey?-1:1);return;}}
   if(e.key==='Tab'&&!mod&&!e.altKey&&(getDocumentsState().caret?.block??0)>=CELL_BASE){e.preventDefault();void tabInCell(e.shiftKey?-1:1);return;}
   if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();void(e.shiftKey?redoEdit():undoEdit());return;}
   if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();void redoEdit();}
  }}
  onCompositionStart={()=>{composing.current=true;}}
  onCompositionEnd={e=>{composing.current=false;const d=e.data;if(ref.current)ref.current.value='';if(d)void typeText(d);}}
  onPaste={e=>{e.preventDefault();const d=e.clipboardData.getData('text/plain');if(d)void pasteText(d);}}
  onCopy={e=>{const x=selectedText();if(x){e.preventDefault();e.clipboardData.setData('text/plain',x);}}}
  onCut={e=>{const x=selectedText();if(x){e.preventDefault();e.clipboardData.setData('text/plain',x);void deleteAtCaret(-1);}}}/>;
}
export function DocumentsCanvas(){
 const {t}=useT();const media=useMedia();const doc=useDocuments();
 const item=useMemo(()=>{const m=media.items.find(i=>i.name===media.active);return m?.kind==='docx'?m:null;},[media]);
 const engineRef=useRef<DocumentsEngine|null>(null);const [engine,setEngine]=useState<DocumentsEngine|null>(null);
 const [near,setNear]=useState<Set<number>>(new Set([0]));const [attempt,setAttempt]=useState(0);
 const exportUi=useDocumentsExportUi();
 useEffect(()=>{void syncGeometry();},[doc.caret,doc.rev,doc.zoom]);
 useEffect(()=>registerDocumentsCommands(),[]);
 useEffect(()=>registerDocumentPanelCommands(),[]);
 /** Publish the studio context: the caret paragraph is the selection, `ready`/`risks` gate inspector sections. */
 const claimRef=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 useEffect(()=>{if(!item)return;const c=studioContextStore.claim('documents',{id:item.name,kind:'docx',dirty:false,readOnly:false});claimRef.current=c;return()=>{c.release();claimRef.current=null;};},[item?.name]);
 useEffect(()=>{
  const sel=doc.caret?{kind:'one' as const,type:'paragraph',count:1,ids:['p'+doc.caret.block]}:{kind:'none' as const,count:0,ids:[] as string[]};
  claimRef.current?.report({document:{id:item?.name??'',kind:'docx',dirty:doc.edited,readOnly:false},selection:sel,data:{block:doc.caret?.block??null},busy:doc.saving||doc.status==='loading',services:{ready:doc.status==='ready',risks:doc.status==='ready'&&doc.risks.length>0,canUndo:doc.canUndo,canRedo:doc.canRedo}});
 },[item?.name,doc.edited,doc.caret?.block,doc.status,doc.risks.length,doc.saving,doc.canUndo,doc.canRedo]);
 /** The Layers tree belongs to the web page, not to a document: land on Files when this studio opens. */
 useEffect(()=>{if(!['files','search','versions'].includes(getState().leftTab))patchState({leftTab:'files'});},[]);
 /* The engine and its edits belong to the file, not to this component: switching studio or tab parks the session, coming back restores it. */
 useEffect(()=>{
  if(!item){void switchDocument(null);setEngine(null);return;}
  let live=true;setEngine(null);setNear(new Set([0]));
  void switchDocument({key:item.name,url:item.url,retry:attempt>0}).then(e=>{if(live&&e){engineRef.current=e;setEngine(e);}});
  return()=>{live=false;};
 },[item?.url,item?.name,attempt]);
 const onVisible=useCallback((i:number,v:boolean)=>setNear(prev=>{if(prev.has(i)===v)return prev;const n=new Set(prev);v?n.add(i):n.delete(i);return n;}),[]);
 const pick=async()=>{const input=document.createElement('input');input.type='file';input.accept=MEDIA_ACCEPT.split(',').filter(x=>/docx|wordprocessingml/.test(x)).join(',');input.onchange=async()=>{const f=input.files?.[0];if(f){const r=await addMediaFile(f,f.name);if('error' in r)patchDocuments({status:'error',error:r.error});}};input.click();};
 const doSave=async()=>{patchDocuments({saving:true});try{await settleDocument();const e=getEngine();if(!e)throw new Error(t('documents.session.noEngine'));await saveCopy(e,doc.name);}catch(err){patchDocuments({status:'error',error:err instanceof Error?err.message:String(err)});}finally{patchDocuments({saving:false});}};
 // One save implementation for every entry point (toolbar, hero popup, Project menu, palette).
 const doSaveRef=useRef(doSave);doSaveRef.current=doSave;
 useEffect(()=>registerDocumentsExport({save:()=>doSaveRef.current()}),[]);
 if(!item)return <section className="canvas-stage flex min-h-0 flex-1" aria-label={t('documents.title')}>
  <StudioEmptyState studio="documents" icon={<FileText/>} onOpen={pick} onCreate={()=>createBlankProject('documents')}/></section>;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('documents.title')}>
  <div className={bar}><span className="truncate" data-testid="documents-name">{item.name}</span><span className="text-ink-3">{formatBytes(item.size)}</span>
   {doc.status==='ready'&&<span className="text-ink-3" data-testid="documents-pages">{t('documents.pages',{n:doc.pages})}</span>}<span className="flex-1"/>
   <NativeButton className={tool} aria-label={t('documents.undo')} title={t('documents.undo')} disabled={!doc.canUndo} onClick={()=>void undoEdit()} data-testid="documents-undo"><Undo2 size={13}/></NativeButton>
   <NativeButton className={tool} aria-label={t('documents.redo')} title={t('documents.redo')} disabled={!doc.canRedo} onClick={()=>void redoEdit()} data-testid="documents-redo"><Redo2 size={13}/></NativeButton>
   <NativeButton className={tool} aria-label={t('documents.zoomOut')} title={t('documents.zoomOut')} disabled={doc.status!=='ready'} onClick={()=>stepZoom(-1)}><Minus size={13}/></NativeButton>
   <span className="w-10 text-center tabular-nums" data-testid="documents-zoom">{Math.round(doc.zoom*100)}%</span>
   <NativeButton className={tool} aria-label={t('documents.zoomIn')} title={t('documents.zoomIn')} disabled={doc.status!=='ready'} onClick={()=>stepZoom(1)}><Plus size={13}/></NativeButton>
   <NativeButton className={tool} disabled={doc.status!=='ready'||doc.saving} onClick={()=>void executeCommand('documents.saveCopy')} data-testid="documents-save-copy">{t('documents.saveCopy')}</NativeButton></div>
  {doc.status==='ready'&&<FormatBar para={doc.para} format={doc.format} held={doc.pendingFormat&&doc.caret&&doc.pendingFormat.block===doc.caret.block&&doc.pendingFormat.off===doc.caret.head&&doc.caret.anchor===doc.caret.head&&doc.caret.anchorBlock===undefined?doc.pendingFormat.patch:null} enabled={!!doc.caret} inCell={!!doc.caret&&doc.caret.block>=CELL_BASE}/>}
  {doc.status==='loading'&&<div role="status" className="grid flex-1 place-items-center text-[12px] text-ink-3">{t('documents.loading')}</div>}
  {doc.status==='error'&&<div role="alert" className="grid flex-1 place-items-center"><div className="grid max-w-md justify-items-center gap-2 text-center"><p className="text-[13px] text-ink" data-testid="documents-error">{doc.error}</p><NativeButton className={tool+' border border-subtle'} onClick={()=>setAttempt(a=>a+1)}>{t('documents.retry')}</NativeButton></div></div>}
  {doc.notice&&<p role="status" className="border-b border-subtle px-3 py-1 text-xs text-ink-3" data-testid="documents-session-notice">{t('documents.session.'+doc.notice)}</p>}
  {doc.caretLocked&&<p role="status" className="border-b border-subtle px-3 py-1 text-[12px] text-ink-3" data-testid="documents-caret-locked">{t('documents.caret.locked')}</p>}
  {doc.status==='ready'&&engine&&<div className="min-h-0 flex-1 overflow-auto bg-hover/40 p-6" data-testid="documents-scroll"><div className="flex flex-col gap-4">
   {doc.pageSizes.map((p,i)=><Page key={i} engine={engine} index={i} width={p.width} height={p.height} zoom={doc.zoom} rev={doc.rev} visible={near.has(i)} onVisible={onVisible}/>)}</div></div>}
  {exportUi.confirmOpen&&<div role="alertdialog" aria-modal="true" aria-labelledby="documents-confirm-title" className="absolute inset-0 z-20 grid place-items-center bg-black/30"><div className="grid max-w-md gap-3 rounded-[var(--r-popup,25px)] bg-surface p-5 shadow-xl">
   <h2 id="documents-confirm-title" className="text-[14px] font-medium">{t('documents.lossTitle')}</h2><p className="text-[12px] text-ink-2">{t('documents.lossBody')}</p>
   <ul className="list-disc pl-5 text-[12px] text-ink-2" data-testid="documents-loss-list">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul>
   <div className="flex justify-end gap-2"><NativeButton className={tool} autoFocus onClick={()=>patchDocumentsExportUi({confirmOpen:false})}>{t('documents.cancel')}</NativeButton><NativeButton className={tool+' border border-subtle'} onClick={()=>void confirmDocumentsSaveCopy()} data-testid="documents-save-anyway">{t('documents.saveAnyway')}</NativeButton></div></div></div>}
  <DocumentsExportDialog/>
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

export function ParagraphEditor(){
 const {t}=useT();const doc=useDocuments();
 return <section aria-label={t('documents.edit.title')} className="grid gap-2" data-testid="documents-editor">
  <h3 className="text-[12px] font-medium text-ink">{t('documents.edit.title')}</h3>
  {doc.editError&&<p role="alert" className="text-[12px] text-ink" data-testid="documents-edit-error">{doc.editError}</p>}
  <ul className="grid max-h-[50vh] gap-2 overflow-auto pr-1">
   {doc.blocks.filter(b=>b.kind!=='cell').map(b=><li key={b.index}>
    {b.kind==='table'?<p className="text-ink-3" data-testid="documents-block-locked">{t('documents.edit.table',{n:b.index+1})}</p>
     :b.editable?<ParagraphField index={b.index} text={b.text??''}/>
     :<p className="text-ink-3" data-testid="documents-block-locked">{t('documents.edit.objects',{n:b.index+1})}</p>}
   </li>)}
  </ul></section>;
}
export function ParagraphField({index,text}:{index:number;text:string}){
 const {t}=useT();const [draft,setDraft]=useState(text);useEffect(()=>setDraft(text),[text]);
 return <Textarea className="w-full resize-y rounded-sm border border-subtle bg-transparent p-1.5 text-[12px] text-ink" rows={Math.min(6,Math.max(1,Math.ceil(text.length/34)))} value={draft} aria-label={t('documents.edit.paragraph',{n:index+1})} data-testid={'documents-para-'+index}
  onChange={e=>setDraft(e.target.value.replace(/[\r\n]+/g,' '))} onBlur={()=>{if(draft!==text)void editParagraph(index,draft);}}/>;
}
