import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {MAX_TEXT_ANIMATORS,TEXT_EASES,type Layer,type TextAnimator} from '../../lib/animation/model';
import {animationSession,useAnimationState} from '../../lib/animation/session';
import {animatorEdit,DEFAULT_ANIMATOR_COLOR} from '../../lib/animation/textAnimators';
import {evaluate} from '../../lib/animation/interpolate';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const fmt=(n:number)=>String(Math.round(n*100)/100);
const run=(params:unknown)=>void executeCommand('animation.text.animator',params);
/** Inspector section for per-character text animators: selector range, softness, offset (keyable), shift, scale and opacity. */
export function TextAnimators({layer,at}:{layer:Layer;at:number}){
 const {t}=useT();const list=layer.animators??[];const [secs,setSecs]=useState(1);useAnimationState();
 /** Hover or focus previews the sweep on the canvas without committing; leaving restores. */
 const peek=(a:TextAnimator,mode:'wave'|'reveal')=>{const s=animationSession();try{s.previewEdits([animatorEdit(s.document!,layer.id,{op:'stagger',animator:a.id,t:at,seconds:secs,mode})]);}catch{/* does not fit */}};
 const unpeek=()=>animationSession().cancelPreview();
 const num=(a:TextAnimator,label:string,value:number,min:number,max:number,patch:(v:number)=>Record<string,unknown>)=>
  <InspectorNumberField label={label} className={field} format={fmt} value={value} min={min} max={max} disabled={layer.locked} onCommit={v=>run({layer:layer.id,op:'update',animator:a.id,patch:patch(v)})}/>;
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-text-animators"><legend className="text-ink-3">{t('animation.animators.title')}</legend>
  {list.map((a,i)=><div key={a.id} className="grid gap-1 border-b border-subtle pb-2" data-testid={`animation-animator-${i}`}>
   <div className="flex items-center gap-1"><label className="flex flex-1 items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={a.enabled} onChange={e=>run({layer:layer.id,op:'update',animator:a.id,patch:{enabled:e.target.checked}})}/>{t('animation.animators.item',{n:i+1})}</label>
    <Button size="tiny" variant="ghost" aria-label={t('animation.animators.remove')} onClick={()=>run({layer:layer.id,op:'remove',animator:a.id})}>×</Button></div>
   <div className="grid grid-cols-2 gap-2">
    {num(a,t('animation.animators.start'),a.start,0,100,start=>({start,end:Math.max(start,a.end)}))}
    {num(a,t('animation.animators.end'),a.end,0,100,end=>({end,start:Math.min(end,a.start)}))}
    {num(a,t('animation.animators.softness'),a.softness,0,100,softness=>({softness}))}
    <InspectorNumberField label={t('animation.animators.offset')} className={field} format={fmt} value={evaluate(a.offset,at) as number} min={-100} max={100} onCommit={value=>run({layer:layer.id,op:'offset',animator:a.id,value,t:at})}/>
    {num(a,t('animation.animators.x'),a.position[0],-2000,2000,x=>({position:[x,a.position[1]]}))}
    {num(a,t('animation.animators.y'),a.position[1],-2000,2000,y=>({position:[a.position[0],y]}))}
    {num(a,t('animation.animators.scale'),a.scale,0,1000,scale=>({scale}))}
    {num(a,t('animation.animators.opacity'),a.opacity,0,100,opacity=>({opacity}))}
    {num(a,t('animation.animators.rotation'),a.rotation??0,-3600,3600,rotation=>({rotation}))}
    {num(a,t('animation.animators.tracking'),a.tracking??0,-200,200,tracking=>({tracking}))}
    <label className="grid gap-1 text-ink-3">{t('animation.animators.ease')}<NativeSelect className={field} value={a.ease??'linear'} onChange={e=>run({layer:layer.id,op:'update',animator:a.id,patch:{ease:e.target.value}})} data-testid="animation-animator-ease">{TEXT_EASES.map(k=><option key={k} value={k}>{t(`animation.animators.ease.${k}`)}</option>)}</NativeSelect></label>
    <div className="grid gap-1 text-ink-3"><label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={!!a.color} onChange={e=>run({layer:layer.id,op:'update',animator:a.id,patch:{color:e.target.checked?DEFAULT_ANIMATOR_COLOR:null}})}/>{t('animation.animators.color')}</label>
     {a.color&&<NativeInput type="color" aria-label={t('animation.animators.color')} className="h-8 w-16 rounded-sm border border-subtle bg-transparent" value={a.color} onChange={e=>run({layer:layer.id,op:'update',animator:a.id,patch:{color:e.target.value}})}/>}</div>
   </div>
   <div className="flex flex-wrap items-center gap-1 text-ink-3">
    <NativeSelect className="h-5 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2" aria-label={t('animation.animators.unit')} value={a.unit??'char'} onChange={e=>run({layer:layer.id,op:'update',animator:a.id,patch:{unit:e.target.value}})} data-testid="animation-animator-unit">
     {(['char','word'] as const).map(u=><option key={u} value={u}>{t(`animation.animators.unit.${u}`)}</option>)}</NativeSelect>
    <NativeInput type="number" min={0.1} max={30} step={0.1} className="h-5 w-12 rounded-sm border border-subtle bg-transparent px-1 text-xs text-ink-2" aria-label={t('animation.animators.staggerSeconds')} value={secs} onChange={e=>setSecs(Math.max(0.1,Math.min(30,Number(e.target.value)||1)))} data-testid="animation-animator-seconds"/>
    {(['wave','reveal'] as const).map(m=><Button key={m} size="tiny" variant="ghost" onClick={()=>run({layer:layer.id,op:'stagger',animator:a.id,t:at,seconds:secs,mode:m})} onPointerEnter={()=>peek(a,m)} onPointerLeave={unpeek} onFocus={()=>peek(a,m)} onBlur={unpeek} data-testid={`animation-animator-stagger-${m}`}>{t(`animation.animators.stagger.${m}`)}</Button>)}</div>
   <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={a.offset.keys.length>0} onChange={e=>run({layer:layer.id,op:'animate',animator:a.id,on:e.target.checked,t:at})}/>{t('animation.animators.animateOffset')}</label>
  </div>)}
  <Button size="tiny" variant="outline" disabled={list.length>=MAX_TEXT_ANIMATORS} onClick={()=>run({layer:layer.id,op:'add'})} data-testid="animation-animator-add">{t('animation.animators.add')}</Button>
 </fieldset>;
}
