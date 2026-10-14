import {useState} from 'react';
import {useT} from '../../lib/useT';
import {NativeSelect} from '../ui/native-controls';
import {Button} from '../ui/button';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {executeCommand} from '../../lib/commands';
import {useExportState} from '../../lib/animation/exportJob';
import {EXPORT_FORMATS,EXPORT_PRESETS,exportPlan,type ExportFormat} from '../../lib/animation/exportSettings';
import type {Composition} from '../../lib/animation/model';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const SCALES=[25,50,75,100,150,200];const FPS=[12,15,24,30,60];
const size=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
/** Export size, frame rate, frame range and presets, with a readout (frames, duration, pixels, rough size) per format before anything is rendered. Session state: no undo step. */
export function ExportSettingsPanel({comp,busy}:{comp:Composition;busy:boolean}){
 const {t}=useT();const job=useExportState();const s=job.settings;const [err,setErr]=useState('');
 const set=async(id:string,params:unknown)=>{setErr('');try{await executeCommand(id,params);}catch(e){setErr((e as Error).message);}};
 const base=exportPlan(comp,'sequence',s);
 const scaleOpts=SCALES.includes(s.scale)?SCALES:[...SCALES,s.scale].sort((a,b)=>a-b);
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={busy} data-testid="animation-export-settings"><legend className="text-ink-3">{t('animation.export.settings')}</legend>
  <label className="grid gap-1 text-ink-3">{t('animation.export.preset')}<NativeSelect className={field} value="" onChange={e=>{if(e.target.value)void set('animation.export.settings',{preset:e.target.value});}} data-testid="animation-export-preset">
   <option value="">{t('animation.export.presetPick')}</option>{EXPORT_PRESETS.map(p=><option key={p.id} value={p.id}>{t(`animation.export.preset.${p.id}`)}</option>)}</NativeSelect></label>
  <div className="grid grid-cols-2 gap-2">
   <label className="grid gap-1 text-ink-3">{t('animation.export.scale')}<NativeSelect className={field} value={s.scale} onChange={e=>void set('animation.export.settings',{scale:Number(e.target.value)})} data-testid="animation-export-scale">{scaleOpts.map(n=><option key={n} value={n}>{n}%</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-ink-3">{t('animation.export.fps')}<NativeSelect className={field} value={s.fps??''} onChange={e=>void set('animation.export.settings',{fps:e.target.value===''?null:Number(e.target.value)})} data-testid="animation-export-fps">
    <option value="">{t('animation.export.fpsComp',{fps:Math.round(comp.fps.num/comp.fps.den*100)/100})}</option>{FPS.map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect></label>
   <InspectorNumberField label={t('animation.export.from')} className={field} resetKey={`${comp.id}-${base.from}`} value={base.from} min={0} step={1} onCommit={n=>void set('animation.export.settings',{from:Math.round(n),to:Math.max(Math.round(n),base.to)})}/>
   <InspectorNumberField label={t('animation.export.to')} className={field} resetKey={`${comp.id}-${base.to}`} value={base.to} min={0} step={1} onCommit={n=>void set('animation.export.settings',{to:Math.round(n),from:Math.min(Math.round(n),base.from)})}/></div>
  <div className="flex gap-1"><Button size="tiny" variant="ghost" onClick={()=>void set('animation.export.settings',{reset:true})} data-testid="animation-export-reset">{t('animation.export.resetSettings')}</Button></div>
  <ul className="m-0 grid list-none gap-1 p-0 text-ink-2" aria-label={t('animation.export.estimate')} data-testid="animation-export-estimate">
   {EXPORT_FORMATS.map((f:ExportFormat)=>{const p=exportPlan(comp,f,s);const bad=p.problems.length>0;
    return <li key={f} data-testid={`animation-export-estimate-${f}`} data-problem={bad||undefined} className={bad||p.overCap?'text-danger':undefined}>
     {t(`animation.export.kind.${f}`)}: {t('animation.export.readout',{frames:p.frames,seconds:Math.round(p.seconds*10)/10,size:`${p.width}x${p.height}`,bytes:size(p.estimateBytes)})}
     {bad&&` - ${t(`animation.export.problem.${p.problems[0]}`)}`}{!bad&&p.overCap&&` - ${t('animation.export.overCap')}`}</li>;})}
  </ul>
  <p className="m-0 text-ink-3">{t('animation.export.estimateNote')}</p>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
