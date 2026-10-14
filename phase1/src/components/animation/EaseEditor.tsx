import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {userEasings} from '../../lib/animation/easingLibrary';
import {EASE_Y_HIGH,EASE_Y_LOW} from '../../lib/animation/easingModel';
import type {KeyRef,Layer} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const fmt=(n:number)=>String(Math.round(n*100)/100);
type H=readonly [number,number];
/** Cubic-bezier editor for the primary selected key: numeric handles with a curve, plus named easings saved in the document. */
export function EaseEditor({layer,sel}:{layer:Layer;sel:readonly KeyRef[]}){
 const {t}=useT();useAnimationState();const doc=animationSession().document;const saved=userEasings(doc);const [name,setName]=useState('');const [err,setErr]=useState('');
 const ref=[...sel].reverse().find(k=>k.layer===layer.id);const key=ref&&layer.transform[ref.prop].keys.find(k=>k.t===ref.t);
 const bez=!!key&&key.interp==='bezier';const out:H=key?.out??[0.33,0],inn:H=key?.in??[0.67,1];
 const call=async(id:string,params?:unknown)=>{setErr('');animationSession().cancelPreview();try{await executeCommand(id,params);return true;}catch(e){setErr((e as Error).message);return false;}};
 const peek=(o:H,i:H)=>{try{animationSession().previewEdits([{type:'keys.interp',keys:[...sel],interp:'bezier',out:o,in:i}]);}catch{/* stale */}};
 const unpeek=()=>animationSession().cancelPreview();
 const ys=[0,1,out[1],inn[1]];const top=Math.max(...ys),bot=Math.min(...ys);const pad=0.1;
 const num=(label:string,v:number,min:number,max:number,commit:(v:number)=>{out:H;in:H})=><InspectorNumberField label={label} className={field} format={fmt} value={v} min={min} max={max} step={0.05} disabled={layer.locked||!bez} onCommit={n=>void call('animation.keys.cubic',commit(n))}/>;
 const set=(o:H,i:H)=>({out:o,in:i});
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-ease-editor"><legend className="text-ink-3">{t('animation.easeEditor.title')}</legend>
  <svg viewBox={`${-pad} ${1-top-pad} ${1+2*pad} ${top-bot+2*pad}`} className="h-24 w-full border border-subtle" role="img" aria-label={t('animation.easeEditor.curve')} data-testid="animation-ease-curve">
   <line x1="0" y1="1" x2="1" y2="0" className="stroke-current text-ink-3" strokeWidth="0.01" strokeDasharray="0.03"/>
   <line x1="0" y1="1" x2={out[0]} y2={1-out[1]} className="stroke-current text-ink-3" strokeWidth="0.01"/><line x1="1" y1="0" x2={inn[0]} y2={1-inn[1]} className="stroke-current text-ink-3" strokeWidth="0.01"/>
   <path d={`M 0 1 C ${out[0]} ${1-out[1]} ${inn[0]} ${1-inn[1]} 1 0`} className="fill-none stroke-current text-ink" strokeWidth="0.025"/>
   <circle cx={out[0]} cy={1-out[1]} r="0.035" className="fill-current text-ink"/><circle cx={inn[0]} cy={1-inn[1]} r="0.035" className="fill-current text-ink"/>
  </svg>
  <div className="grid grid-cols-2 gap-1" role="group" aria-label={t('animation.easeEditor.handles')}>
   {num(t('animation.easeEditor.x1'),out[0],0,1,n=>set([n,out[1]],inn))}{num(t('animation.easeEditor.y1'),out[1],EASE_Y_LOW,EASE_Y_HIGH,n=>set([out[0],n],inn))}
   {num(t('animation.easeEditor.x2'),inn[0],0,1,n=>set(out,[n,inn[1]]))}{num(t('animation.easeEditor.y2'),inn[1],EASE_Y_LOW,EASE_Y_HIGH,n=>set(out,[inn[0],n]))}</div>
  {!bez&&<p className="text-ink-3">{t('animation.easeEditor.needBezier')}</p>}
  {saved.length>0&&<div className="flex flex-wrap gap-1">{saved.map(e=><span key={e.id} className="flex items-center">
   <Button size="tiny" variant="outline" disabled={!sel.length} onClick={()=>void call('animation.ease.apply',{ease:e.id})} onPointerEnter={()=>peek(e.out,e.in)} onPointerLeave={unpeek} onFocus={()=>peek(e.out,e.in)} onBlur={unpeek} data-testid={`animation-ease-saved-${e.name}`}>{e.name}</Button>
   <Button size="tiny" variant="ghost" aria-label={t('animation.easeEditor.delete')} onClick={()=>void call('animation.ease.delete',{ease:e.id})}>×</Button></span>)}</div>}
  <div className="flex gap-1"><NativeInput className={field} value={name} maxLength={40} placeholder={t('animation.easeEditor.name')} aria-label={t('animation.easeEditor.name')} onChange={e=>setName(e.target.value)} data-testid="animation-ease-name"/>
   <Button size="tiny" variant="outline" disabled={!bez||!name.trim()} onClick={async()=>{if(await call('animation.ease.save',{name,out,in:inn}))setName('');}} data-testid="animation-ease-save">{t('animation.easeEditor.save')}</Button></div>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
