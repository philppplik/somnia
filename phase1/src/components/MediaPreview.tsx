import {useMemo,useState} from 'react';
import {Maximize2,Minimize2,ExternalLink} from 'lucide-react';
import {findMedia,formatBytes,isMarkdown,useMedia,type MediaItem} from '../lib/media';
import {renderMarkdown} from '../lib/markdownRender';
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
export function RenderedPreview({file,text}:{file:string;text:string}){const {t}=useT();
 const media=useMedia();
 const md=isMarkdown(file);
 const html=useMemo(()=>md?renderMarkdown(text,{resolveImage:src=>{const clean=src.replace(/^\.\//,'').split(/[?#]/)[0];let p=clean;try{p=decodeURIComponent(clean);}catch{/* keep raw */}return findMedia(p.replace(/^.*\//,''))?.url??null;}}):'',[md,text,media.items]);
 const svgSrc=useMemo(()=>md?'':`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`,[md,text]);
 if(!md)return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('rest.mediaPreview.svgPreview')}>{text.trim()?<FitImage src={svgSrc} alt={file}/>:<div className="grid flex-1 place-items-center text-[12px] text-ink-3">{t('finish2.media.svgEmpty')}</div>}</section>;
 return <section className="canvas-stage flex min-h-0 flex-1 flex-col" aria-label={t('rest.mediaPreview.markdownPreview')}><div className={bar}><span className="truncate" data-testid="media-name">{file}</span><span className="text-ink-3">{t('rest.mediaPreview.markdownPreview')}</span></div>
  <div className="min-h-0 flex-1 overflow-auto"><article data-testid="md-preview" className="md-preview" onClick={e=>{const a=(e.target as HTMLElement).closest('a');if(!a)return;e.preventDefault();const href=a.getAttribute('href')??'';if(/^https?:/i.test(href))void openExternal(href).catch(()=>patchState({notice:t('finish2.media.linkFailed')}));}} dangerouslySetInnerHTML={{__html:html}}/>{!html&&<p className="md-empty">{t('finish2.media.mdEmpty')}</p>}</div></section>;}
