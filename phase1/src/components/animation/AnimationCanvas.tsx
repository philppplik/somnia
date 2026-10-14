import {evaluate} from '../../lib/animation/interpolate';
import {gradientAt} from '../../lib/animation/gradientAnim';
import {repeaterCopies,repeaterAt} from '../../lib/animation/repeater';
import {radialPath,gradientVector,CUT_KEEP,CUT_HOLE} from '../../lib/animation/shapes';
import {layerPathD,layerFillRule} from '../../lib/animation/pathLayer';
import {effectPrimitives,effectBounds,revealedText,strokeAttributes,layerColorsAt} from '../../lib/animation/effects';
import type {InterfaceAsset} from '../../lib/interface/schema';
import {StudioStatus} from '../studios/StudioStatus';
import {useEffect,useMemo,useRef} from 'react';
import {Sparkles} from '../../lib/icons';
import {studioContextStore} from '../../lib/shell/studioContext';
import {registerAnimationCommands} from '../../lib/animation/commands';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {findComp,type Composition,type KeyRef,type Layer} from '../../lib/animation/model';
import {ViewerGuides} from './ViewerGuides';
import {animatedChars,textPathD,textPathId,textPathStartAt} from '../../lib/animation/textAnimators';
import {maskDefs,maskId,matteId,hasMasks} from '../../lib/animation/masks';
import {layerBody,precompImage,setRenderComps} from '../../lib/animation/exportFrames';
import {sceneAt,motionBlurTicks,contentSampled} from '../../lib/animation/scene';
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
  <Viewer assets={doc.assets} comps={doc.compositions} comp={comp} at={at} selected={s.view.selectedLayer} sel={pruneSelection(s.doc,s.view.selectedKeys)}/>
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
function GradientDef({id,g}:{id:string;g:{start:string;end:string;angle:number;kind?:'linear'|'radial';/** Opacity of the start and end colour, percent 0..100 (absent means 100). */startOpacity?:number;endOpacity?:number;/** Radial only: centre (0..1 of the box, default 0.5) and radius (0.05..1.5, default 0.5). */cx?:number;cy?:number;radius?:number;stops?:readonly {offset:number;color:string;opacity?:number}[]}}){
 const so=(o?:number)=>o!==undefined&&o<100?Math.round(o)/100:undefined;
 const stops=<><stop offset="0" stopColor={g.start} stopOpacity={so(g.startOpacity)}/>{(g.stops??[]).map(x=><stop key={x.offset} offset={x.offset} stopColor={x.color} stopOpacity={so(x.opacity)}/>)}<stop offset="1" stopColor={g.end} stopOpacity={so(g.endOpacity)}/></>;
 return g.kind==='radial'?<radialGradient id={id} cx={g.cx??0.5} cy={g.cy??0.5} r={g.radius??0.5}>{stops}</radialGradient>:<linearGradient id={id} {...gradientVector(g.angle)}>{stops}</linearGradient>;
}
function layerNode(layer:Layer,assets:readonly InterfaceAsset[],at:number,fillOverride?:string,strokePaint?:string){
 const l=layerColorsAt(layer,at),src=l.source;const fill=fillOverride??src.color;
 if(l.kind==='comp'){const p=precompImage(l,at,assets);return p?<image href={p.href} width={p.width} height={p.height}/>:<text fill="var(--text-primary)">Missing composition</text>;}
 if(l.kind==='raster'){const asset=assets.find(a=>a.id===src.assetId);return asset?<image href={asset.data} width={src.width} height={src.height}/>:<text fill="var(--text-primary)">Missing image</text>;}
 if(l.kind==='solid')return <rect x={0} y={0} width={src.width} height={src.height} fill={fill}/>;
 if(l.kind==='shape'){
  const sa=strokeAttributes(l,at,strokePaint),star=['star','polygon'].includes(src.shape??''),pathShape=src.shape==='path'&&!!src.path;
  const el=(sv:object|undefined,f:string,clip=false)=>star?<path {...(sv??{})} d={radialPath(src)} fill={f}/>
   :pathShape?<path {...(sv??{})} d={layerPathD(l,at)} {...(clip?{clipRule:layerFillRule(l)?'evenodd' as const:undefined}:{fillRule:layerFillRule(l)})} fill={f}/>
   :src.shape==='ellipse'?<ellipse {...(sv??{})} cx={(src.width??0)/2} cy={(src.height??0)/2} rx={(src.width??0)/2} ry={(src.height??0)/2} fill={f}/>
   :<rect {...(sv??{})} rx={src.shape==='roundedRect'?Math.min(src.radius??24,(src.width??0)/2,(src.height??0)/2):0} x={0} y={0} width={src.width} height={src.height} fill={f}/>;
  const align=l.stroke?.align;
  if(sa&&(align==='inside'||align==='outside')&&!(pathShape&&!src.path!.closed)){
   const id=`preview-stroke-align-${l.id}-${at}`;
   return <>{el(undefined,fill??'none')}<defs>{align==='inside'?<clipPath id={id}>{el(undefined,CUT_KEEP,true)}</clipPath>:<mask id={id} maskUnits="userSpaceOnUse" x={-4096} y={-4096} width={9000} height={9000}><rect x={-4096} y={-4096} width={9000} height={9000} fill={CUT_KEEP}/>{el(undefined,CUT_HOLE)}</mask>}</defs><g {...(align==='inside'?{clipPath:`url(#${id})`}:{mask:`url(#${id})`})}>{el({...sa,strokeWidth:sa.strokeWidth*2},'none')}</g></>;
  }
  return el(sa,fill??'none');
 }
 const tp=textPathD(l);
 if(tp)return <><defs><path id={textPathId(l)} d={tp}/></defs><text fontSize={src.size} fill={fill} fontFamily="system-ui, sans-serif" className="select-none"><textPath href={`#${textPathId(l)}`} startOffset={`${textPathStartAt(l,at)}%`}>{animatedText(l,at)}</textPath></text></>;
 return <text x={0} y={src.size??48} fontSize={src.size} fill={fill} fontFamily="system-ui, sans-serif" className="select-none">{animatedText(l,at)}</text>;
}
function Viewer({comp,at,selected,sel,assets,comps}:{assets:readonly InterfaceAsset[];comps:readonly Composition[];comp:Composition;at:number;selected:string|null;sel:readonly KeyRef[]}){
 const {t}=useT();setRenderComps(comps);const scene=useMemo(()=>sceneAt(comp,at),[comp,at]);const maskDefsHtml=useMemo(()=>maskDefs(comp,at,'preview-',(l,i)=>{try{return layerBody(l,i,assets,at,'preview-');}catch{return '';}}),[comp,at,assets]);
 const layer=comp.layers.find(l=>l.id===selected);const hasPos=!!layer&&layer.transform.position.keys.length>0;const msel=useMaskSelection(),penOn=msel.layerPen,lp=canClosePath(layer)&&msel.layerPoint?.layer===layer!.id?msel.layerPoint.i:null,lset:readonly number[]=canClosePath(layer)&&msel.layerSet?.layer===layer!.id?msel.layerSet.set:lp!==null?[lp]:[],lpt=lp!==null?layer!.source.path!.points[lp]:undefined;const canClose=canClosePath(layer)&&!layer!.source.path!.closed&&layer!.source.path!.points.length>=3&&!layer!.source.pathKeys?.length;
 const posSel=sel.filter(k=>k.layer===selected&&k.prop==='position');
 return <div className="relative grid min-h-[160px] flex-1 place-items-center overflow-hidden bg-hover p-3" data-testid="animation-viewer">
  <svg role="img" aria-label={t('animation.viewer')} viewBox={`0 0 ${comp.width} ${comp.height}`} className="max-h-full max-w-full h-full overflow-visible">
   <defs>{comp.layers.map((l,i)=><filter key={l.id} id={`preview-effect-${i}`} filterUnits="userSpaceOnUse" {...effectBounds(l,at)} colorInterpolationFilters="sRGB" dangerouslySetInnerHTML={{__html:effectPrimitives(l,at)}}/>)}</defs>
   <defs>{comp.layers.map((l,i)=>l.source.gradient&&<GradientDef key={l.id} id={`preview-gradient-${i}`} g={gradientAt(l.source.gradient,at)}/>)}{comp.layers.map((l,i)=>l.stroke?.gradient&&<GradientDef key={`s-${l.id}`} id={`preview-stroke-gradient-${i}`} g={gradientAt(l.stroke.gradient,at)}/>)}</defs>
   <rect width={comp.width} height={comp.height} fill={comp.background}/>
   <defs dangerouslySetInnerHTML={{__html:maskDefsHtml}}/>
   {scene.map(({layer:l,matrix,opacity})=>{const i=comp.layers.indexOf(l);
    const contentOnce=(tk:number)=><g mask={hasMasks(l)?`url(#${maskId('preview-',i)})`:undefined}><g filter={effectPrimitives(l,at)?`url(#preview-effect-${i})`:undefined}>{layerNode(l,assets,tk,l.source.gradient?`url(#preview-gradient-${i})`:undefined,l.stroke?.gradient?`url(#preview-stroke-gradient-${i})`:undefined)}</g></g>;
    const contentAt=(tk:number)=>{if(!l.repeater)return contentOnce(tk);const a=evaluate(l.transform.anchor,tk) as [number,number];return <>{repeaterCopies(repeaterAt(l.repeater,tk),[a[0],a[1]]).map((c,ci)=><g key={ci} transform={c.transform} opacity={c.opacity<1?c.opacity:undefined} filter={c.filter}>{contentOnce(tk)}</g>)}{contentOnce(tk)}</>;};
    const content=contentAt(at),each=contentSampled(l);
    const blur=motionBlurTicks(comp,l,at);
    const drawn=blur.length?<g key={l.id} opacity={opacity} data-layer={l.id} data-blur={blur.length} data-selected={l.id===selected||undefined} onPointerDown={()=>animationSession().setView({selectedLayer:l.id})}>{blur.map((m,j)=><g key={j} transform={`matrix(${m.matrix.join(' ')})`} opacity={1/(j+1)}>{each?contentAt(m.tick):content}</g>)}</g>
     :<g key={l.id} transform={`matrix(${matrix.join(' ')})`} opacity={opacity} data-layer={l.id} data-selected={l.id===selected||undefined}
     onPointerDown={()=>animationSession().setView({selectedLayer:l.id})}>{content}</g>;
    return l.matte?<g key={l.id} mask={`url(#${matteId('preview-',i)})`}>{drawn}</g>:drawn;})}
   {layer&&hasPos&&<PathOverlay comp={comp} layer={layer} at={at} sel={sel}/>}
   {layer&&hasMasks(layer)&&<MaskOverlay comp={comp} layer={layer} at={at}/>}
   <PathLayerOverlay comp={comp} layer={layer} at={at}/>
   <ViewerGuides comp={comp}/>
  </svg>
  <div className="absolute left-2 top-2 flex gap-1" role="group" aria-label={t('animation.pathLayer.tools')}>
   <Button size="tiny" variant="outline" aria-pressed={penOn} disabled={!!layer?.locked} onClick={()=>void executeCommand('animation.layer.pen')} title={t('animation.pathLayer.penHint')} data-testid="animation-layerpen-toggle">{t('animation.pathLayer.pen')}</Button>
   <Button size="tiny" variant="outline" disabled={!canClose||!!layer?.locked} onClick={()=>void executeCommand('animation.layer.path',{layer:layer!.id,op:'close'})} data-testid="animation-layerpen-close">{t('animation.pathLayer.close')}</Button>
   <Button size="tiny" variant="outline" disabled={!lpt||!!layer?.locked} onClick={()=>void executeCommand('animation.layer.path',lset.length>1?{layer:layer!.id,op:'cornerPoints',indices:[...lset],smooth:lpt!.inX===undefined&&lpt!.outX===undefined}:{layer:layer!.id,op:'corner',index:lp!,smooth:lpt!.inX===undefined&&lpt!.outX===undefined})} data-testid="animation-pathpoint-smooth">{t(lpt&&(lpt.inX!==undefined||lpt.outX!==undefined)?'animation.pathLayer.cornerPoint':'animation.pathLayer.smoothPoint')}</Button>
   <Button size="tiny" variant="outline" disabled={!lpt||!!layer?.locked} onClick={()=>void executeCommand('animation.layer.path',lset.length>1?{layer:layer!.id,op:'removePoints',indices:[...lset]}:{layer:layer!.id,op:'remove',index:lp!})} data-testid="animation-pathpoint-delete">{t('animation.pathLayer.deletePoint')}</Button>
  </div>
  {hasPos&&<div className="absolute right-2 top-2 flex gap-1" role="group" aria-label={t('animation.path.label')}>
   <Button size="tiny" variant="outline" disabled={!posSel.length||!!layer?.locked} onClick={()=>void executeCommand('animation.keys.smooth')} data-testid="animation-path-smooth">{t('animation.path.smooth')}</Button>
   <Button size="tiny" variant="outline" disabled={!posSel.length||!!layer?.locked} onClick={()=>void executeCommand('animation.keys.straighten')} data-testid="animation-path-straight">{t('animation.path.straight')}</Button>
  </div>}
 </div>;
}
