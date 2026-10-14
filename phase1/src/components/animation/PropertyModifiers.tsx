import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {LINK_PROPS,type Modifier} from '../../lib/animation/modifiers';
import {TRANSFORM_KEYS,type Composition,type Layer,type TransformKey} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
import {PROP_LABEL} from './format';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const fmt=(n:number)=>String(Math.round(n*1000)/1000);
/** Wiggle (seeded noise), loop and link modifiers of one transform property. Wiggle and loop were commands only; link binds the property to another layer's property (value = source x multiplier + offset). Every change is one undo step. */
export function PropertyModifiers({layer,comp}:{layer:Layer;comp:Composition}){
 const {t}=useT();const [prop,setProp]=useState<TransformKey>('position');const [err,setErr]=useState<string|null>(null);
 const list=layer.transform[prop].modifiers??[];const others=comp.layers.filter(o=>o.id!==layer.id);
 const run=async(id:string,p:Record<string,unknown>)=>{setErr(null);try{await executeCommand(id,{layer:layer.id,prop,...p});}catch(e){setErr((e as Error).message);}};
 const set=(i:number,m:Modifier)=>run('animation.modifier.set',{index:i,modifier:m});
 const num=(label:string,value:number,min:number,max:number,step:number,on:(v:number)=>void)=><InspectorNumberField label={label} className={field} format={fmt} value={value} min={min} max={max} step={step} disabled={layer.locked} onCommit={on}/>;
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-modifiers"><legend className="text-ink-3">{t('animation.modifiers.title')}</legend>
  <NativeSelect className={field} value={prop} aria-label={t('animation.modifiers.property')} onChange={e=>{setProp(e.target.value as TransformKey);setErr(null);}} data-testid="animation-modifiers-prop">{TRANSFORM_KEYS.map(k=><option key={k} value={k}>{t(PROP_LABEL[k])}</option>)}</NativeSelect>
  {list.map((m,i)=><div key={i} className="grid gap-1 border-b border-subtle pb-2" data-testid={`animation-modifier-${i}`}>
   <div className="flex items-center justify-between text-ink-3"><span>{t(`animation.modifiers.${m.type}`)}</span><Button size="tiny" variant="ghost" aria-label={t('animation.modifiers.remove')} onClick={()=>void run('animation.modifier.remove',{index:i})}>×</Button></div>
   {m.type==='wiggle'&&<div className="grid grid-cols-3 gap-2">
    {num(t('animation.modifiers.amplitude'),m.amplitude,0,10000,1,v=>void set(i,{...m,amplitude:v}))}
    {num(t('animation.modifiers.frequency'),m.frequency,0.01,100,0.1,v=>void set(i,{...m,frequency:v}))}
    {num(t('animation.modifiers.seed'),m.seed,0,2147483647,1,v=>void set(i,{...m,seed:Math.round(v)}))}</div>}
   {m.type==='loop'&&<NativeSelect className={field} value={m.mode} aria-label={t('animation.modifiers.loopMode')} onChange={e=>void set(i,{...m,mode:e.target.value as 'cycle'|'pingpong'|'offset'})}>{(['cycle','pingpong','offset'] as const).map(k=><option key={k} value={k}>{t(`animation.modifiers.loop.${k}`)}</option>)}</NativeSelect>}
   {m.type==='link'&&<div className="grid gap-1">
    <div className="flex gap-1"><NativeSelect className={field} value={m.layer} aria-label={t('animation.modifiers.linkLayer')} onChange={e=>void set(i,{...m,layer:e.target.value})}>{!others.some(o=>o.id===m.layer)&&<option value={m.layer}>{t('animation.modifiers.missing')}</option>}{others.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect>
     <NativeSelect className={field} value={m.prop} aria-label={t('animation.modifiers.linkProp')} onChange={e=>void set(i,{...m,prop:e.target.value as typeof m.prop})}>{LINK_PROPS.map(k=><option key={k} value={k}>{t(PROP_LABEL[k])}</option>)}</NativeSelect></div>
    <div className="grid grid-cols-2 gap-2">{num(t('animation.modifiers.multiplier'),m.multiplier,-1000,1000,0.1,v=>void set(i,{...m,multiplier:v}))}{num(t('animation.modifiers.offset'),m.offset,-100000,100000,1,v=>void set(i,{...m,offset:v}))}</div></div>}
  </div>)}
  <div className="flex flex-wrap gap-1">
   <Button size="tiny" variant="outline" data-testid="animation-modifier-add-wiggle" onClick={()=>void run('animation.modifier.add',{modifier:{type:'wiggle',seed:1,amplitude:10,frequency:2}})}>{t('animation.modifiers.addWiggle')}</Button>
   <Button size="tiny" variant="outline" data-testid="animation-modifier-add-loop" onClick={()=>void run('animation.modifier.add',{modifier:{type:'loop',mode:'cycle'}})}>{t('animation.modifiers.addLoop')}</Button>
   <Button size="tiny" variant="outline" disabled={!others.length||list.some(m=>m.type==='link')} data-testid="animation-modifier-add-link" onClick={()=>void run('animation.modifier.link',{from:others[0].id})}>{t('animation.modifiers.addLink')}</Button></div>
  {err&&<div role="alert" className="text-danger" data-testid="animation-modifiers-error">{err}</div>}
 </fieldset>;
}
