import {radialPath,gradientVector} from '../../lib/animation/shapes';
import {layerPathD} from '../../lib/animation/pathLayer';
import {effectPrimitives,effectBounds,revealedText,strokeAttributes} from '../../lib/animation/effects';
import type {InterfaceAsset} from '../../lib/interface/schema';
import {StudioStatus} from '../studios/StudioStatus';
import {useEffect,useMemo,useRef} from 'react';
import {Sparkles} from '../../lib/icons';
import {studioContextStore} from '../../lib/shell/studioContext';
import {registerAnimationCommands} from '../../lib/animation/commands';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {findComp,type Composition,type KeyRef,type Layer} from '../../lib/animation/model';
import {animatedChars} from '../../lib/animation/textAnimators';
import {maskDefs,maskId,matteId,hasMasks} from '../../lib/animation/masks';
import {layerBody} from '../../lib/animation/exportFrames';
import {sceneAt} from '../../lib/animation/scene';
import {pruneSelection} from '../../lib/animation/selection';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {FileTabs} from '../FileTabs';
import {StudioEmptyState} from '../studios/StudioEmptyState';
import {Button} from '../ui/button';
import {AnimationTimeline} from './AnimationTimeline';
import {MaskOverlay} from './MaskOverlay';
import {useMaskSelection} from '../../lib/animation/maskSelection';
import {PathLayerOverlay} from './PathLayerOverlay';
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
function animatedText(l:Layer,at:number){
 const shown=revealedText(l,at),spans=animatedChars(l,l.source.text??'',at);
 if(!spans)return shown;
 return spans.slice(0,Array.from(shown).length).map((c,i)=><tspan key={i} dx={c.dx} dy={c.dy} fontSize={(l.source.size??48)*c.scale} fillOpacity={c.opacity} rotate={c.rotate||undefined} fill={c.fill}>{c.ch}</tspan>);
}
const canClosePath=(l?:Layer)=>!!l&&l.kind==='shape'&&l.source.shape==='path'&&!!l.source.path;
function layerNode(l:Layer,assets:readonly InterfaceAsset[],at:number,fillOverride?:string){
 const src=l.source;const fill=fillOverride??src.color;
 if(l.kind==='raster'){const asset=assets.find(a=>a.id===src.assetId);return asset?<image href={asset.data} width={src.width} height={src.height}/>:<text fill="var(--text-primary)">Missing image</text>;}
 if(l.kind==='solid')return <rect x={0} y={0} width={src.width} height={src.height} fill={fill}/>;
 if(l.kind==='shape'&&['star','polygon'].includes(src.shape??''))return <path {...strokeAttributes(l,at)} d={radialPath(src)} fill={fill}/>;
 if(l.kind==='shape'&&src.shape==='path'&&src.path)return <path {...strokeAttributes(l,at)} d={layerPathD(l,at)} fill={fill}/>;
 if(l.kind==='shape')return src.shape==='ellipse'?<ellipse {...strokeAttributes(l,at)} cx={(src.width??0)/2} cy={(src.height??0)/2} rx={(src.width??0)/2} ry={(src.height??0)/2} fill={fill}/>:<rect {...strokeAttributes(l,at)} rx={src.shape==='roundedRect'?Math.min(src.radius??24,(src.width??0)/2,(src.height??0)/2):0} x={0} y={0} width={src.width} height={src.height} fill={fill}/>;
 return <text x={0} y={src.size??48} fontSize={src.size} fill={fill} fontFamily="system-ui, sans-serif" className="select-none">{animatedText(l,at)}</text>;
}
function Viewer({comp,at,selected,sel,assets}:{assets:readonly InterfaceAsset[];comp:Composition;at:number;selected:string|null;sel:readonly KeyRef[]}){
 const {t}=useT();const scene=useMemo(()=>sceneAt(comp,at),[comp,at]);const maskDefsHtml=useMemo(()=>maskDefs(comp,at,'preview-',(l,i)=>{try{return layerBody(l,i,assets,at,'preview-');}catch{return '';}}),[comp,at,assets]);
 const layer=comp.layers.find(l=>l.id===selected);const hasPos=!!layer&&layer.transform.position.keys.length>0;const msel=useMaskSelection(),penOn=msel.layerPen,lp=canClosePath(layer)&&msel.layerPoint?.layer===layer!.id?msel.layerPoint.i:null,lpt=lp!==null?layer!.source.path!.points[lp]:undefined;const canClose=canClosePath(layer)&&!layer!.source.path!.closed&&layer!.source.path!.points.length>=3&&!layer!.source.pathKeys?.length;
 const posSel=sel.filter(k=>k.layer===selected&&k.prop==='position');
 return <div className="relative grid min-h-[160px] flex-1 place-items-center overflow-hidden bg-hover p-3" data-testid="animation-viewer">
  <svg role="img" aria-label={t('animation.viewer')} viewBox={`0 0 ${comp.width} ${comp.height}`} className="max-h-full max-w-full h-full overflow-visible">
   <defs>{comp.layers.map((l,i)=><filter key={l.id} id={`preview-effect-${i}`} filterUnits="userSpaceOnUse" {...effectBounds(l,at)} colorInterpolationFilters="sRGB" dangerouslySetInnerHTML={{__html:effectPrimitives(l,at)}}/>)}</defs>
   <defs>{comp.layers.map((l,i)=>l.source.gradient&&<linearGradient key={l.id} id={`preview-gradient-${i}`} {...gradientVector(l.source.gradient.angle)}><stop offset="0" stopColor={l.source.gradient.start}/><stop offset="1" stopColor={l.source.gradient.end}/></linearGradient>)}</defs>
   <rect width={comp.width} height={comp.height} fill={comp.background}/>
   <defs dangerouslySetInnerHTML={{__html:maskDefsHtml}}/>
   {scene.map(({layer:l,matrix,opacity})=>{const i=comp.layers.indexOf(l);
    const drawn=<g key={l.id} transform={`matrix(${matrix.join(' ')})`} opacity={opacity} data-layer={l.id} data-selected={l.id===selected||undefined}
     onPointerDown={()=>animationSession().setView({selectedLayer:l.id})}><g mask={hasMasks(l)?`url(#${maskId('preview-',i)})`:undefined}><g filter={effectPrimitives(l,at)?`url(#preview-effect-${i})`:undefined}>{layerNode(l,assets,at,l.source.gradient?`url(#preview-gradient-${i})`:undefined)}</g></g></g>;
    return l.matte?<g key={l.id} mask={`url(#${matteId('preview-',i)})`}>{drawn}</g>:drawn;})}
   {layer&&hasPos&&<PathOverlay comp={comp} layer={layer} at={at} sel={sel}/>}
   {layer&&hasMasks(layer)&&<MaskOverlay comp={comp} layer={layer} at={at}/>}
   <PathLayerOverlay comp={comp} layer={layer} at={at}/>
  </svg>
  <div className="absolute left-2 top-2 flex gap-1" role="group" aria-label={t('animation.pathLayer.tools')}>
   <Button size="tiny" variant="outline" aria-pressed={penOn} disabled={!!layer?.locked} onClick={()=>void executeCommand('animation.layer.pen')} title={t('animation.pathLayer.penHint')} data-testid="animation-layerpen-toggle">{t('animation.pathLayer.pen')}</Button>
   <Button size="tiny" variant="outline" disabled={!canClose||!!layer?.locked} onClick={()=>void executeCommand('animation.layer.path',{layer:layer!.id,op:'close'})} data-testid="animation-layerpen-close">{t('animation.pathLayer.close')}</Button>
   <Button size="tiny" variant="outline" disabled={!lpt||!!layer?.locked} onClick={()=>void executeCommand('animation.layer.path',{layer:layer!.id,op:'corner',index:lp!,smooth:lpt!.inX===undefined&&lpt!.outX===undefined})} data-testid="animation-pathpoint-smooth">{t(lpt&&(lpt.inX!==undefined||lpt.outX!==undefined)?'animation.pathLayer.cornerPoint':'animation.pathLayer.smoothPoint')}</Button>
   <Button size="tiny" variant="outline" disabled={!lpt||!!layer?.locked} onClick={()=>void executeCommand('animation.layer.path',{layer:layer!.id,op:'remove',index:lp!})} data-testid="animation-pathpoint-delete">{t('animation.pathLayer.deletePoint')}</Button>
  </div>
  {hasPos&&<div className="absolute right-2 top-2 flex gap-1" role="group" aria-label={t('animation.path.label')}>
   <Button size="tiny" variant="outline" disabled={!posSel.length||!!layer?.locked} onClick={()=>void executeCommand('animation.keys.smooth')} data-testid="animation-path-smooth">{t('animation.path.smooth')}</Button>
   <Button size="tiny" variant="outline" disabled={!posSel.length||!!layer?.locked} onClick={()=>void executeCommand('animation.keys.straighten')} data-testid="animation-path-straight">{t('animation.path.straight')}</Button>
  </div>}
 </div>;
}
