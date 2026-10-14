import {effectPrimitives,effectBounds} from '../../lib/animation/effects';
import type {InterfaceAsset} from '../../lib/interface/schema';
import {StudioStatus} from '../studios/StudioStatus';
import {useEffect,useMemo,useRef} from 'react';
import {Sparkles} from '../../lib/icons';
import {studioContextStore} from '../../lib/shell/studioContext';
import {registerAnimationCommands} from '../../lib/animation/commands';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {findComp,type Composition,type KeyRef,type Layer} from '../../lib/animation/model';
import {sceneAt} from '../../lib/animation/scene';
import {pruneSelection} from '../../lib/animation/selection';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {FileTabs} from '../FileTabs';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {Button} from '../ui/button';
import {AnimationTimeline} from './AnimationTimeline';
import {PathOverlay} from './PathOverlay';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
/** Canvas of the Animation studio: viewer above a timeline, or a starter when no composition is open. */
export function AnimationCanvas(){
 const {t}=useT();const s=useAnimationState();const doc=s.preview??s.doc;
 const claim=useRef<ReturnType<typeof studioContextStore.claim>|null>(null);
 useEffect(()=>registerAnimationCommands(),[]);
 useEffect(()=>{const owner=studioContextStore.claim('animation',undefined);claim.current=owner;return()=>{animationSession().suspend();owner.release();claim.current=null;};},[]);
 useEffect(()=>{
  const d=s.doc;
  claim.current?.report({document:d?{id:d.id,kind:'animation',dirty:s.dirty,readOnly:false}:undefined,
   selection:s.view.selectedLayer?{kind:'one',count:1,type:'layer',ids:[s.view.selectedLayer]}:{kind:'none',count:0,ids:[]},
   data:{playhead:s.view.playhead,layers:d?findComp(d)?.layers.length??0:0},busy:false,services:{ready:!!d,renderSetup:s.renderSetup}});
 },[s.doc,s.dirty,s.view.selectedLayer,s.view.playhead,s.renderSetup]);
 return <main className="center" aria-label={t('animation.title')}><div className="workspace"><section className="code-pane flex min-h-0 flex-col" aria-label={t('animation.title')}>
  <FileTabs/>
  {doc?<Workspace doc={doc}/>:<StudioEmptyState studio="animation" icon={<Sparkles/>}
   onOpen={()=>{if(!animationSession().recover())throw new Error(t('animation.start.restoreEmpty'));}}
   onCreate={()=>executeCommand('animation.project.new')}/>}
 </section></div></main>;
}
function Workspace({doc}:{doc:NonNullable<ReturnType<typeof animationSession>['document']>}){
 const {t}=useT();const s=useAnimationState();const comp=findComp(doc)!;const at=s.view.playhead;
 return <div className="flex min-h-0 flex-1 flex-col" data-testid="animation-workspace">
  <Viewer assets={doc.assets} comp={comp} at={at} selected={s.view.selectedLayer} sel={pruneSelection(s.doc,s.view.selectedKeys)}/>
  {s.recoveryFailed&&<StudioStatus tone="error" live="assertive" className="m-0 px-3 py-1 text-[11px]">{t('animation.recoveryFailed')}</StudioStatus>}
  <AnimationTimeline comp={comp} at={at} selected={s.view.selectedLayer} canUndo={s.canUndo} canRedo={s.canRedo}/>
 </div>;
}
function layerNode(l:Layer,assets:readonly InterfaceAsset[]){
 const src=l.source;
 if(l.kind==='raster'){const asset=assets.find(a=>a.id===src.assetId);return asset?<image href={asset.data} width={src.width} height={src.height}/>:<text fill="#ffffff">Missing image</text>;}
 if(l.kind==='solid')return <rect x={0} y={0} width={src.width} height={src.height} fill={src.color}/>;
 if(l.kind==='shape')return src.shape==='ellipse'?<ellipse cx={(src.width??0)/2} cy={(src.height??0)/2} rx={(src.width??0)/2} ry={(src.height??0)/2} fill={src.color}/>:<rect x={0} y={0} width={src.width} height={src.height} fill={src.color}/>;
 return <text x={0} y={src.size??48} fontSize={src.size} fill={src.color} fontFamily="system-ui, sans-serif" style={{userSelect:'none'}}>{src.text}</text>;
}
function Viewer({comp,at,selected,sel,assets}:{assets:readonly InterfaceAsset[];comp:Composition;at:number;selected:string|null;sel:readonly KeyRef[]}){
 const {t}=useT();const scene=useMemo(()=>sceneAt(comp,at),[comp,at]);
 const layer=comp.layers.find(l=>l.id===selected);const hasPos=!!layer&&layer.transform.position.keys.length>0;
 const posSel=sel.filter(k=>k.layer===selected&&k.prop==='position');
 return <div className="relative grid min-h-[160px] flex-1 place-items-center overflow-hidden bg-hover p-3" data-testid="animation-viewer">
  <svg role="img" aria-label={t('animation.viewer')} viewBox={`0 0 ${comp.width} ${comp.height}`} className="max-h-full max-w-full" style={{aspectRatio:`${comp.width}/${comp.height}`,height:'100%',overflow:'visible'}}>
   <defs>{comp.layers.map((l,i)=><filter key={l.id} id={`preview-effect-${i}`} filterUnits="userSpaceOnUse" {...effectBounds(l)} colorInterpolationFilters="sRGB" dangerouslySetInnerHTML={{__html:effectPrimitives(l)}}/>)}</defs>
   <rect width={comp.width} height={comp.height} fill={comp.background}/>
   {scene.map(({layer:l,matrix,opacity})=><g key={l.id} transform={`matrix(${matrix.join(' ')})`} opacity={opacity} data-layer={l.id} data-selected={l.id===selected||undefined}
    onPointerDown={()=>animationSession().setView({selectedLayer:l.id})}><g filter={effectPrimitives(l)?`url(#preview-effect-${comp.layers.indexOf(l)})`:undefined}>{layerNode(l,assets)}</g></g>)}
   {layer&&hasPos&&<PathOverlay comp={comp} layer={layer} at={at} sel={sel}/>}
  </svg>
  {hasPos&&<div className="absolute right-2 top-2 flex gap-1" role="group" aria-label={t('animation.path.label')}>
   <Button size="tiny" variant="outline" disabled={!posSel.length||!!layer?.locked} onClick={()=>void executeCommand('animation.keys.smooth')} data-testid="animation-path-smooth">{t('animation.path.smooth')}</Button>
   <Button size="tiny" variant="outline" disabled={!posSel.length||!!layer?.locked} onClick={()=>void executeCommand('animation.keys.straighten')} data-testid="animation-path-straight">{t('animation.path.straight')}</Button>
  </div>}
 </div>;
}
