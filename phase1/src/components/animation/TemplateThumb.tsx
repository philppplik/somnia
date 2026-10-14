import {useMemo} from 'react';
import {Button} from '../ui/button';
import {frameSvg} from '../../lib/animation/exportFrames';
import type {Composition,LayerTemplate} from '../../lib/animation/model';
const W=80;
/** Small picture of a saved layer template at the end of its motion; click to select it in the picker. */
export function TemplateThumb({item,comp,selected,onPick}:{item:LayerTemplate;comp:Composition;selected:boolean;onPick:()=>void}){
 const src=useMemo(()=>{
  const l=item.layer,last=Math.max(l.inT,maxKeyTime(l)),tick=Math.min(Math.max(last,l.inT),Math.max(l.inT,l.outT-1));
  const svg=frameSvg({...comp,markers:[],layers:[{...l,visible:true}]},tick);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
 },[item,comp]);
 const h=Math.round(W*comp.height/comp.width);
 return <Button type="button" size="tiny" variant="outline" className={`h-auto w-full min-w-0 flex-col items-stretch gap-0 overflow-hidden p-0 ${selected?'border-accent':''}`} aria-pressed={selected} title={item.name} onClick={onPick} data-testid="animation-template-thumb"><img src={src} width={W} height={h} alt={item.name} className="block h-auto w-full min-w-0 max-w-full"/><span className="block truncate px-1 text-xs text-ink-3">{item.name}</span></Button>;
}
function maxKeyTime(v:unknown):number{let m=-Infinity;const walk=(x:unknown)=>{if(Array.isArray(x))for(const el of x){if(el&&typeof el==='object'&&Number.isInteger((el as {t?:number}).t))m=Math.max(m,(el as {t:number}).t);walk(el);}else if(x&&typeof x==='object')for(const y of Object.values(x))walk(y);};walk(v);return m;}
