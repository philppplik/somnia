import {useState} from 'react';
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
import {fmt,PROP_LABEL,renderSummary} from './format';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const run=(id:string,params?:unknown)=>void executeCommand(id,params);
const KINDS:LayerKind[]=['solid','text','shape','null'];
/** Left panel: composition list and layer creation. The timeline owns the layer list, so it is not repeated here. */
export function CompositionsPanel(_:PanelHostProps){
 const {t}=useT();const s=useAnimationState();const doc=s.doc;
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
 </aside>;
}
function NumberField({label,value,onCommit,step=1,disabled}:{label:string;value:number;onCommit:(n:number)=>void;step?:number;disabled?:boolean}){
 const [draft,setDraft]=useState<string|null>(null);
 const commit=()=>{if(draft===null)return;const n=Number(draft);setDraft(null);if(draft.trim()!==''&&Number.isFinite(n)&&n!==value)onCommit(n);};
 return <input className={field} type="number" step={step} disabled={disabled} aria-label={label} value={draft??fmt(value)} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setDraft(null);}}/>;
}
/** Right inspector: values for the selected layer. One owner per control, numeric editing for every property. */
export function PropertiesSection(_:InspectorSectionProps){
 const {t}=useT();const s=useAnimationState();const doc=s.doc;const comp=doc&&findComp(doc);const layer=comp&&s.view.selectedLayer?findLayer(comp,s.view.selectedLayer):undefined;
 if(!comp||!layer)return null;const at=s.view.playhead;
 const setNum=(prop:TransformKey,v:PropValue)=>run('animation.prop.set',{layer:layer.id,prop,value:v});
 return <div className="grid gap-3 p-3 text-xs" data-testid="animation-properties">
  <label className="grid gap-1 text-ink-3">{t('animation.layer.name')}<input className={field} defaultValue={layer.name} key={layer.id+layer.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==layer.name)run('animation.layer.update',{layer:layer.id,name:v});}}/></label>
  <div className="flex gap-3 text-ink-2">{(['visible','solo','locked'] as const).map(f=><label key={f} className="flex items-center gap-1"><input type="checkbox" checked={layer[f]} onChange={e=>run('animation.layer.update',{layer:layer.id,[f]:e.target.checked})}/>{t(`animation.layer.${f}`)}</label>)}</div>
  {layer.kind==='text'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.text.content')}<input className={field} disabled={layer.locked} defaultValue={layer.source.text} key={layer.id+(layer.source.text??'')} onBlur={e=>{if(e.currentTarget.value!==layer.source.text)run('animation.layer.update',{layer:layer.id,text:e.currentTarget.value});}}/></label>}
  {layer.kind!=='null'&&<label className="grid gap-1 text-ink-3">{t('animation.layer.color')}<input type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" disabled={layer.locked} value={layer.source.color??'#ffffff'} onChange={e=>run('animation.layer.update',{layer:layer.id,color:e.target.value})}/></label>}
  {TRANSFORM_KEYS.map(prop=>{
   const p=layer.transform[prop];const v=evaluate(p,at);const animated=p.keys.length>0;const label=t(PROP_LABEL[prop]);const onKey=p.keys.some(k=>k.t===at);const key=p.keys.find(k=>k.t===at);
   return <fieldset key={prop} className="m-0 grid gap-1 border-0 p-0" data-testid={`animation-prop-${prop}`}>
    <legend className="mb-1 flex w-full items-center justify-between text-ink-3"><span>{label}</span>
     <span className="flex items-center gap-2">
      <label className="flex items-center gap-1"><input type="checkbox" checked={animated} disabled={layer.locked} aria-label={t('animation.prop.animate',{name:label})} onChange={e=>run('animation.prop.animate',{layer:layer.id,prop,on:e.target.checked})}/>{t('animation.prop.animate',{name:''}).trim()}</label>
      {animated&&<Button size="tiny" variant="outline" disabled={layer.locked} onClick={()=>run(onKey?'animation.key.remove':'animation.key.add',{layer:layer.id,prop})}>{onKey?t('animation.key.remove'):t('animation.key.add')}</Button>}
     </span></legend>
    <div className="grid grid-cols-2 gap-2">
     {typeof v==='number'?<NumberField label={label} value={v} disabled={layer.locked} onCommit={n=>setNum(prop,n)}/>:<>
      <NumberField label={`${label} ${t('animation.prop.x')}`} value={v[0]} disabled={layer.locked} onCommit={n=>setNum(prop,[n,v[1]])}/>
      <NumberField label={`${label} ${t('animation.prop.y')}`} value={v[1]} disabled={layer.locked} onCommit={n=>setNum(prop,[v[0],n])}/></>}
    </div>
    {key&&<select className={field} aria-label={t('animation.key.interp')} value={key.interp} disabled={layer.locked} onChange={e=>run('animation.key.interp',{layer:layer.id,prop,interp:e.target.value})}>
     {(['hold','linear','bezier'] as const).map(i=><option key={i} value={i}>{t(`animation.key.${i}`)}</option>)}</select>}
   </fieldset>;})}
 </div>;
}
export function CompositionSection(_:InspectorSectionProps){
 const {t}=useT();const s=useAnimationState();const comp=s.doc&&findComp(s.doc);if(!comp)return null;
 const fpsVal=comp.fps.num/comp.fps.den;
 return <div className="grid gap-2 p-3 text-xs" data-testid="animation-composition-settings">
  <label className="grid gap-1 text-ink-3">{t('animation.comp.name')}<input className={field} defaultValue={comp.name} key={comp.id+comp.name} onBlur={e=>{const v=e.currentTarget.value.trim();if(v&&v!==comp.name)run('animation.comp.update',{name:v});}}/></label>
  <div className="grid grid-cols-2 gap-2">
   <label className="grid gap-1 text-ink-3">{t('animation.comp.width')}<NumberField label={t('animation.comp.width')} value={comp.width} onCommit={n=>run('animation.comp.update',{width:Math.round(n)})}/></label>
   <label className="grid gap-1 text-ink-3">{t('animation.comp.height')}<NumberField label={t('animation.comp.height')} value={comp.height} onCommit={n=>run('animation.comp.update',{height:Math.round(n)})}/></label>
   <label className="grid gap-1 text-ink-3">{t('animation.comp.fps')}<NumberField label={t('animation.comp.fps')} value={fpsVal} disabled={comp.fps.den!==1} onCommit={n=>run('animation.comp.update',{fps:Math.round(n)})}/></label>
   <label className="grid gap-1 text-ink-3">{t('animation.comp.duration')}<NumberField label={t('animation.comp.duration')} step={0.5} value={ticksToSeconds(comp.duration)} onCommit={n=>run('animation.comp.update',{seconds:n})}/></label>
  </div>
  <label className="grid gap-1 text-ink-3">{t('animation.comp.background')}<input type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" value={comp.background} onChange={e=>run('animation.comp.update',{background:e.target.value})}/></label>
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
  <label className="flex items-center gap-2 text-ink-2"><input type="checkbox" style={{width:16,height:16,margin:0,flex:"none"}} checked={job.transparent} disabled={busy} onChange={e=>setExportTransparent(e.target.checked)} data-testid="animation-export-alpha"/>{t('animation.export.transparent')}</label>
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
