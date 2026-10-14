import {NativeInput,NativeSelect} from '../ui/native-controls';
import {DEFAULT_LAYER_COLOR} from '../../lib/animation/model';
import type {Edit} from '../../lib/animation/edit';
import {prepareAnimationAsset} from '../../lib/animation/assets';
import {animationSession} from '../../lib/animation/session';
import {newId} from '../../lib/animation/model';
import {useRef,useState} from 'react';
import {executeCommand} from '../../lib/commands';
import {useT} from '../../lib/useT';
import {useAnimationState} from '../../lib/animation/session';
import {findComp,findLayer,TRANSFORM_KEYS,type LayerKind,type PropValue,type TransformKey} from '../../lib/animation/model';
import {evaluate} from '../../lib/animation/interpolate';
import {ticksToSeconds,timecode} from '../../lib/animation/time';
import {workAreaFrames} from '../../lib/animation/playback';
import {cancelExport,setExportTransparent,useExportState} from '../../lib/animation/exportJob';
import type {InspectorSectionProps,PanelHostProps} from '../../lib/shell/types';
import {Button} from '../ui/button';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {fmt,PROP_LABEL,renderSummary} from './format';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
const KINDS:LayerKind[]=['solid','text','shape','null'];
/** Left panel: composition list and layer creation. The timeline owns the layer list, so it is not repeated here. */
export function CompositionsPanel(_:PanelHostProps){
 const {t}=useT();const s=useAnimationState();const doc=s.doc;const input=useRef<HTMLInputElement>(null);const [importError,setImportError]=useState('');const [importing,setImporting]=useState(false);
 if(!doc)return <aside className="grid content-start gap-3 p-3 text-xs" data-testid="animation-compositions-panel">
  <Button size="compact" variant="outline" onClick={()=>run('animation.project.new')} data-testid="animation-new">{t('cmd.animation.project.new')}</Button>
  <Button size="compact" variant="outline" onClick={()=>run('animation.project.recover')}>{t('cmd.animation.project.recover')}</Button></aside>;
 return <aside className="grid min-h-0 content-start gap-3 p-3 text-xs" data-testid="animation-compositions-panel">
  <h3 className="m-0 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('animation.comp.list')}</h3>
  <ul className="m-0 grid list-none gap-1 p-0" aria-label={t('animation.comp.list')}>{doc.compositions.map(c=><li key={c.id}>
   <button type="button" aria-current={c.id===doc.activeComp} className={`w-full truncate rounded-sm border px-2 py-1.5 text-left text-ink ${c.id===doc.activeComp?'border-line bg-hover':'border-subtle'}`} onClick={()=>run('animation.comp.select',{comp:c.id})}>{c.name}</button></li>)}</ul>
  <Button size="compact" variant="outline" onClick={()=>run('animation.comp.add')}>{t('animation.comp.new')}</Button>
  <h3 className="m-0 mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{t('animation.layer.addHeading')}</h3>
  <div className="grid grid-cols-2 gap-2">{KINDS.map(k=><Button key={k} size="compact" variant="outline" onClick={()=>run('animation.layer.add',{kind:k})} data-testid={`animation-add-${k}`}>{t(`animation.layer.${k}`)}</Button>)}</div>
  <NativeInput ref={input} type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" aria-label={t('animation.asset.import')} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const session=animationSession(),document=session.document;setImportError('');setImporting(true);try{const asset=await prepareAnimationAsset(file);if(session.document?.id!==document?.id||session.document?.activeComp!==document?.activeComp)throw Error(t('animation.asset.changed'));session.dispatch({type:'asset.import',asset});session.setView({selectedLayer:findComp(session.document!)!.layers[0].id});}catch(err){setImportError((err as Error).message);}finally{setImporting(false);}}}/>
  <Button size="compact" variant="outline" disabled={importing} onClick={()=>input.current?.click()} data-testid="animation-import-asset">{t('animation.asset.import')}</Button>
  <p className="m-0 text-ink-3">{t('animation.asset.limits')}</p>
  {importError&&<p role="alert" className="m-0 text-ink">{importError}</p>}
 </aside>;
}
function NumberField(props:Parameters<typeof InspectorNumberField>[0]){return <InspectorNumberField {...props} className={field} format={fmt}/>;}
/** Right inspector: values for the selected layer. One owner per control, numeric editing for every property. */
export function PropertiesSection(_:InspectorSectionProps){
 const {t}=useT();const [editError,setEditError]=useState('');const edit=(e:Edit)=>{try{animationSession().dispatch(e);setEditError('');}catch(err){setEditError((err as Error).message);}};const s=useAnimationState();const doc=s.doc;const comp=doc&&findComp(doc);const layer=comp&&s.view.selectedLayer?findLayer(comp,s.view.selectedLayer):undefined;
 if(!comp||!layer)return null;const at=s.view.playhead;
 const setNum=(prop:TransformKey,v:PropValue)=>run('animation.prop.set',{layer:layer.id,prop,value:v});
 return <div className="grid gap-3 p-3 text-xs" data-testid="animation-properties">
  {editError&&<p role="alert" className="m-0 text-ink">{editError}</p>}
  <label className="grid gap-1 text-ink-3">{t('animation.layer.name')}<NativeInput className={field} defaultValue={layer.name} key={layer.id+layer.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==layer.name)run('animation.layer.update',{layer:layer.id,name:v});}}/></label>
  <div className="flex gap-3 text-ink-2">{(['visible','solo','locked'] as const).map(f=><label key={f} className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={layer[f]} onChange={e=>run('animation.layer.update',{layer:layer.id,[f]:e.target.checked})}/>{t(`animation.layer.${f}`)}</label>)}</div>
  {layer.kind==='text'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.text.content')}<NativeInput className={field} disabled={layer.locked} defaultValue={layer.source.text} key={layer.id+(layer.source.text??'')} onBlur={e=>{if(e.currentTarget.value!==layer.source.text)run('animation.layer.update',{layer:layer.id,text:e.currentTarget.value});}}/></label>}
  {layer.kind!=='null'&&layer.kind!=='raster'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.color')}<NativeInput type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" disabled={layer.locked} value={layer.source.color??DEFAULT_LAYER_COLOR} onChange={e=>run('animation.layer.update',{layer:layer.id,color:e.target.value})}/></label>}
  {layer.kind==='text'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.text.size')}<NumberField label={t('animation.layer.text.size')} value={layer.source.size??48} disabled={layer.locked} onCommit={size=>run('animation.layer.update',{layer:layer.id,size})}/></label>}
  {(layer.kind==='shape'||layer.kind==='solid')&&<div className="grid grid-cols-2 gap-2">{(['width','height'] as const).map(axis=><label key={axis} className="grid gap-1 text-ink-3">{t(`animation.comp.${axis}`)}<NumberField label={t(`animation.comp.${axis}`)} value={layer.source[axis]??100} disabled={layer.locked} onCommit={n=>edit({type:'layer.update',layer:layer.id,source:{[axis]:n}})}/></label>)}</div>}
  {layer.kind==='shape'&&<label className="grid gap-1 text-ink-3">{t('animation.shape.type')}<NativeSelect className={field} disabled={layer.locked} value={layer.source.shape??'rect'} onChange={e=>edit({type:'layer.update',layer:layer.id,source:{shape:e.target.value as 'rect'|'ellipse'}})}><option value="rect">{t('animation.shape.rect')}</option><option value="ellipse">{t('animation.shape.ellipse')}</option></NativeSelect></label>}
  <label className="grid gap-1 text-ink-3">{t('animation.path.timing')}<NativeSelect className={field} disabled={layer.locked} value={layer.transform.position.pathMode??'parameter'} onChange={e=>edit({type:'prop.pathMode',layer:layer.id,mode:e.target.value as 'parameter'|'arcLength'})}><option value="parameter">{t('animation.path.parameter')}</option><option value="arcLength">{t('animation.path.arcLength')}</option></NativeSelect></label>
  <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={layer.locked}><legend className="text-ink-3">{t('animation.effects.title')}</legend>
   {(layer.effects??[]).map((effect,i)=><div key={effect.id} className="grid gap-1 border-b border-subtle pb-2">
    <div className="flex items-center gap-1"><label className="flex flex-1 items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={effect.enabled} onChange={e=>edit({type:'layer.effects',layer:layer.id,effects:layer.effects!.map(x=>x.id===effect.id?{...x,enabled:e.target.checked}:x)})}/>{t(`animation.effects.${effect.kind}`)}</label>
    <Button size="tiny" variant="ghost" disabled={i===0} aria-label={t('animation.effects.up')} onClick={()=>{const effects=[...layer.effects!];[effects[i-1],effects[i]]=[effects[i],effects[i-1]];edit({type:'layer.effects',layer:layer.id,effects});}}>↑</Button>
    <Button size="tiny" variant="ghost" aria-label={t('animation.effects.remove')} onClick={()=>edit({type:'layer.effects',layer:layer.id,effects:layer.effects!.filter(x=>x.id!==effect.id)})}>×</Button></div>
    <NumberField label={t('animation.effects.amount')} step={effect.kind==='tint'?0.1:1} value={effect.amount} onCommit={amount=>edit({type:'layer.effects',layer:layer.id,effects:layer.effects!.map(x=>x.id===effect.id?{...x,amount}:x)})}/>
    {effect.kind==='tint'&&<NativeInput type="color" aria-label={t('animation.layer.color')} value={effect.color} onChange={e=>edit({type:'layer.effects',layer:layer.id,effects:layer.effects!.map(x=>x.id===effect.id?{...x,color:e.target.value}:x)})}/>}
   </div>)}
   <div className="flex gap-1">{(['blur','tint'] as const).map(kind=><Button key={kind} size="tiny" variant="outline" disabled={(layer.effects?.length??0)>=8} onClick={()=>edit({type:'layer.effects',layer:layer.id,effects:[...(layer.effects??[]),{id:newId('effect'),kind,enabled:true,amount:kind==='blur'?4:1,color:DEFAULT_LAYER_COLOR}]})}>{t(`animation.effects.${kind}`)} +</Button>)}</div>
  </fieldset>
  {TRANSFORM_KEYS.map(prop=>{
   const p=layer.transform[prop];const v=evaluate(p,at);const animated=p.keys.length>0;const label=t(PROP_LABEL[prop]);const onKey=p.keys.some(k=>k.t===at);const key=p.keys.find(k=>k.t===at);
   return <fieldset key={prop} className="m-0 grid gap-1 border-0 p-0" data-testid={`animation-prop-${prop}`}>
    <legend className="mb-1 flex w-full items-center justify-between text-ink-3"><span>{label}</span>
     <span className="flex items-center gap-2">
      <label className="flex items-center gap-1"><NativeInput type="checkbox" className="animation-checkbox" checked={animated} disabled={layer.locked} aria-label={t('animation.prop.animate',{name:label})} onChange={e=>run('animation.prop.animate',{layer:layer.id,prop,on:e.target.checked})}/>{t('animation.prop.animate',{name:''}).trim()}</label>
      {animated&&<Button size="tiny" variant="outline" disabled={layer.locked} onClick={()=>run(onKey?'animation.key.remove':'animation.key.add',{layer:layer.id,prop})}>{onKey?t('animation.key.remove'):t('animation.key.add')}</Button>}
     </span></legend>
    <div className="grid grid-cols-2 gap-2">
     {typeof v==='number'?<NumberField resetKey={`${layer.id}:${prop}:${at}`} label={label} value={v} disabled={layer.locked} onCommit={n=>setNum(prop,n)}/>:<>
      <NumberField resetKey={`${layer.id}:${prop}:${at}:x`} label={`${label} ${t('animation.prop.x')}`} value={v[0]} disabled={layer.locked} onCommit={n=>setNum(prop,[n,v[1]])}/>
      <NumberField resetKey={`${layer.id}:${prop}:${at}:y`} label={`${label} ${t('animation.prop.y')}`} value={v[1]} disabled={layer.locked} onCommit={n=>setNum(prop,[v[0],n])}/></>}
    </div>
    {key&&<NativeSelect className={field} aria-label={t('animation.key.interp')} value={key.interp} disabled={layer.locked} onChange={e=>run('animation.key.interp',{layer:layer.id,prop,interp:e.target.value})}>
     {(['hold','linear','bezier'] as const).map(i=><option key={i} value={i}>{t(`animation.key.${i}`)}</option>)}</NativeSelect>}
   </fieldset>;})}
 </div>;
}
export function CompositionSection(_:InspectorSectionProps){
 const {t}=useT();const s=useAnimationState();const comp=s.doc&&findComp(s.doc);if(!comp)return null;
 const fpsVal=comp.fps.num/comp.fps.den;
 return <div className="grid gap-2 p-3 text-xs" data-testid="animation-composition-settings">
  <label className="grid gap-1 text-ink-3">{t('animation.comp.name')}<NativeInput className={field} defaultValue={comp.name} key={comp.id+comp.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==comp.name)run('animation.comp.update',{name:v});}}/></label>
  <div className="grid grid-cols-2 gap-2">
   <NumberField resetKey={comp.id} label={t('animation.comp.width')} value={comp.width} onCommit={n=>run('animation.comp.update',{width:Math.round(n)})}/>
   <NumberField resetKey={comp.id} label={t('animation.comp.height')} value={comp.height} onCommit={n=>run('animation.comp.update',{height:Math.round(n)})}/>
   <NumberField resetKey={comp.id} label={t('animation.comp.fps')} value={fpsVal} disabled={comp.fps.den!==1} onCommit={n=>run('animation.comp.update',{fps:Math.round(n)})}/>
   <NumberField resetKey={comp.id} label={t('animation.comp.duration')} step={0.5} value={ticksToSeconds(comp.duration)} onCommit={n=>run('animation.comp.update',{seconds:n})}/>
  </div>
  <label className="grid gap-1 text-ink-3">{t('animation.comp.background')}<NativeInput type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" value={comp.background} onChange={e=>run('animation.comp.update',{background:e.target.value})}/></label>
  <p className="m-0 text-ink-3">{timecode(comp.duration,comp.fps)}</p>
 </div>;
}
/** Output setup: real PNG frame and PNG-sequence export. The hero verb only opens this panel and never exports by itself. */
export function RenderSection(_:InspectorSectionProps){
 const {t}=useT();const s=useAnimationState();const job=useExportState();const comp=s.doc&&findComp(s.doc);if(!comp)return null;
 const plan=workAreaFrames(comp.workArea,comp.fps);const busy=job.status==='running';
 return <div className="grid gap-2 p-3 text-xs" data-testid="animation-render-setup">
  <p className="m-0 text-ink">{t('animation.render.summary',renderSummary(comp) as unknown as Record<string,string|number>)}</p>
  <p className="m-0 text-ink-3" data-testid="animation-export-range">{t('animation.export.range',{frames:plan.count,from:timecode(comp.workArea.in,comp.fps),to:timecode(comp.workArea.out,comp.fps)})}</p>
  <label className="flex items-center gap-2 text-ink-2"><NativeInput type="checkbox" className="animation-checkbox" checked={job.transparent} disabled={busy} onChange={e=>setExportTransparent(e.target.checked)} data-testid="animation-export-alpha"/>{t('animation.export.transparent')}</label>
  <div className="grid gap-2">
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.frame')} data-testid="animation-export-frame">{t('animation.export.frame')}</Button>
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.export.sequence')} data-testid="animation-export-sequence">{t('animation.export.sequence')}</Button>
  </div>
  {busy&&<div className="grid gap-1" role="status"><progress className="h-2 w-full" max={Math.max(1,job.total)} value={job.done} data-testid="animation-export-progress"/>
   <span className="text-ink-3">{t('animation.export.progress',{done:job.done,total:job.total})}</span>
   {job.kind==='sequence'&&<Button size="compact" variant="outline" onClick={cancelExport} data-testid="animation-export-cancel">{t('animation.export.cancel')}</Button>}</div>}
  {job.status==='done'&&<p role="status" className="m-0 text-ink" data-testid="animation-export-done">{t('animation.export.done',{file:job.fileName})}</p>}
  {job.status==='error'&&<p role="alert" className="m-0 text-ink" data-testid="animation-export-error">{t('animation.export.error',{message:job.message})}</p>}
  <p className="m-0 text-ink-3">{t('animation.render.note')}</p>
  <Button size="compact" variant="outline" disabled={busy} onClick={()=>run('animation.render.close')}>{t('animation.render.close')}</Button>
 </div>;
}
