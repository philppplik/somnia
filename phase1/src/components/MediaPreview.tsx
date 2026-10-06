import {useEffect,useMemo,useState} from 'react';
import {Maximize2,Minimize2,ExternalLink} from '../lib/icons';
import {findMedia,formatBytes,isMarkdown,isTex,useMedia,type MediaItem} from '../lib/media';
import {renderMarkdownEx} from '../lib/markdownRender';
import {hasMath,hasMathDelims} from '../lib/mathExtract';
import {loadMathEngine,makeSink,useMathEngine} from '../lib/mathRender';
import {clearMathStatus,setMathStatus} from '../lib/mathStatus';
import {renderTex} from '../lib/texPreview';
import {useAppStore} from '../store/appStore';
import {patchState} from '../store/appStore';
import {openExternal} from '../lib/openExternal';
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
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t(item.kind==='pdf'?'finish2.media.pdf':'finish2.media.image')}>
  {item.kind==='image'?<FitImage src={item.url} alt={item.name}/>:<>
   <div className={bar}><span className="truncate" data-testid="media-name">{item.name}</span><span className="text-ink-3">PDF, {formatBytes(item.size)}</span><span className="flex-1"/><a className={tool} href={item.url} target="_blank" rel="noreferrer" aria-label={t('rest.mediaPreview.openPdfInANew')}><ExternalLink size={13}/>{t('rest.mediaPreview.open')}</a></div>
   <iframe title={t('finish2.media.pdfTitle',{name:item.name})} data-testid="pdf-frame" src={item.url} className="min-h-0 w-full flex-1 border-0 bg-white"/></>}
 </section>;}
/** Rendered preview for the active .md or .svg source file. */
function RenderedTextPreview({file,text}:{file:string;text:string}){const {t}=useT();
 const media=useMedia();
 const md=isMarkdown(file);
 const mathOn=useAppStore().editorPrefs.mathMarkdown&&md;
 const shown=useDebounced(text,150,mathOn&&hasMathDelims(text));
 const needsMath=useMemo(()=>mathOn&&hasMath(shown),[mathOn,shown]);
 const engine=useMathEngine();
 useEffect(()=>{if(needsMath&&engine==='idle')void loadMathEngine();},[needsMath,engine]);
 const out=useMemo(()=>{if(!md)return{html:'',sink:null};const sink=needsMath&&engine!=='failed'?makeSink():null;const r=renderMarkdownEx(shown,{math:sink??undefined,resolveImage:src=>{const clean=src.replace(/^\.\//,'').split(/[?#]/)[0];let p=clean;try{p=decodeURIComponent(clean);}catch{/* keep raw */}const dir=file.includes('/')?file.replace(/\/[^/]*$/,'/'):'';const rel=(dir+p).split('/').reduce<string[]>((a,x)=>{if(x==='..')a.pop();else if(x!=='.'&&x!=='')a.push(x);return a;},[]).join('/');return (findMedia(rel)??findMedia(p)??findMedia(p.replace(/^.*\//,'')))?.url??null;}});return{html:r.html,sink,warnings:r.warnings};},[md,shown,media.items,needsMath,engine]);
 const html=out.html;
 useEffect(()=>{if(!md)return;const sink=out.sink;setMathStatus({kind:'md',count:sink?.count??0,errors:(sink?.errors.length??0),loading:!!sink?.pending,failed:needsMath&&engine==='failed'});},[md,out,needsMath,engine]);
 useEffect(()=>()=>clearMathStatus(),[]);
 const svgSrc=useMemo(()=>md?'':`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`,[md,text]);
 if(!md)return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('rest.mediaPreview.svgPreview')}>{text.trim()?<FitImage src={svgSrc} alt={file}/>:<div className="grid flex-1 place-items-center text-[12px] text-ink-3">{t('finish2.media.svgEmpty')}</div>}</section>;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('rest.mediaPreview.markdownPreview')}><div className={bar}><span className="truncate" data-testid="media-name">{file}</span><span className="text-ink-3">{t('rest.mediaPreview.markdownPreview')}</span></div>
  <div className="min-h-0 flex-1 overflow-auto"><article data-testid="md-preview" className="md-preview" onClick={e=>{const a=(e.target as HTMLElement).closest('a');if(!a)return;e.preventDefault();const href=a.getAttribute('href')??'';if(/^https?:/i.test(href))void openExternal(href).catch(()=>patchState({notice:t('finish2.media.linkFailed')}));}} dangerouslySetInnerHTML={{__html:html}}/>{!html&&<p className="md-empty">{t('finish2.media.mdEmpty')}</p>}{out.sink?.pending&&<p className="math-loading-note" role="status">{t('math.loading.note')}</p>}{needsMath&&engine==='failed'&&<p className="math-loading-note" role="alert">{t('math.failed')} <button className="math-retry" onClick={()=>void loadMathEngine()}>{t('math.retry')}</button> {t('math.failed.hint')}</p>}</div></section>;}

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
export function RenderedPreview({file,text}:{file:string;text:string}){return isTex(file)?<TexPreview file={file} text={text}/>:<RenderedTextPreview file={file} text={text}/>;}
function useDebounced<T>(value:T,ms:number,on:boolean):T{
 const [v,setV]=useState(value);
 useEffect(()=>{if(!on){setV(value);return;}const id=window.setTimeout(()=>setV(value),ms);return()=>window.clearTimeout(id);},[value,ms,on]);
 return on?v:value;}
