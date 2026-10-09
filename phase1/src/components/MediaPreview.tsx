import {SlidesCanvas} from './slides/SlidesCanvas';
import {PsdViewer} from './PsdViewer';
import {lazy,Suspense} from 'react';
const PdfInlineEditor=lazy(()=>import('./pdfedit/PdfInlineEditor').then(m=>({default:m.PdfInlineEditor})));
const DocxViewer=lazy(()=>import('./OfficeViewer').then(m=>({default:m.DocxViewer})));
const XlsxViewer=lazy(()=>import('./OfficeViewer').then(m=>({default:m.XlsxViewer})));
import {useEffect,useMemo,useState} from 'react';
import {Maximize2,Minimize2,ExternalLink} from '../lib/icons';
import {formatBytes,isMarkdown,isTex,type MediaItem} from '../lib/media';
import {MarkdownPreview} from './MarkdownPreview';
import {loadMathEngine,makeSink,useMathEngine} from '../lib/mathRender';
import {clearMathStatus,setMathStatus} from '../lib/mathStatus';
import {renderTex} from '../lib/texPreview';
import {useAppStore} from '../store/appStore';
import {useT} from '../lib/useT';
const bar='media-bar flex items-center gap-2 border-b border-subtle px-3 py-1.5 text-[12px]';
const tool='grid h-7 cursor-pointer grid-flow-col items-center gap-1 rounded-sm border-0 bg-transparent px-2 text-[12px] text-ink-2 hover:bg-hover';
function FitImage({src,alt,onSize}:{src:string;alt:string;onSize?:(w:number,h:number)=>void}){
 const {t}=useT();
 const [fit,setFit]=useState(true);const [dim,setDim]=useState<[number,number]|null>(null);
 return <><div className={bar}><span className="truncate" data-testid="media-name">{alt}</span><span className="text-ink-3" data-testid="media-dims">{dim?`${dim[0]} x ${dim[1]} px`:''}</span><span className="flex-1"/>
  <button className={tool} aria-pressed={fit} aria-label={t(fit?'finish2.media.actualAria':'finish2.media.fitAria')} onClick={()=>setFit(!fit)}>{fit?<Maximize2 size={13}/>:<Minimize2 size={13}/>}{t(fit?'finish2.media.actual':'finish2.media.fit')}</button></div>
  <div className="media-stage min-h-0 flex-1 overflow-auto p-4"><div className="grid min-h-full place-items-center"><img src={src} alt={alt} data-testid="media-image" draggable={false} onLoad={e=>{const i=e.currentTarget;setDim([i.naturalWidth,i.naturalHeight]);onSize?.(i.naturalWidth,i.naturalHeight);}} className="media-checker rounded-sm shadow-sm" style={fit?{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}:undefined}/></div></div></>;}
/** Preview for an opened PNG, JPEG or PDF. */
export function MediaViewer({item}:{item:MediaItem}){const {t}=useT();
 if(item.kind==='psd')return <PsdViewer key={item.url} item={item}/>;
 if(item.kind==='pdf')return <Suspense fallback={<div role="status" className="grid flex-1 place-items-center text-xs">Opening PDF…</div>}><PdfInlineEditor key={item.name} item={item}/></Suspense>;
 if(item.kind==='pptx')return <SlidesCanvas/>;
 if(item.kind==='docx'||item.kind==='xlsx')return <Suspense fallback={null}>{item.kind==='docx'?<DocxViewer item={item}/>:<XlsxViewer item={item}/>}</Suspense>;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('finish2.media.image')}>
  {item.warning&&<p className="px-3 py-2 text-xs text-ink-2" role="note" data-testid="raster-warning">{item.warning}</p>}
  <FitImage src={item.url} alt={item.name}/>
 </section>;}
/** Rendered preview for the active .md or .svg source file. */
let texBannerDismissed=false;
/** Math preview for .tex: not a compile. Shows the body, headings, lists and formulas, and lists what it left out. */
function TexPreview({file,text}:{file:string;text:string}){const {t}=useT();
 const prefs=useAppStore().editorPrefs;
 const shown=useDebounced(text,150,true);
 const engine=useMathEngine();
 const [dismissed,setDismissed]=useState(texBannerDismissed);
 useEffect(()=>{if(engine==='idle')void loadMathEngine();},[engine]);
 const out=useMemo(()=>{const sink=makeSink();if(engine==='failed')sink.fn=item=>`<span class="math-error" role="note">${item.tex.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>`;const r=renderTex(shown,sink);return{...r,sink};},[shown,engine]);
 useEffect(()=>{setMathStatus({kind:'tex',count:out.sink.count,errors:out.sink.errors.length,loading:out.sink.pending,failed:engine==='failed'});},[out,engine]);
 useEffect(()=>()=>clearMathStatus(),[]);
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('math.tex.title')}>
  <div className={bar}><span className="truncate" data-testid="media-name">{file}</span><span className="text-ink-3">{t('math.tex.title')}</span></div>
  {prefs.texBanner&&!dismissed&&<div className="tex-banner" role="note" data-testid="tex-banner"><span>{t('math.tex.banner')}</span><button className="math-retry" onClick={()=>{texBannerDismissed=true;setDismissed(true);}}>{t('math.tex.dismiss')}</button></div>}
  <div className="min-h-0 flex-1 overflow-auto"><article data-testid="tex-preview" className="md-preview tex-preview" dangerouslySetInnerHTML={{__html:out.html}}/>
   {!out.html.trim()&&<p className="md-empty">{t('math.tex.empty')}</p>}
   {out.sink.pending&&<p className="math-loading-note" role="status">{t('math.loading.note')}</p>}
   {engine==='failed'&&<p className="math-loading-note" role="alert">{t('math.failed')} <button className="math-retry" onClick={()=>void loadMathEngine()}>{t('math.retry')}</button> {t('math.failed.hint')}</p>}
   {out.ignored.length>0&&<p className="tex-ignored" data-testid="tex-ignored">{t('math.tex.ignored',{list:out.ignored.slice(0,12).join(' ')+(out.ignored.length>12?` +${out.ignored.length-12}`:'')})}</p>}</div></section>;}
/** Rendered preview for the active .md, .svg or .tex source file. */
export function RenderedPreview({file,text}:{file:string;text:string}){
 return isTex(file)?<TexPreview file={file} text={text}/>:isMarkdown(file)?<MarkdownPreview file={file} text={text}/>:<SvgPreview file={file} text={text}/>;}
function SvgPreview({file,text}:{file:string;text:string}){const {t}=useT();
 const svgSrc=useMemo(()=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`,[text]);
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('rest.mediaPreview.svgPreview')}>{text.trim()?<FitImage src={svgSrc} alt={file}/>:<div className="grid flex-1 place-items-center text-[12px] text-ink-3">{t('finish2.media.svgEmpty')}</div>}</section>;}
function useDebounced<T>(value:T,ms:number,on:boolean):T{
 const [v,setV]=useState(value);
 useEffect(()=>{if(!on){setV(value);return;}const id=window.setTimeout(()=>setV(value),ms);return()=>window.clearTimeout(id);},[value,ms,on]);
 return on?v:value;}
