import {useMemo,useRef} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {useT} from '../../../lib/useT';
import {usePanelState} from '../../../store/panelStateStore';
import {computeHistogram,histogramPath} from '../../../lib/photos/histogram';
import {CURVE_CHANNELS,MAX_CURVE_POINTS,curveLut,sanitizeCurvePoints,type CurveChannel,type CurvePoint} from '../../../lib/photos/curves';
import {beginPhotoGesture,endPhotoGesture,previewPhotoSettings,commitPhotoSettings,type PhotoSession} from '../../../lib/photos/studioSession';
import {Button} from '../../ui/button';
import {Crosshair} from '../../../lib/icons';
import {PanelBody,SectionHead} from './shared';

/** Channel buttons reuse the histogram labels: the master curve is what the histogram calls RGB. */
const CH_LABEL:Record<CurveChannel,string>={master:'rgb',red:'r',green:'g',blue:'b'};
const CH_HIST:Record<CurveChannel,'luma'|'r'|'g'|'b'>={master:'luma',red:'r',green:'g',blue:'b'};
const DELETE_BELOW=-0.15; // y value under the box that marks a dragged point for deletion
const X_GAP=0.01;         // minimal horizontal distance between points

function CurveBox({name,session,channel}:{name:string;session:PhotoSession;channel:CurveChannel}){
 const {t}=useT();
 const ref=useRef<SVGSVGElement|null>(null);
 /** The point being dragged: its current x identifies it inside the sanitized (sorted, deduped) array. */
 const drag=useRef<{x:number;y:number;held:boolean}|null>(null);
 const points=useMemo(()=>sanitizeCurvePoints(session.now.curves?.[channel]??[]),[session.now.curves,channel]);
 const hist=useMemo(()=>session.frame?computeHistogram(session.frame.bytes):null,[session.frame]);
 const lut=useMemo(()=>curveLut(points),[points]);
 const path=useMemo(()=>{let d='';for(let v=0;v<256;v++)d+=`${v?'L':'M'}${v},${255-lut[v]}`;return d;},[lut]);
 const setPoints=(next:CurvePoint[])=>previewPhotoSettings(name,s=>({...s,curves:{...s.curves,[channel]:sanitizeCurvePoints(next)}}));
 const toValue=(e:ReactPointerEvent)=>{const r=ref.current!.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:1-(e.clientY-r.top)/r.height};};
 const down=(e:ReactPointerEvent)=>{
  if(e.button!==0||!ref.current)return;
  const p=toValue(e);
  let pts=points.slice();let x=Math.min(1-X_GAP,Math.max(X_GAP,p.x)),y=Math.min(1,Math.max(0,p.y));
  let best=X_GAP*4,hit=-1;
  pts.forEach((q,i)=>{const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best){best=d;hit=i;}});
  beginPhotoGesture(name);
  if(hit>=0){x=pts[hit].x;y=pts[hit].y;}
  else{
   if(pts.length>=MAX_CURVE_POINTS){endPhotoGesture(name);return;}
   pts=sanitizeCurvePoints([...pts,{x,y}]);setPoints(pts);
  }
  drag.current={x,y,held:false};
  ref.current.setPointerCapture(e.pointerId);
 };
 const move=(e:ReactPointerEvent)=>{
  const d=drag.current;if(!d)return;
  const p=toValue(e);
  const pts=points;
  const i=pts.findIndex(q=>Math.abs(q.x-d.x)<5e-4);
  if(p.y<DELETE_BELOW){ // held outside the box: preview without the point, deleted on release
   if(i>=0){d.held=true;d.y=pts[i].y;setPoints(pts.filter((_,j)=>j!==i));}
   return;
  }
  if(i<0){ // coming back into the box re-inserts the held point
   const y=Math.min(1,Math.max(0,p.y));
   const next=sanitizeCurvePoints([...pts,{x:Math.min(1-X_GAP,Math.max(X_GAP,p.x)),y}]);
   d.held=false;d.y=y;
   const ni=next.findIndex(q=>Math.abs(q.x-d.x)<5e-4||Math.abs(q.x-Math.min(1-X_GAP,Math.max(X_GAP,p.x)))<5e-4);
   d.x=next[ni]?.x??d.x;
   setPoints(next);
   return;
  }
  const lo=i>0?pts[i-1].x+X_GAP:X_GAP,hi=i<pts.length-1?pts[i+1].x-X_GAP:1-X_GAP;
  const nx=Math.min(hi,Math.max(lo,p.x)),ny=Math.min(1,Math.max(0,p.y));
  const next=pts.slice();next[i]={x:nx,y:ny};
  d.x=nx;d.y=ny;d.held=false;
  setPoints(next);
 };
 const up=(e:ReactPointerEvent)=>{
  if(!drag.current)return;
  drag.current=null;
  try{ref.current?.releasePointerCapture(e.pointerId);}catch{/* already released */}
  endPhotoGesture(name); // one history entry for the whole drag, deletion included
 };
 return <svg ref={ref} viewBox="0 0 255 255" preserveAspectRatio="none" role="img"
  aria-label={t('photos.p.curves.aria',{count:points.length})}
  className="aspect-square w-full cursor-crosshair touch-none rounded-sm border border-subtle bg-elevated text-ink-3" data-testid="photos-curves-svg"
  onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
  {hist&&<path d={histogramPath(hist[CH_HIST[channel]],255,255)} fill="currentColor" fillOpacity={0.12}/>}
  {[0.25,0.5,0.75].map(f=><g key={f} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1}>
   <line x1={f*255} y1={0} x2={f*255} y2={255}/><line x1={0} y1={f*255} x2={255} y2={f*255}/>
  </g>)}
  <line x1={0} y1={255} x2={255} y2={0} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4"/>
  <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke"/>
  <circle cx={0} cy={255} r={4} fill="currentColor" opacity={0.5}/>
  <circle cx={255} cy={0} r={4} fill="currentColor" opacity={0.5}/>
  {points.map((p,i)=><circle key={i} cx={p.x*255} cy={(1-p.y)*255} r={5} fill="var(--elevated)" stroke="var(--accent)" strokeWidth={2} data-testid={`photos-curves-pt-${i}`}/>)}
 </svg>;
}

/** Tone curves: master (RGB) plus per-channel point curves with the live histogram as the backdrop.
 * Click adds a point, dragging shapes the curve (one undo per drag), pulling a point below the box deletes it. */
export function CurvesPanel(){
 const {t}=useT();
 const [channel,setChannel]=usePanelState<CurveChannel>('photos.curves','master');
 const [target,setTarget]=usePanelState<boolean>('photos.curves.target',false);
 const [,setHslTarget]=usePanelState<boolean>('photos.hsl.target',false);
 return <PanelBody testId="photos-curves-panel">{({name,session})=><>
  <SectionHead>
   <Button size="tiny" variant="outline" aria-pressed={target} title={t('photos.p.target.curves')} aria-label={t('photos.p.target.curves')} onClick={()=>{const v=!target;setTarget(v);if(v)setHslTarget(false);}} data-testid="photos-curves-target"><Crosshair size={12}/></Button>
   {CURVE_CHANNELS.map(c=><Button key={c} size="tiny" variant="outline" aria-pressed={channel===c} onClick={()=>setChannel(c)} data-testid={`photos-curves-ch-${c}`}>{t(`photos.p.hist.ch.${CH_LABEL[c]}`)}</Button>)}
   <Button size="tiny" variant="outline" onClick={()=>commitPhotoSettings(name,s=>({...s,curves:{...s.curves,[channel]:[]}}))} data-testid="photos-curves-reset">{t('photos.p.curves.reset')}</Button>
  </SectionHead>
  <CurveBox name={name} session={session} channel={CURVE_CHANNELS.includes(channel)?channel:'master'}/>
  <p className="m-0 text-ink-3">{t('photos.p.curves.hint')}</p>
 </>}</PanelBody>;
}
