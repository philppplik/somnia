import {useState,useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import {NativeInput,NativeSelect} from '../ui/native-controls';
import {Button} from '../ui/button';
import {InspectorNumberField} from '../studios/InspectorNumberField';
import {executeCommand} from '../../lib/commands';
import {useExportState} from '../../lib/animation/exportJob';
import {EXPORT_FORMATS,EXPORT_PRESETS,FRAME_FORMATS,GIF_COLORS,WEBM_QUALITIES,exportPlan,type ExportFormat} from '../../lib/animation/exportSettings';
import {MAX_PRESET_NAME,subscribeUserPresets,userExportPresets} from '../../lib/animation/exportUserPresets';
import type {Composition} from '../../lib/animation/model';
const field='h-8 w-full min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-xs text-ink select-text';
const SCALES=[25,50,75,100,150,200];const FPS=[12,15,24,30,60];
const size=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
/** Export size, frame rate, frame range and presets, with a readout (frames, duration, pixels, rough size) per format before anything is rendered. Session state: no undo step. */
export function ExportSettingsPanel({comp,busy}:{comp:Composition;busy:boolean}){
 const {t}=useT();const job=useExportState();const s=job.settings;const [err,setErr]=useState('');const [openMore,setMore]=useState(false);const [picked,setPicked]=useState('');const [naming,setNaming]=useState(false);const [pname,setPname]=useState('');const mine=useSyncExternalStore(subscribeUserPresets,userExportPresets,userExportPresets);const more=openMore||s.columns!=null||(s.sheetPadding??0)>0||s.firstNumber!=null||s.quality!==undefined&&s.quality!=='medium'||s.colors!==undefined&&s.colors!==256||s.selectedOnly===true||s.loopSeam===true||s.blur!=null||s.loop===false||s.dither===true||s.frameFormat!==undefined&&s.frameFormat!=='png';
 const set=async(id:string,params:unknown)=>{setErr('');try{await executeCommand(id,params);}catch(e){setErr((e as Error).message);}};
 const base=exportPlan(comp,'sequence',s);
 const scaleOpts=SCALES.includes(s.scale)?SCALES:[...SCALES,s.scale].sort((a,b)=>a-b);
 return <fieldset className="m-0 grid gap-2 border border-subtle p-2" disabled={busy} data-testid="animation-export-settings"><legend className="text-ink-3">{t('animation.export.settings')}</legend>
  <label className="grid gap-1 text-ink-3">{t('animation.export.preset')}<NativeSelect className={field} value={picked} onChange={async e=>{const v=e.target.value;if(!v){setPicked('');return;}if(v.startsWith('mine:')){await set('animation.export.preset.apply',{id:v.slice(5)});setPicked(v);}else{setPicked('');await set('animation.export.settings',{preset:v});}}} data-testid="animation-export-preset">
   <option value="">{t('animation.export.presetPick')}</option>{EXPORT_PRESETS.map(p=><option key={p.id} value={p.id}>{t(`animation.export.preset.${p.id}`)}</option>)}{mine.map(m=><option key={m.id} value={`mine:${m.id}`}>{t('animation.export.preset.mine',{name:m.name})}</option>)}</NativeSelect></label>
  <div className="flex flex-wrap items-center gap-1">
   {naming?<><NativeInput className={field} type="text" maxLength={MAX_PRESET_NAME} value={pname} placeholder={t('animation.export.presetName')} aria-label={t('animation.export.presetName')} onChange={e=>setPname(e.target.value)} data-testid="animation-export-preset-name"/>
    <Button size="tiny" variant="ghost" disabled={!pname.trim()} onClick={async()=>{await set('animation.export.preset.save',{name:pname});setPicked(`mine:${pname.trim().replace(/\s+/g,' ').toLowerCase()}`);setNaming(false);setPname('');}} data-testid="animation-export-preset-save-go">{t('animation.export.presetSaveGo')}</Button></>
    :<Button size="tiny" variant="ghost" onClick={()=>setNaming(true)} data-testid="animation-export-preset-save">{t('animation.export.presetSave')}</Button>}
   {picked.startsWith('mine:')&&!naming&&<Button size="tiny" variant="ghost" onClick={async()=>{await set('animation.export.preset.delete',{id:picked.slice(5)});setPicked('');}} data-testid="animation-export-preset-delete">{t('animation.export.presetDelete')}</Button>}
  </div>
  <div className="grid grid-cols-2 gap-2">
   <label className="grid gap-1 text-ink-3">{t('animation.export.scale')}<NativeSelect className={field} value={s.scale} onChange={e=>void set('animation.export.settings',{scale:Number(e.target.value)})} data-testid="animation-export-scale">{scaleOpts.map(n=><option key={n} value={n}>{n}%</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-ink-3">{t('animation.export.fps')}<NativeSelect className={field} value={s.fps??''} onChange={e=>void set('animation.export.settings',{fps:e.target.value===''?null:Number(e.target.value)})} data-testid="animation-export-fps">
    <option value="">{t('animation.export.fpsComp',{fps:Math.round(comp.fps.num/comp.fps.den*100)/100})}</option>{FPS.map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect></label>
   <InspectorNumberField label={t('animation.export.from')} className={field} resetKey={`${comp.id}-${base.from}`} value={base.from} min={0} step={1} onCommit={n=>void set('animation.export.settings',{from:Math.round(n),to:Math.max(Math.round(n),base.to)})}/>
   <InspectorNumberField label={t('animation.export.to')} className={field} resetKey={`${comp.id}-${base.to}`} value={base.to} min={0} step={1} onCommit={n=>void set('animation.export.settings',{to:Math.round(n),from:Math.min(Math.round(n),base.from)})}/>
   <label className="col-span-2 grid gap-1 text-ink-3">{t('animation.export.fileName')}<NativeInput className={field} type="text" maxLength={80} value={s.fileName??''} placeholder={t('animation.export.fileNameAuto')} onChange={e=>void set('animation.export.settings',{fileName:e.target.value===''?null:e.target.value})} data-testid="animation-export-filename"/></label>
  </div>
  <div className="flex items-center gap-2 text-ink-3"><label className="flex items-center gap-1">{t('animation.export.background')}<NativeInput type="color" className="h-8 w-16 rounded-sm border border-subtle bg-transparent" value={s.background??comp.background} onChange={e=>void set('animation.export.settings',{background:e.target.value})} data-testid="animation-export-background"/></label>{s.background&&<Button size="tiny" variant="ghost" onClick={()=>void set('animation.export.settings',{background:null})} data-testid="animation-export-background-reset">{t('animation.export.backgroundReset')}</Button>}</div>
  <Button size="tiny" variant="ghost" aria-expanded={more} onClick={()=>setMore(!more)} data-testid="animation-export-more">{t('animation.export.more')}</Button>
  {more&&<div className="grid gap-2" data-testid="animation-export-format-options">
  <label className="flex items-center gap-1 text-ink-3" title={t('animation.export.selectedOnly.hint')}><NativeInput type="checkbox" className="animation-checkbox" checked={s.selectedOnly===true} onChange={e=>void set('animation.export.settings',{selectedOnly:e.target.checked})} data-testid="animation-export-selectedonly"/>{t('animation.export.selectedOnly')}</label>
   <div className="grid grid-cols-2 gap-2">
   <label className="grid gap-1 text-ink-3">{t('animation.export.firstNumber')}<NativeInput className={field} type="number" min={0} max={99999} step={1} value={s.firstNumber??''} placeholder={t('animation.export.firstNumberAuto')} onChange={e=>void set('animation.export.settings',{firstNumber:e.target.value===''?null:Number(e.target.value)})} data-testid="animation-export-firstnumber"/></label>
   <label className="grid gap-1 text-ink-3">{t('animation.export.columns')}<NativeInput className={field} type="number" min={1} max={256} step={1} value={s.columns??''} placeholder={t('animation.export.columnsAuto')} onChange={e=>void set('animation.export.settings',{columns:e.target.value===''?null:Number(e.target.value)})} data-testid="animation-export-columns"/></label>
   <label className="grid gap-1 text-ink-3">{t('animation.export.padding')}<NativeInput className={field} type="number" min={0} max={32} step={1} value={s.sheetPadding??0} onChange={e=>void set('animation.export.settings',{sheetPadding:Number(e.target.value)})} data-testid="animation-export-padding"/></label>
   </div>
  <label className="grid gap-1 text-ink-3">{t('animation.export.quality')}<NativeSelect className={field} value={s.quality??'medium'} onChange={e=>void set('animation.export.settings',{quality:e.target.value})} data-testid="animation-export-quality">{WEBM_QUALITIES.map(q=><option key={q} value={q}>{t(`animation.export.quality.${q}`)}</option>)}</NativeSelect></label>
  <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-ink-3">{t('animation.export.frameFormat')}<NativeSelect className={field} value={s.frameFormat??'png'} onChange={e=>void set('animation.export.settings',{frameFormat:e.target.value})} data-testid="animation-export-frameformat">{FRAME_FORMATS.map(f=><option key={f} value={f}>{f==='jpeg'?'JPEG':f==='webp'?'WebP':'PNG'}</option>)}</NativeSelect></label>
   <label className="grid gap-1 text-ink-3">{t('animation.export.frameQuality')}<NativeInput className={field} type="number" min={1} max={100} step={1} disabled={(s.frameFormat??'png')==='png'} value={s.frameQuality??90} onChange={e=>void set('animation.export.settings',{frameQuality:Number(e.target.value)})} data-testid="animation-export-framequality"/></label></div>
  <label className="grid gap-1 text-ink-3">{t('animation.export.blur')}<NativeSelect className={field} value={s.blur??''} disabled={!comp.shutter} onChange={e=>void set('animation.export.settings',{blur:e.target.value===''?null:e.target.value})} data-testid="animation-export-blur"><option value="">{t('animation.export.blur.comp')}</option><option value="off">{t('animation.export.blur.off')}</option><option value="high">{t('animation.export.blur.high')}</option></NativeSelect></label>
  <label className="grid gap-1 text-ink-3">{t('animation.export.colors')}<NativeSelect className={field} value={s.colors??256} onChange={e=>void set('animation.export.settings',{colors:Number(e.target.value)})} data-testid="animation-export-colors">{GIF_COLORS.map(n=><option key={n} value={n}>{n}</option>)}</NativeSelect></label>
  <label className="flex items-center gap-1 text-ink-3" title={t('animation.export.loop.hint')}><NativeInput type="checkbox" className="animation-checkbox" checked={s.loop!==false} onChange={e=>void set('animation.export.settings',{loop:e.target.checked})} data-testid="animation-export-loop"/>{t('animation.export.loop')}</label>
  <label className="flex items-center gap-1 text-ink-3" title={t('animation.export.loopSeam.hint')}><NativeInput type="checkbox" className="animation-checkbox" checked={s.loopSeam===true} onChange={e=>void set('animation.export.settings',{loopSeam:e.target.checked})} data-testid="animation-export-loopseam"/>{t('animation.export.loopSeam')}</label>
  <label className="flex items-center gap-1 text-ink-3" title={t('animation.export.dither.hint')}><NativeInput type="checkbox" className="animation-checkbox" checked={s.dither===true} onChange={e=>void set('animation.export.settings',{dither:e.target.checked})} data-testid="animation-export-dither"/>{t('animation.export.dither')}</label>
  </div>}
  <div className="flex gap-1"><Button size="tiny" variant="ghost" onClick={()=>void set('animation.export.settings',{reset:true})} data-testid="animation-export-reset">{t('animation.export.resetSettings')}</Button></div>
  <ul className="m-0 grid list-none gap-1 p-0 text-ink-2" aria-label={t('animation.export.estimate')} data-testid="animation-export-estimate">
   {EXPORT_FORMATS.map((f:ExportFormat)=>{const p=exportPlan(comp,f,s);const bad=p.problems.length>0;
    return <li key={f} data-testid={`animation-export-estimate-${f}`} data-problem={bad||undefined} className={bad||p.overCap?'text-danger':undefined}>
     {t(`animation.export.kind.${f}`)}: {t('animation.export.readout',{frames:p.frames,seconds:Math.round(p.seconds*10)/10,size:p.sheet?`${p.sheet.width}x${p.sheet.height}`:`${p.width}x${p.height}`,bytes:size(p.estimateBytes)})}
     {bad&&` - ${t(`animation.export.problem.${p.problems[0]}`)}`}{!bad&&p.overCap&&` - ${t('animation.export.overCap')}`}</li>;})}
  </ul>
  <p className="m-0 text-ink-3">{t('animation.export.estimateNote')}</p>
  {err&&<div role="alert" className="text-danger">{err}</div>}
 </fieldset>;
}
