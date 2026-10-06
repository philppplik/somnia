import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Menu} from '@base-ui/react/menu';
import {Link2,Columns2,LocateFixed} from 'lucide-react';
import {Button} from './ui/button';
import {findMedia,useMedia} from '../lib/media';
import {loadMarkdown,renderMarkdownBlocks,type MdBlock} from '../lib/markdownRender';
import {hasMath,hasMathDelims} from '../lib/mathExtract';
import {loadMathEngine,makeSink,useMathEngine} from '../lib/mathRender';
import {clearMathStatus,setMathStatus} from '../lib/mathStatus';
import {atBottom,lineToPreviewTop,previewTopToLine,type MapBlock} from '../lib/mdScrollMap';
import {revealInSource,setSyncScroll,useMdSource,useSyncScroll} from '../lib/mdBridge';
import {openFileTab,patchState,useAppStore,getState} from '../store/appStore';
import {executeCommand} from '../lib/commands';
import {openExternal} from '../lib/openExternal';
import {useT} from '../lib/useT';
type Status='loading'|'ok'|'error';
const resolveRel=(file:string,p:string)=>{const dir=file.includes('/')?file.replace(/\/[^/]*$/,'/'):'';return (dir+p).split('/').reduce<string[]>((a,x)=>{if(x==='..')a.pop();else if(x!=='.'&&x!=='')a.push(x);return a;},[]).join('/');};
/** Read-only Markdown preview rendered into this article (app DOM, not an iframe): escaped, policy-checked output only. */
export function MarkdownPreview({file,text}:{file:string;text:string}){
 const {t}=useT();const media=useMedia();const s=useAppStore();const src=useMdSource();const sync=useSyncScroll();
 const split=s.viewMode==='split';const scroller=useRef<HTMLDivElement>(null);const article=useRef<HTMLElement>(null);
 const [out,setOut]=useState<{html:string;blocks:MdBlock[]}|null>(null);const [status,setStatus]=useState<Status>('loading');const [stale,setStale]=useState(false);const [retry,setRetry]=useState(0);
 const [menu,setMenu]=useState<{x:number;y:number;range:[number,number]}|null>(null);
 const pendingFragment=useRef<string|null>(null);const rev=useRef(0);
 const mathOn=s.editorPrefs.mathMarkdown;const engine=useMathEngine();
 const resolveImage=useCallback((raw:string)=>{const clean=raw.replace(/^\.\//,'').split(/[?#]/)[0];const p=((): string=>{try{return decodeURIComponent(clean);}catch{return clean;}})();return (findMedia(resolveRel(file,p))??findMedia(p)??findMedia(p.replace(/^.*\//,'')))?.url??null;},[file,media.items]);
 // Render the in-memory buffer. Latest revision wins; hold the last good output during IME composition.
 useEffect(()=>{const my=++rev.current;
  const run=()=>{if(my!==rev.current)return;if(src?.composing){window.setTimeout(run,60);return;}
   loadMarkdown().then(()=>{if(my!==rev.current)return;try{const needsMath=mathOn&&hasMathDelims(text)&&hasMath(text);if(needsMath&&engine==='idle')void loadMathEngine();const sink=needsMath&&engine!=='failed'?makeSink():null;const r=renderMarkdownBlocks(text,{resolveImage,math:sink??undefined});setMathStatus({kind:'md',count:sink?.count??0,errors:sink?.errors.length??0,loading:!!sink?.pending,failed:needsMath&&engine==='failed'});setOut(r);setStatus('ok');setStale(false);}catch(e){if(my!==rev.current)return;setStatus('error');setStale(true);patchState({notice:`Preview: ${String(e)}`});}}).catch(()=>{if(my===rev.current){setStatus('error');setStale(true);}});};
  const id=window.setTimeout(run,60);return()=>window.clearTimeout(id);},[text,resolveImage,retry,src,mathOn,engine]);
 useEffect(()=>()=>clearMathStatus(),[]);
 // geometry of mapped blocks relative to the scroller
 const geo=useRef<MapBlock[]|null>(null);
 const blocks=():MapBlock[]=>{if(geo.current)return geo.current;const sc=scroller.current,ar=article.current;if(!sc||!ar)return [];const base=sc.getBoundingClientRect().top-sc.scrollTop;
  geo.current=[...ar.querySelectorAll<HTMLElement>('[data-md]')].map(el=>{const m=/^(\d+)-(\d+)$/.exec(el.dataset.md??'');const r=el.getBoundingClientRect();return m?{start:+m[1],end:+m[2],top:r.top-base,height:r.height}:null;}).filter((x):x is MapBlock=>!!x);return geo.current;};
 const prog=useRef(0);
 const toPreview=useCallback(()=>{const v=src,sc=scroller.current;if(!v||!sc)return;const st=v.scrollDOM;
  const target=atBottom(st.scrollTop,st.clientHeight,st.scrollHeight)?sc.scrollHeight-sc.clientHeight:(()=>{const y=Math.max(0,st.scrollTop-v.documentPadding.top);const b=v.lineBlockAtHeight(y);const ln=v.state.doc.lineAt(b.from).number-1+Math.min(1,Math.max(0,(y-b.top)/Math.max(1,b.height)));return lineToPreviewTop(blocks(),ln)-0;})();
  prog.current=performance.now();if(Math.abs(sc.scrollTop-target)>1)sc.scrollTop=target;},[src]);
 const toSource=useCallback(()=>{const v=src,sc=scroller.current;if(!v||!sc)return;const st=v.scrollDOM;
  const target=atBottom(sc.scrollTop,sc.clientHeight,sc.scrollHeight)?st.scrollHeight-st.clientHeight:(()=>{const L=previewTopToLine(blocks(),sc.scrollTop);const n=Math.min(v.state.doc.lines,Math.max(1,Math.floor(L)+1));const b=v.lineBlockAt(v.state.doc.line(n).from);return b.top+Math.min(1,L-Math.floor(L))*b.height+v.documentPadding.top;})();
  prog.current=performance.now();if(Math.abs(st.scrollTop-target)>1)st.scrollTop=target;},[src]);
 // Scroll sync: the pane the user scrolls drives the other one. Programmatic scrolls only ever hit the non-driver pane, so they cannot feed back.
 const driver=useRef<'src'|'pre'|null>(null);const lastDriver=useRef<'src'|'pre'>('src');
 useEffect(()=>{const sc=scroller.current;if(!src||!sc||!split||!sync)return;const st=src.scrollDOM;let raf=0;let pending:'src'|'pre'|null=null;
  const own=(d:'src'|'pre')=>()=>{driver.current=d;lastDriver.current=d;};const navKeys=new Set(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' ']);
  const keySrc=(e:KeyboardEvent)=>{if(navKeys.has(e.key)&&(e.key.startsWith('Page')||e.ctrlKey||e.metaKey))own('src')();else driver.current=null;};
  const keyPre=(e:KeyboardEvent)=>{if(navKeys.has(e.key))own('pre')();};
  const onScroll=(d:'src'|'pre')=>()=>{if(driver.current!==d)return;pending=d;if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const p=pending;pending=null;if(p==='src')toPreview();else if(p==='pre')toSource();});};
  const srcOwn=own('src'),preOwn=own('pre'),sS=onScroll('src'),sP=onScroll('pre');
  const evs:Array<[HTMLElement,string,EventListener]>=[[st,'wheel',srcOwn],[st,'touchstart',srcOwn],[st,'pointerdown',srcOwn],[st,'keydown',keySrc as EventListener],[sc,'wheel',preOwn],[sc,'touchstart',preOwn],[sc,'pointerdown',preOwn],[sc,'keydown',keyPre as EventListener],[st,'scroll',sS],[sc,'scroll',sP]];
  evs.forEach(([el,n,f])=>el.addEventListener(n,f,{passive:true}));
  // layout changes (resize, images, theme or font changes) recompute the geometry and keep the active anchor
  const relayout=()=>{geo.current=null;if(driver.current==null||lastDriver.current==='src')toPreview();else toSource();};
  const ro=new ResizeObserver(()=>{geo.current=null;if(lastDriver.current==='src')toPreview();});ro.observe(sc);if(article.current)ro.observe(article.current);ro.observe(st);
  const imgs=(e:Event)=>{if((e.target as HTMLElement).tagName==='IMG')relayout();};article.current?.addEventListener('load',imgs,true);
  const ar=article.current;
  return()=>{evs.forEach(([el,n,f])=>el.removeEventListener(n,f));ro.disconnect();ar?.removeEventListener('load',imgs,true);if(raf)cancelAnimationFrame(raf);};},[src,split,sync,toPreview,toSource]);
 // After a new render the old geometry is gone. Realign to the surviving anchor (source pane position) without moving the caret.
 useLayoutEffect(()=>{geo.current=null;if(src&&split&&sync&&out&&lastDriver.current==='src')toPreview();
  const f=pendingFragment.current;if(f&&out){pendingFragment.current=null;goFragment(f);}},[out]);// eslint-disable-line react-hooks/exhaustive-deps
 // Turning sync on aligns the inactive pane to the last user-scrolled pane (source if neither was scrolled).
 useEffect(()=>{if(src&&split&&sync&&out){geo.current=null;if(lastDriver.current==='pre')toSource();else toPreview();}},[sync,split]);// eslint-disable-line react-hooks/exhaustive-deps
 const goFragment=(id:string)=>{const ar=article.current,sc=scroller.current;if(!ar||!sc)return;let el:HTMLElement|null=null;for(const c of ar.querySelectorAll<HTMLElement>('[id]'))if(c.id===id){el=c;break;}
  if(el){const base=sc.getBoundingClientRect().top-sc.scrollTop;sc.scrollTop=el.getBoundingClientRect().top-base-8;}};
 const topBlock=():[number,number]|null=>{const sc=scroller.current;if(!sc)return null;const L=previewTopToLine(blocks(),sc.scrollTop);const hit=blocks().filter(b=>b.start<=L&&L<b.end).sort((a,b)=>(b.start-a.start)||((a.end-a.start)-(b.end-b.start)))[0];return hit?[hit.start,hit.end]:null;};
 const reveal=(range:[number,number]|null)=>{if(range)revealInSource(range[0],range[1]);};
 // palette command and header button use the top visible block
 useEffect(()=>{const h=()=>reveal(topBlock());window.addEventListener('somnia:md-reveal',h);return()=>window.removeEventListener('somnia:md-reveal',h);});
 const outline=(el:HTMLElement)=>{el.classList.add('md-reveal-flash');window.setTimeout(()=>el.classList.remove('md-reveal-flash'),900);};
 const onClick=(e:React.MouseEvent)=>{const a=(e.target as HTMLElement).closest('a');if(!a)return;e.preventDefault();const href=a.getAttribute('href')??'';
  if(href.startsWith('#')){goFragment(decodeURIComponent(href.slice(1)));return;}
  if(/^https?:/i.test(href)){void openExternal(href).catch(()=>patchState({notice:t('finish2.media.linkFailed')}));return;}
  if(/^mailto:/i.test(href)){patchState({notice:t('md.linkUnsupported')});return;}
  const [pathPart,frag]=href.split('#');const path=resolveRel(file,(()=>{try{return decodeURIComponent(pathPart);}catch{return pathPart;}})());
  if(!path&&frag){goFragment(frag);return;}
  if(!path||!Object.prototype.hasOwnProperty.call(getState().files,path)){patchState({notice:t('md.linkMissing',{path:pathPart})});return;}
  if(!/\.(md|markdown)$/i.test(path)){patchState({notice:t('md.linkUnsupported')});return;}
  if(frag)pendingFragment.current=decodeURIComponent(frag);openFileTab(path);};
 const onContext=(e:React.MouseEvent)=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-md]');if(!el)return;const m=/^(\d+)-(\d+)$/.exec(el.dataset.md??'');if(!m)return;e.preventDefault();outline(el);setMenu({x:Math.min(e.clientX,window.innerWidth-200),y:Math.min(e.clientY,window.innerHeight-60),range:[+m[1],+m[2]]});};
 useEffect(()=>{if(!menu)return;const close=()=>setMenu(null);const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};},[menu]);
 const html=out?.html??'';const empty=status==='ok'&&!text.trim();
 const layout=useMemo(()=>[['split.vertical',t('md.layout.vertical')],['split.horizontal',t('md.layout.horizontal')],['split.swap',t('md.layout.swap')]] as const,[t]);
 return <section className="md-pane flex min-h-0 flex-1 flex-col" aria-label={t('md.previewLabel')} data-testid="md-pane">
  <div className="md-head flex h-9 shrink-0 items-center gap-0.5 border-b border-subtle px-2">
   <span className="truncate px-1 text-[11px] font-medium text-ink-2" data-testid="media-name" title={file}>{t('md.label.preview')}</span><span className="flex-1"/>
   <Button size="icon" className="md-tool !size-7 min-w-7" data-testid="md-reveal-block" aria-label={t('md.revealBlock')} title={t('md.revealBlock')} onClick={()=>reveal(topBlock())}><LocateFixed size={15}/></Button>
   {split&&<Button size="icon" className={`md-tool !size-7 min-w-7 ${sync?'bg-accent-soft text-accent':''}`} data-testid="md-sync" aria-pressed={sync} aria-label={t('md.sync')} title={t('md.sync')} onClick={()=>setSyncScroll(!sync)}><Link2 size={15}/></Button>}
   <Menu.Root><Menu.Trigger render={<Button size="icon" className="md-tool !size-7 min-w-7" data-testid="md-layout" aria-label={t('md.layout')} title={t('md.layout')}/>}><Columns2 size={15}/></Menu.Trigger>
    <Menu.Portal><Menu.Positioner sideOffset={4}><Menu.Popup className="menu-popup">{layout.map(([id,label])=><Menu.Item key={id} className="menu-item" onClick={()=>void executeCommand(id)}><span>{label}</span></Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
  </div>
  <div ref={scroller} className="md-scroll min-h-0 flex-1 overflow-auto" data-testid="md-scroll" tabIndex={-1}>
   {status==='error'&&<div className="md-notice" role="alert" data-testid="md-error"><span>{t('md.error')}</span><Button size="compact" onClick={()=>{setStatus('loading');setRetry(n=>n+1);}}>{t('md.retry')}</Button>{stale&&html&&<em>{t('md.lastGood')}</em>}</div>}
   {status==='loading'&&!html&&<p className="md-empty" data-testid="md-loading">{t('md.loading')}</p>}
   {empty&&<p className="md-empty" data-testid="md-empty">{t('md.empty')}</p>}
   <article ref={article} data-testid="md-preview" className="md-preview" onClick={onClick} onContextMenu={onContext} dangerouslySetInnerHTML={{__html:empty?'':html}}/>
  </div>
  {menu&&<div className="menu-popup fixed z-[200]" style={{left:menu.x,top:menu.y}} role="menu" onPointerDown={e=>e.stopPropagation()}><button role="menuitem" className="menu-item w-full" data-testid="md-reveal" autoFocus onClick={()=>{const r=menu.range;setMenu(null);reveal(r);}}>{t('md.reveal')}</button></div>}
 </section>;}
