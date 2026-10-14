import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {MAX_LAYER_MASKS,type Composition,type Layer,type LayerMask} from '../../lib/animation/model';
import {resolveMask} from '../../lib/animation/masks';
import {MAX_MASK_POINTS,type MaskProp} from '../../lib/animation/model';
import {executeCommand} from '../../lib/commands';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const fmt=(n:number)=>String(Math.round(n*100)/100);
const mask=(params:unknown)=>void executeCommand('animation.layer.mask',params);
const matte=(params:unknown)=>void executeCommand('animation.layer.matte',params);
/** Inspector sections for layer masks (up to 4 shapes) and the track matte (alpha or luma, optionally inverted). */
export function MasksMattes({layer,comp,at}:{layer:Layer;comp:Composition;at:number}){
 const {t}=useT();const masks=layer.masks??[];
 const val=(m:LayerMask,key:'x'|'y'|'width'|'height'|'feather'|'opacity')=>{const r=resolveMask(m,at);return key==='opacity'?r.opacity??100:r[key];};
 const field2=(m:LayerMask,label:string,key:'x'|'y'|'width'|'height'|'feather'|'opacity',min:number,max:number)=>{
  const set=(v:number)=>{const r=resolveMask(m,at);const prop:MaskProp=key==='x'||key==='y'?'position':key==='width'||key==='height'?'size':key;
   const value=prop==='position'?[key==='x'?v:r.x,key==='y'?v:r.y]:prop==='size'?[key==='width'?v:r.width,key==='height'?v:r.height]:v;mask({layer:layer.id,op:'set',mask:m.id,prop,value});};
  return <InspectorNumberField label={label} className={field} format={fmt} value={val(m,key)} min={min} max={max} onCommit={set}/>;};
 const animToggle=(m:LayerMask,prop:MaskProp)=><label key={prop} className="flex items-center gap-1 text-ink-3"><NativeInput type="checkbox" className="animation-checkbox" checked={!!m.anim?.[prop]?.keys.length} onChange={e=>mask({layer:layer.id,op:'animate',mask:m.id,prop,on:e.target.checked})}/>{t('animation.masks.animate',{prop:t(`animation.masks.prop.${prop}`)})}</label>;
 const pointsText=(m:LayerMask)=>(m.path?.points??[]).map(q=>`${Math.round(q.x*100)/100},${Math.round(q.y*100)/100}`).join(' ');
 const parsePoints=(text:string)=>text.trim().split(/\s+/).slice(0,MAX_MASK_POINTS+1).map(pair=>{const [x,y]=pair.split(',').map(Number);return {x,y};});
 const sources=comp.layers.filter(o=>o.id!==layer.id&&o.kind!=='audio'&&o.kind!=='null'&&!o.matte&&!comp.layers.some(x=>x.matte?.source===layer.id));
 return <>
  <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked} data-testid="animation-masks"><legend className="text-ink-3">{t('animation.masks.title')}</legend>
   {masks.map((m,i)=><div key={m.id} className="grid gap-1 border-b border-subtle pb-2" data-testid={`animation-mask-${i}`}>
    <div className="flex items-center gap-1"><span className="flex-1 text-ink-3">{t('animation.masks.item',{n:i+1})}</span>
     <Button size="tiny" variant="ghost" aria-label={t('animation.masks.remove')} onClick={()=>mask({layer:layer.id,op:'remove',mask:m.id})}>×</Button></div>
    <div className="grid grid-cols-2 gap-2">
     <label className="grid gap-1 text-ink-3">{t('animation.masks.shape')}<NativeSelect className={field} value={m.shape} onChange={e=>mask({layer:layer.id,op:'update',mask:m.id,patch:{shape:e.target.value}})}><option value="rect">{t('animation.masks.rect')}</option><option value="ellipse">{t('animation.masks.ellipse')}</option><option value="path">{t('animation.masks.path')}</option></NativeSelect></label>
     <label className="grid gap-1 text-ink-3">{t('animation.masks.mode')}<NativeSelect className={field} value={m.mode} onChange={e=>mask({layer:layer.id,op:'update',mask:m.id,patch:{mode:e.target.value}})}><option value="add">{t('animation.masks.add')}</option><option value="subtract">{t('animation.masks.subtract')}</option></NativeSelect></label>
     {field2(m,t('animation.masks.x'),'x',-16384,16384)}
     {field2(m,t('animation.masks.y'),'y',-16384,16384)}
     {m.shape!=='path'&&field2(m,t('animation.masks.width'),'width',1,16384)}
     {m.shape!=='path'&&field2(m,t('animation.masks.height'),'height',1,16384)}
     {field2(m,t('animation.masks.feather'),'feather',0,64)}
     {field2(m,t('animation.masks.opacity'),'opacity',0,100)}
    </div>
    {m.shape==='path'&&m.path&&<div className="grid gap-1 text-ink-3" data-testid={`animation-mask-path-${i}`}>
     <label className="grid gap-1">{t('animation.masks.points')}<NativeInput className={field} key={pointsText(m)} defaultValue={pointsText(m)} onBlur={e=>{const points=parsePoints(e.currentTarget.value);if(pointsText(m)!==e.currentTarget.value.trim())mask({layer:layer.id,op:'path',mask:m.id,points,closed:m.path!.closed,smooth:m.path!.points.some(q=>q.inX!==undefined||q.outX!==undefined)});}}/></label>
     <div className="flex gap-3"><label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={m.path.closed} onChange={e=>mask({layer:layer.id,op:'path',mask:m.id,points:m.path!.points,closed:e.target.checked,smooth:m.path!.points.some(q=>q.inX!==undefined||q.outX!==undefined)})}/>{t('animation.masks.closed')}</label>
     <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={m.path.points.some(q=>q.inX!==undefined||q.outX!==undefined)} onChange={e=>mask({layer:layer.id,op:'path',mask:m.id,points:m.path!.points,closed:m.path!.closed,smooth:e.target.checked})}/>{t('animation.masks.smooth')}</label></div>
    </div>}
    <div className="grid gap-1">{(['position','size','feather','opacity'] as const).filter(p=>!(m.shape==='path'&&p==='size')).map(p=>animToggle(m,p))}</div>
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
