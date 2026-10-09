import type {SoundParam} from '../../lib/sound/protocol';
import {formatParam,fromNorm,isDefault,toNorm} from '../../lib/sound/params';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
const field='h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
/** One control per plugin parameter. Values equal to the default stay out of the recipe. */
export function PluginParams({params,values,onChange,onReset}:{params:readonly SoundParam[];values:Record<string,number>;onChange:(id:string,value:number|null)=>void;onReset:()=>void}){
 const {t}=useT();
 if(!params.length)return null;
 const changed=params.some(p=>!isDefault(p,values[p.id]));
 return <div className="grid gap-2" data-testid="sound-params" role="group" aria-label={t('sound.params')}>
  {params.map(p=>{
   const v=values[p.id]??p.default,id=`sound-param-${p.id}`;
   const set=(x:number)=>onChange(p.id,Math.abs(x-p.default)<1e-6?null:x);
   return <div key={p.id} className="grid gap-1">
    <div className="flex items-center justify-between gap-2"><label htmlFor={id} className="text-ink">{p.name}</label><span className="text-ink-3" data-testid={`${id}-value`}>{formatParam(p,v)}</span></div>
    {p.unit==='Choice'?<select id={id} className={field} value={Math.round(v)} onChange={e=>set(Number(e.target.value))}>{p.choices.map((c,i)=><option key={c} value={i}>{c}</option>)}</select>
    :p.unit==='Toggle'?<input id={id} type="checkbox" className="!size-4 !w-4 justify-self-start accent-[var(--accent)]" checked={v>=0.5} onChange={e=>set(e.target.checked?1:0)}/>
    :<input id={id} type="range" className="w-full accent-[var(--accent)]" min={0} max={1} step={0.005} value={toNorm(p,v)} aria-valuetext={formatParam(p,v)} onChange={e=>set(fromNorm(p,Number(e.target.value)))} data-testid={id}/>}
   </div>;
  })}
  <Button size="compact" className="justify-self-start" disabled={!changed} onClick={onReset} data-testid="sound-params-reset">{t('sound.params.reset')}</Button>
 </div>;
}
