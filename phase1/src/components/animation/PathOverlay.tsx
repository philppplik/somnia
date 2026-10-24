import {useRef,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent} from 'react';
import {animationSession} from '../../lib/animation/session';
import {samplePath} from '../../lib/animation/interpolate';
import type {Composition,KeyRef,Layer,Vec2} from '../../lib/animation/model';
import {parentMatrix} from '../../lib/animation/scene';
import {clickSelect,sameKey} from '../../lib/animation/selection';
import {timecode} from '../../lib/animation/time';
import {useT} from '../../lib/useT';
const r1=(n:number)=>Math.round(n*10)/10;
/**
 * Spatial path of the selected layer's position keys, drawn in the layer's parent space. Key squares move the key value,
 * tangent handles of selected keys bend the segment. Handles of a key without tangents sit at a third of the way to its
 * neighbour as a hint; dragging one stores a real tangent.
 */
export function PathOverlay({comp,layer,at,sel}:{comp:Composition;layer:Layer;at:number;sel:readonly KeyRef[]}){
 const {t}=useT();const gRef=useRef<SVGGElement>(null);const sess=animationSession();
 const p=layer.transform.position;const keys=p.keys;
 if(!keys.length)return null;
 const m=parentMatrix(comp,layer,at);const locked=layer.locked;
 const path=samplePath(p,24);const d=path.map((q,i)=>`${i?'L':'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
 const scale=()=>{const c=gRef.current?.getScreenCTM();return c?1/Math.max(1e-6,Math.sqrt(Math.abs(c.a*c.d-c.b*c.c))):1;};
 const toLocal=(cx:number,cy:number):Vec2=>{const c=gRef.current!.getScreenCTM()!.inverse();const pt=new DOMPoint(cx,cy).matrixTransform(c);return [pt.x,pt.y];};
 const drag=(e:PointerEvent<SVGElement>,move:(v:Vec2)=>void,end:(commit:boolean,moved:boolean)=>void)=>{
  if(e.button!==0)return;e.stopPropagation();const el=e.currentTarget;el.setPointerCapture(e.pointerId);const x0=e.clientX,y0=e.clientY;let moved=false;
  const mv=(ev:globalThis.PointerEvent)=>{if(!moved&&Math.hypot(ev.clientX-x0,ev.clientY-y0)<3)return;moved=true;move(toLocal(ev.clientX,ev.clientY));};
  const done=(c:boolean)=>{el.removeEventListener('pointermove',mv);el.removeEventListener('pointerup',up);window.removeEventListener('keydown',esc,true);end(c,moved);};
  const up=()=>done(true);const esc=(ev:KeyboardEvent)=>{if(ev.key==='Escape'){ev.stopPropagation();done(false);}};
  el.addEventListener('pointermove',mv);el.addEventListener('pointerup',up);window.addEventListener('keydown',esc,true);
 };
 const keyDown=(ref:KeyRef,v:Vec2)=>(e:PointerEvent<SVGElement>)=>{
  const additive=e.shiftKey||e.ctrlKey||e.metaKey;const was=sel.some(k=>sameKey(k,ref));
  if(!was)sess.selectKeys(clickSelect(sel,ref,additive));
  drag(e,q=>{try{sess.previewEdits([{type:'prop.set',layer:layer.id,prop:'position',t:ref.t,value:[r1(q[0]),r1(q[1])]}]);}catch{/* out of range */}},
   (commit,moved)=>{if(moved&&commit){sess.commitPreview();sess.setView({playhead:ref.t});return;}sess.cancelPreview();
    if(commit){if(was&&!additive)sess.selectKeys([ref]);else if(was)sess.selectKeys(sel.filter(k=>!sameKey(k,ref)));if(!additive)sess.setView({playhead:ref.t});}});
  void v;
 };
 const handleDown=(ref:KeyRef,key:Vec2,kind:'sIn'|'sOut')=>(e:PointerEvent<SVGElement>)=>drag(e,q=>{
  try{sess.previewEdits([{type:'key.spatial',layer:layer.id,prop:'position',t:ref.t,[kind]:[r1(q[0]-key[0]),r1(q[1]-key[1])]}]);}catch{/* locked */}
 },(commit,moved)=>{if(moved&&commit)sess.commitPreview();else sess.cancelPreview();});
 const nudge=(apply:(dx:number,dy:number)=>void)=>(e:ReactKeyboardEvent<SVGElement>)=>{
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!dx&&!dy)return;
  e.preventDefault();e.stopPropagation();const s=e.shiftKey?10:1;try{apply(dx*s,dy*s);}catch{/* locked */}
 };
 const k=scale();const sq=4*k;
 const selected=keys.map((key,i)=>({key,i,ref:{layer:layer.id,prop:'position' as const,t:key.t}})).filter(x=>sel.some(s=>sameKey(s,x.ref)));
 return <g ref={gRef} transform={`matrix(${m.join(' ')})`} data-testid="animation-path" aria-label={t('animation.path.label')} role="group">
  <path d={d} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={4*k} strokeLinejoin="round" pointerEvents="none"/>
  <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2*k} strokeLinejoin="round" strokeDasharray={`${6*k} ${4*k}`} pointerEvents="none" data-testid="animation-path-line"/>
  {selected.flatMap(({key,i,ref})=>{
   const prev=keys[i-1]?.v as Vec2|undefined,next=keys[i+1]?.v as Vec2|undefined,v=key.v as Vec2;
   const ghost=(to:Vec2|undefined):Vec2=>to?[(to[0]-v[0])/3,(to[1]-v[1])/3]:[0,0];
   const out=key.sOut&&(key.sOut[0]||key.sOut[1])?key.sOut:ghost(next),inn=key.sIn&&(key.sIn[0]||key.sIn[1])?key.sIn:ghost(prev);
   return ([['sOut',out,!!next],['sIn',inn,!!prev]] as const).filter(x=>x[2]).map(([kind,off])=>{
    const hx=v[0]+off[0],hy=v[1]+off[1];
    return <g key={`${kind}-${key.t}`}>
     <line x1={v[0]} y1={v[1]} x2={hx} y2={hy} stroke="var(--text-secondary)" strokeWidth={1*k} pointerEvents="none"/>
     <circle cx={hx} cy={hy} r={4.5*k} fill="var(--bg-elevated)" stroke="var(--accent)" strokeWidth={2*k} tabIndex={locked?-1:0} role="slider" aria-valuenow={Math.round(off[0])} aria-valuetext={`${Math.round(off[0])}, ${Math.round(off[1])}`}
      aria-label={t(kind==='sOut'?'animation.path.tangentOut':'animation.path.tangentIn',{time:timecode(key.t,comp.fps)})} style={{cursor:locked?'default':'grab',touchAction:'none'}}
      onPointerDown={locked?undefined:handleDown(ref,v,kind)} onKeyDown={locked?undefined:nudge((dx,dy)=>sess.dispatch({type:'key.spatial',layer:layer.id,prop:'position',t:key.t,[kind]:[off[0]+dx,off[1]+dy]}))} data-testid={`animation-path-${kind}`}/></g>;});
  })}
  {keys.map((key,ki)=>{const ref:KeyRef={layer:layer.id,prop:'position',t:key.t};const on=sel.some(s=>sameKey(s,ref));const v=key.v as Vec2;
   return <rect key={ki} x={v[0]-sq} y={v[1]-sq} width={sq*2} height={sq*2} fill={on?'var(--text-primary)':'var(--accent-fill)'} stroke={on?'var(--focus-ring)':'var(--action-ink)'} strokeWidth={(on?2:1.5)*k}
    tabIndex={locked?-1:0} role="button" aria-pressed={on} aria-label={t('animation.path.key',{time:timecode(key.t,comp.fps)})} style={{cursor:locked?'default':'grab',touchAction:'none'}}
    onPointerDown={locked?undefined:keyDown(ref,v)} onKeyDown={locked?undefined:nudge((dx,dy)=>sess.dispatch({type:'prop.set',layer:layer.id,prop:'position',t:key.t,value:[v[0]+dx,v[1]+dy]}))} data-testid="animation-path-key" data-selected={on||undefined}/>;})}
 </g>;
}
