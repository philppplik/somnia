import {useState} from 'react';
import {useT} from '../../lib/useT';
import {NativeInput} from '../ui/native-controls';
import {executeCommand} from '../../lib/commands';
import {paletteOf} from '../../lib/animation/palette';
import type {Composition} from '../../lib/animation/model';
/** Left-panel section: the colours the composition uses. Pick a new colour in a swatch to replace it everywhere (one undo step, on leaving the picker). */
export function PalettePanel({comp}:{comp:Composition}){
 const {t}=useT();const pal=paletteOf(comp.layers);const [draft,setDraft]=useState<Record<string,string>>({});const [err,setErr]=useState('');
 if(!pal.length)return null;
 const commit=async(from:string)=>{const to=draft[from];setDraft(({[from]:_x,...rest})=>rest);if(!to||to.toLowerCase()===from)return;setErr('');try{await executeCommand('animation.palette.replace',{from,to});}catch(e){setErr((e as Error).message);}};
 return <fieldset className="m-0 grid min-w-0 gap-2 border border-subtle p-2" data-testid="animation-palette"><legend className="text-ink-3">{t('animation.palette.title')}</legend>
  <div className="flex flex-wrap items-center gap-2">{pal.map(p=><label key={p.color} className="flex items-center gap-1 text-ink-3" title={t('animation.palette.uses',{n:p.layers})}>
   <NativeInput type="color" className="h-8 w-10 rounded-sm border border-subtle bg-transparent" value={draft[p.color]??p.color} aria-label={`${p.color} (${t('animation.palette.uses',{n:p.layers})})`} onChange={e=>setDraft({...draft,[p.color]:e.target.value})} onBlur={()=>void commit(p.color)} data-testid={`animation-palette-${p.color.slice(1)}`}/>{p.layers}</label>)}</div>
  <div className="text-ink-3">{t('animation.palette.hint')}</div>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
