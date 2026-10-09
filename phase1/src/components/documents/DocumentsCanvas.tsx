import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {FileText,Minus,Plus} from '../../lib/icons';
import {addMediaFile,findMedia,formatBytes,MEDIA_ACCEPT,useMedia} from '../../lib/media';
import {DocumentsEngine,inspectDocx,type OpenedDocument} from '../../lib/documents';
import {patchDocuments,resetDocuments,stepZoom,useDocuments} from '../../lib/documents/store';
import {saveCopy} from '../../lib/documents/saveCopy';
import {useT} from '../../lib/useT';
import {getState,patchState} from '../../store/appStore';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover disabled:cursor-default disabled:opacity-50';
/** Only pages near the viewport are rasterised (IntersectionObserver with margin); the rest release their image. */
function Page({engine,index,width,height,zoom,visible,onVisible}:{engine:DocumentsEngine;index:number;width:number;height:number;zoom:number;visible:boolean;onVisible:(i:number,v:boolean)=>void}){
 const {t}=useT();const ref=useRef<HTMLDivElement>(null);const [src,setSrc]=useState('');const [failed,setFailed]=useState(false);
 useEffect(()=>{const el=ref.current;if(!el)return;const io=new IntersectionObserver(([e])=>onVisible(index,e.isIntersecting),{rootMargin:'600px 0px'});io.observe(el);return()=>io.disconnect();},[index,onVisible]);
 useEffect(()=>{
  if(!visible){setSrc('');return;}
  let live=true,url='';const scale=Math.min(2,Math.max(0.1,zoom*Math.min(window.devicePixelRatio||1,2)));
  setFailed(false);
  engine.render(index,scale).then(b=>{if(!live)return;url=URL.createObjectURL(b);setSrc(url);}).catch(()=>{if(live)setFailed(true);});
  return()=>{live=false;if(url)URL.revokeObjectURL(url);};
 },[engine,index,zoom,visible]);
 return <div ref={ref} className="documents-page relative mx-auto shrink-0 bg-white shadow-sm ring-1 ring-black/10" style={{width:width*zoom,height:height*zoom}} data-testid="documents-page" data-page={index+1} role="img" aria-label={t('documents.page',{n:index+1})}>
  {src&&<img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none"/>}
  {failed&&<span role="alert" className="absolute inset-0 grid place-items-center text-[12px] text-ink-3">{t('documents.pageFailed')}</span>}
 </div>;
}
export function DocumentsCanvas(){
 const {t}=useT();const media=useMedia();const doc=useDocuments();
 const item=useMemo(()=>{const m=media.items.find(i=>i.name===media.active);return m?.kind==='docx'?m:null;},[media]);
 const [info,setInfo]=useState<OpenedDocument|null>(null);const engineRef=useRef<DocumentsEngine|null>(null);const [engine,setEngine]=useState<DocumentsEngine|null>(null);
 const [near,setNear]=useState<Set<number>>(new Set([0]));const [attempt,setAttempt]=useState(0);const [confirm,setConfirm]=useState(false);
 const bytesRef=useRef<Uint8Array|null>(null);
 /** The Layers tree belongs to the web page, not to a document: land on Files when this studio opens. */
 useEffect(()=>{if(!['files','search','versions'].includes(getState().leftTab))patchState({leftTab:'files'});},[]);
 useEffect(()=>{
  if(!item){resetDocuments();setInfo(null);return;}
  let live=true;const e=new DocumentsEngine();engineRef.current=e;setEngine(null);setInfo(null);setNear(new Set([0]));
  patchDocuments({status:'loading',name:item.name,error:'',pages:0,risks:[],words:0,engineMs:null});
  (async()=>{
   const raw=new Uint8Array(await (await fetch(item.url)).arrayBuffer());bytesRef.current=raw;
   const check=inspectDocx(raw);if(!check.ok)throw new Error(check.error);
   await e.init();const d=await e.open(raw.slice().buffer);
   if(!live)return;setInfo(d);setEngine(e);
   patchDocuments({status:'ready',pages:d.pages,risks:check.risks,words:d.text.split(/\s+/).filter(Boolean).length,engineMs:Math.round(d.openMs+d.layoutMs)});
  })().catch(err=>{if(live)patchDocuments({status:'error',error:err instanceof Error?err.message:String(err)});});
  return()=>{live=false;e.dispose();engineRef.current=null;};
 },[item?.url,attempt]);
 const onVisible=useCallback((i:number,v:boolean)=>setNear(prev=>{if(prev.has(i)===v)return prev;const n=new Set(prev);v?n.add(i):n.delete(i);return n;}),[]);
 const pick=async()=>{const input=document.createElement('input');input.type='file';input.accept=MEDIA_ACCEPT.split(',').filter(x=>/docx|wordprocessingml/.test(x)).join(',');input.onchange=async()=>{const f=input.files?.[0];if(f){const r=await addMediaFile(f,f.name);if('error' in r)patchDocuments({status:'error',error:r.error});}};input.click();};
 const doSave=async()=>{setConfirm(false);patchDocuments({saving:true});try{await saveCopy(engineRef.current!,doc.name);}catch(err){patchDocuments({status:'error',error:err instanceof Error?err.message:String(err)});}finally{patchDocuments({saving:false});}};
 if(!item)return <section className="canvas-stage grid min-h-0 flex-1 place-items-center" aria-label={t('documents.title')}>
  <div className="grid max-w-sm justify-items-center gap-3 text-center"><FileText size={28} aria-hidden="true"/><p className="text-[13px] text-ink-2">{t('documents.empty')}</p>
  <button className={tool+' border border-subtle'} onClick={pick}>{t('documents.open')}</button></div></section>;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('documents.title')}>
  <div className={bar}><span className="truncate" data-testid="documents-name">{item.name}</span><span className="text-ink-3">{formatBytes(item.size)}</span>
   {doc.status==='ready'&&<span className="text-ink-3" data-testid="documents-pages">{t('documents.pages',{n:doc.pages})}</span>}<span className="flex-1"/>
   <button className={tool} aria-label={t('documents.zoomOut')} title={t('documents.zoomOut')} disabled={doc.status!=='ready'} onClick={()=>stepZoom(-1)}><Minus size={13}/></button>
   <span className="w-10 text-center tabular-nums" data-testid="documents-zoom">{Math.round(doc.zoom*100)}%</span>
   <button className={tool} aria-label={t('documents.zoomIn')} title={t('documents.zoomIn')} disabled={doc.status!=='ready'} onClick={()=>stepZoom(1)}><Plus size={13}/></button>
   <button className={tool} disabled={doc.status!=='ready'||doc.saving} onClick={()=>doc.risks.length?setConfirm(true):void doSave()} data-testid="documents-save-copy">{t('documents.saveCopy')}</button></div>
  {doc.status==='loading'&&<div role="status" className="grid flex-1 place-items-center text-[12px] text-ink-3">{t('documents.loading')}</div>}
  {doc.status==='error'&&<div role="alert" className="grid flex-1 place-items-center"><div className="grid max-w-md justify-items-center gap-2 text-center"><p className="text-[13px] text-ink" data-testid="documents-error">{doc.error}</p><button className={tool+' border border-subtle'} onClick={()=>setAttempt(a=>a+1)}>{t('documents.retry')}</button></div></div>}
  {doc.status==='ready'&&engine&&info&&<div className="min-h-0 flex-1 overflow-auto bg-hover/40 p-6" data-testid="documents-scroll"><div className="flex flex-col gap-4">
   {info.pageSizes.map((p,i)=><Page key={i} engine={engine} index={i} width={p.width} height={p.height} zoom={doc.zoom} visible={near.has(i)} onVisible={onVisible}/>)}</div></div>}
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
  {doc.status==='ready'&&doc.risks.length>0&&<div role="note"><p className="text-ink-2">{t('documents.inspector.risks')}</p><ul className="list-disc pl-5 text-ink-3">{doc.risks.map(r=><li key={r}>{t('documents.risk.'+r)}</li>)}</ul></div>}
 </aside>;
}
