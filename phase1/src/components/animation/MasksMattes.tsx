import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {MAX_LAYER_MASKS,type Composition,type Layer,type LayerMask} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const fmt=(n:number)=>String(Math.round(n*100)/100);
const mask=(params:unknown)=>void executeCommand('animation.layer.mask',params);
const matte=(params:unknown)=>void executeCommand('animation.layer.matte',params);
/** Inspector sections for layer masks (up to 4 shapes) and the track matte (alpha or luma, optionally inverted). */
export function MasksMattes({layer,comp}:{layer:Layer;comp:Composition}){
 const {t}=useT();const masks=layer.masks??[];
 const num=(m:LayerMask,label:string,key:'x'|'y'|'width'|'height'|'feather',min:number,max:number)=>
  <InspectorNumberField label={label} className={field} format={fmt} value={m[key]} min={min} max={max} onCommit={v=>mask({layer:layer.id,op:'update',mask:m.id,patch:{[key]:v}})}/>;
 const sources=comp.layers.filter(o=>o.id!==layer.id&&o.kind!=='audio'&&o.kind!=='null'&&!o.matte&&!comp.layers.some(x=>x.matte?.source===layer.id));
 return <>
  <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-masks"><legend className="text-ink-3">{t('animation.masks.title')}</legend>
   {masks.map((m,i)=><div key={m.id} className="grid gap-1 border-b border-subtle pb-2" data-testid={`animation-mask-${i}`}>
    <div className="flex items-center gap-1"><span className="flex-1 text-ink-3">{t('animation.masks.item',{n:i+1})}</span>
     <Button size="tiny" variant="ghost" aria-label={t('animation.masks.remove')} onClick={()=>mask({layer:layer.id,op:'remove',mask:m.id})}>×</Button></div>
    <div className="grid grid-cols-2 gap-2">
     <label className="grid gap-1 text-ink-3">{t('animation.masks.shape')}<NativeSelect className={field} value={m.shape} onChange={e=>mask({layer:layer.id,op:'update',mask:m.id,patch:{shape:e.target.value}})}><option value="rect">{t('animation.masks.rect')}</option><option value="ellipse">{t('animation.masks.ellipse')}</option></NativeSelect></label>
     <label className="grid gap-1 text-ink-3">{t('animation.masks.mode')}<NativeSelect className={field} value={m.mode} onChange={e=>mask({layer:layer.id,op:'update',mask:m.id,patch:{mode:e.target.value}})}><option value="add">{t('animation.masks.add')}</option><option value="subtract">{t('animation.masks.subtract')}</option></NativeSelect></label>
     {num(m,t('animation.masks.x'),'x',-16384,16384)}
     {num(m,t('animation.masks.y'),'y',-16384,16384)}
     {num(m,t('animation.masks.width'),'width',1,16384)}
     {num(m,t('animation.masks.height'),'height',1,16384)}
     {num(m,t('animation.masks.feather'),'feather',0,64)}
    </div>
    <label className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={m.invert} onChange={e=>mask({layer:layer.id,op:'update',mask:m.id,patch:{invert:e.target.checked}})}/>{t('animation.masks.invert')}</label>
   </div>)}
   <Button size="tiny" variant="outline" disabled={masks.length>=MAX_LAYER_MASKS} onClick={()=>mask({layer:layer.id,op:'add'})} data-testid="animation-mask-add">{t('animation.masks.addMask')}</Button>
  </fieldset>
  <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-matte"><legend className="text-ink-3">{t('animation.matte.title')}</legend>
   <label className="grid gap-1 text-ink-3">{t('animation.matte.source')}<NativeSelect className={field} data-testid="animation-matte-source" value={layer.matte?.source??''} onChange={e=>matte({layer:layer.id,source:e.target.value||null,mode:layer.matte?.mode??'alpha',invert:layer.matte?.invert??false})}><option value="">{t('animation.matte.none')}</option>{sources.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</NativeSelect></label>
   {layer.matte&&<div className="grid grid-cols-2 gap-2">
    <label className="grid gap-1 text-ink-3">{t('animation.matte.mode')}<NativeSelect className={field} data-testid="animation-matte-mode" value={layer.matte.mode} onChange={e=>matte({layer:layer.id,source:layer.matte!.source,mode:e.target.value,invert:layer.matte!.invert})}><option value="alpha">{t('animation.matte.alpha')}</option><option value="luma">{t('animation.matte.luma')}</option></NativeSelect></label>
    <label className="flex items-center gap-1 self-end text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={layer.matte.invert} onChange={e=>matte({layer:layer.id,source:layer.matte!.source,mode:layer.matte!.mode,invert:e.target.checked})}/>{t('animation.matte.invert')}</label>
   </div>}
  </fieldset>
 </>;
}
