import {RasterEditor,useRasterEditor} from './RasterEditor';
import type {CodeTheme} from '../lib/appearance';
import {lazy,Suspense} from 'react';
import {ErrorBoundary} from './ErrorBoundary';
import {EmptyState} from './EmptyState';
import {FileTabs} from './FileTabs';
const DiffSplit=lazy(()=>import('./DiffSplit').then(m=>({default:m.DiffSplit})));
const SourceEditor=lazy(()=>import('./SourceEditor').then(m=>({default:m.SourceEditor})));
import {DesignCanvas} from './DesignCanvas';
import {LivePreview} from './LivePreview';
import {MediaViewer,RenderedPreview} from './MediaPreview';
import {isRenderedText,isMarkdown,useMedia} from '../lib/media';
import {MarkdownToolbar} from './MarkdownToolbar';
import {SvgEditor} from './svgedit/SvgEditor';
import {isSvg} from '../lib/media';
import {useMdSource} from '../lib/mdBridge';
import {useRef} from 'react';
import { useAppStore,patchState } from '../store/appStore';
import {useT} from '../lib/useT';
const DEFAULT_RATIO=0.48,MIN_PX=240;
const MD_RATIO=0.5;
/** Draggable divider between code and design in split view. Arrow keys nudge, double click resets. */
function SplitDivider({box,md}:{box:React.RefObject<HTMLDivElement|null>;md?:boolean}){const {t}=useT();const reset=md?MD_RATIO:DEFAULT_RATIO;
 const state=useAppStore();const horizontal=state.splitLayout==='horizontal';
 const clamp=(r:number)=>{const el=box.current;const size=el?(horizontal?el.clientHeight:el.clientWidth):1000;const lo=Math.min(0.5,MIN_PX/size);return Math.min(1-lo,Math.max(lo,r));};
 const move=(e:{clientX:number;clientY:number})=>{const el=box.current;if(!el)return;const r=el.getBoundingClientRect();let v=horizontal?(e.clientY-r.top)/r.height:(e.clientX-r.left)/r.width;if(state.splitSwap)v=1-v;patchState({splitRatio:clamp(v)});};
 return <div role="separator" tabIndex={0} aria-orientation={horizontal?'horizontal':'vertical'} aria-label={md?`${t('md.srcLabel')} / ${t('md.previewLabel')}`:t('rest.canvas.resizeCodeAndDesignPanes')} aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(state.splitRatio*100)} className={`split-divider ${horizontal?'split-divider-h':'split-divider-v'}`}
  onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))move(e);}} onDoubleClick={()=>patchState({splitRatio:reset})}
  onKeyDown={e=>{const step=e.shiftKey?0.1:0.02;const dir=horizontal?{ArrowUp:-1,ArrowDown:1}[e.key]:{ArrowLeft:-1,ArrowRight:1}[e.key];if(e.key==='Home'||e.key==='Enter'){e.preventDefault();patchState({splitRatio:reset});return;}if(!dir)return;e.preventDefault();patchState({splitRatio:clamp(state.splitRatio+dir*step*(state.splitSwap?-1:1))});}}/>;
}
export function Canvas(){const {t}=useT();const raster=useRasterEditor();
 const box=useRef<HTMLDivElement>(null);
 const state=useAppStore();const media=useMedia();const mdView=useMdSource();const activeMedia=media.items.find(i=>i.name===media.active);
 const mdFile=isMarkdown(state.activeFile)&&!activeMedia;
 const code=<section className="code-pane" aria-label={mdFile?t('md.srcLabel'):t('rest.canvas.sourceEditor')} style={state.viewMode==='split'?{flex:`0 0 ${state.splitRatio*100}%`}:undefined}>{mdFile?<MarkdownToolbar view={mdView}/>:<FileTabs/>}<ErrorBoundary label="Source editor" compact><Suspense fallback={<div className="px-3 py-2 text-[10px] text-ink-3">Loading source editor...</div>}>{state.diffSplit?<DiffSplit file={state.activeFile}/>:<SourceEditor source={state.files[state.activeFile]??''} file={state.activeFile} disabled={!state.coreConnected}/>}</Suspense></ErrorBoundary></section>;
 if(raster.active)return <RasterEditor/>;
 if(activeMedia)return <main className="center" aria-label={t('rest.canvas.editorWorkspace')}><div className="workspace"><section className="code-pane" aria-label={t('rest.canvas.mediaPreview')}><FileTabs/><MediaViewer item={activeMedia}/></section></div></main>;
 if(!state.coreConnected)return <EmptyState/>;
 const rendered=isRenderedText(state.activeFile);
 return <main className="center" aria-label={t('rest.canvas.editorWorkspace')}>{mdFile&&<FileTabs/>}<div ref={box} className={`workspace workspace-${state.viewMode}${state.viewMode==='split'?` split-${state.splitLayout}${state.splitSwap?' split-swap':''}`:''}`}>{state.viewMode!=='design'&&code}{state.viewMode==='split'&&<SplitDivider box={box} md={mdFile}/>}{state.viewMode!=='code'&&(isSvg(state.activeFile)?<SvgEditor file={state.activeFile} text={state.files[state.activeFile]??''}/>:rendered?<RenderedPreview file={state.activeFile} text={state.files[state.activeFile]??''}/>:state.livePreview?<LivePreview/>:<DesignCanvas/>)}</div></main>;
}
