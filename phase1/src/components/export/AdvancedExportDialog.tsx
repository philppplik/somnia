import {useMemo,useState} from 'react';
import {useT} from '../../lib/useT';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {Button} from '../ui/button';
import {Input} from '../ui/input';
import {Checkbox} from '../ui/checkbox';
import {NumberField} from '../ui/number-field';
import {RangeField} from '../ui/range-field';
import {NativeSelect} from '../ui/native-controls';
import {Field} from '../ui/field';
import {exportFieldGroups,visibleExportFields,loadExportPresets,saveExportPreset,deleteExportPreset,formatExportSize,type ExportSchema,type ExportValues,type ExportValue,type ExportField} from '../../lib/export/schema';
/** `url` is the image preview (absent for audio); `detail` replaces the pixel dimensions line (already translated). */
export interface ExportPreview{url:string|null;bytes:number;width:number;height:number;note:string|null;detail?:string}
interface Props{
 open:boolean;onClose:()=>void;schema:ExportSchema;values:ExportValues;
 onChange:(id:string,value:ExportValue)=>void;onApply:(values:ExportValues)=>void;
 preview:ExportPreview|null;rendering:boolean;busy:boolean;errorKey:string|null;errorDetail:string;
 onExport:()=>void;
 /** Stable data-testid on the dialog content (host-owned public hook). */
 contentTestId?:string;
 /** Host-owned per-field test ids (public hooks); win over the schema field's testId. */
 fieldTestIds?:Record<string,string>;
}
/** Shared Photoshop-style Advanced Export dialog (AE1): renders any studio's ExportSchema with DS primitives only. */
export function AdvancedExportDialog({open,onClose,schema,values,onChange,onApply,preview,rendering,busy,errorKey,errorDetail,onExport,contentTestId,fieldTestIds}:Props){
 const {t}=useT();
 const [presets,setPresets]=useState(()=>loadExportPresets(schema.studio));
 const [presetName,setPresetName]=useState('');const [selectedPreset,setSelectedPreset]=useState('');
 const groups=useMemo(()=>exportFieldGroups(schema,values),[schema,values]);
 const fields=useMemo(()=>visibleExportFields(schema,values),[schema,values]);
 const validation=schema.validate(values);
 const renderField=(f:ExportField)=>{
  const id=`ae-${schema.studio}-${f.id}`;const tid=fieldTestIds?.[f.id]??f.testId;
  if(f.type==='select')return <Field key={f.id} label={t(f.labelKey)} controlId={id}>{control=><NativeSelect {...control} value={String(values[f.id]??'')} disabled={busy} data-testid={tid} onChange={e=>onChange(f.id,e.target.value)}>{f.options?.map(o=><option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}</NativeSelect>}</Field>;
  if(f.type==='checkbox')return <Checkbox key={f.id} id={id} label={t(f.labelKey)} data-testid={tid} checked={values[f.id]===true} disabled={busy} onChange={e=>onChange(f.id,e.target.checked)}/>;
  if(f.type==='number')return <NumberField key={f.id} id={id} label={t(f.labelKey)} data-testid={tid} unit={f.unit} value={typeof values[f.id]==='number'?values[f.id] as number:null} min={f.min} max={f.max} step={f.step} disabled={busy} constraintError={t('export.error.dims')} parse={draft=>{const n=Number(draft.trim());return Number.isFinite(n)&&draft.trim()!==''?{ok:true,value:n}:{ok:false,error:t('export.error.dims')};}} onCommit={v=>onChange(f.id,v)}/>;
  if(f.type==='range')return <RangeField key={f.id} id={id} label={t(f.labelKey)} data-testid={tid} value={typeof values[f.id]==='number'?values[f.id] as number:Number(f.min??0)} min={f.min} max={f.max} step={f.step} disabled={busy} readout={String(values[f.id]??'')} onPreview={v=>onChange(f.id,v)} onCommit={v=>onChange(f.id,v)} onCancel={v=>onChange(f.id,v)}/>;
  return <Field key={f.id} label={t(f.labelKey)} controlId={id}>{control=><Input {...control} value={String(values[f.id]??'')} maxLength={f.maxLength} data-testid={tid} disabled={busy} onChange={e=>onChange(f.id,e.target.value)}/>}</Field>;
 };
 return <Dialog open={open} onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="confirm-dialog max-h-[85vh] max-w-2xl overflow-auto" aria-label={t('export.title')} data-testid={contentTestId}>
  <DialogTitle>{t('export.title')}</DialogTitle><DialogDescription className="sr-only">{t('export.title')}</DialogDescription>
  <div className="mt-2 grid gap-4 sm:grid-cols-2">
   <div className="grid content-start gap-3" data-testid="ae-options">
    {groups.map(g=>{
     const body=fields.filter(f=>(f.group??null)===g).map(renderField);
     // --no-bloat: secondary groups (metadata) stay collapsed until asked for.
     if(g==='export.group.metadata')return <details key={g} className="grid content-start gap-2"><summary className="cursor-pointer text-xs font-semibold text-ink-2">{t(g)}</summary><div className="mt-2 grid content-start gap-2">{body}</div></details>;
     return <section key={g??''} className="grid content-start gap-2">
      {g&&<h3 className="m-0 text-xs font-semibold text-ink-2">{t(g)}</h3>}
      {body}
     </section>;})}
    <details className="grid content-start gap-2" data-testid="ae-presets">
     <summary className="cursor-pointer text-xs font-semibold text-ink-2">{t('export.presets')}</summary>
     <NativeSelect aria-label={t('export.presets')} value={selectedPreset} disabled={busy} onChange={e=>{const name=e.target.value;setSelectedPreset(name);const p=presets.find(p=>p.name===name);if(p)onApply(p.values);}}>
      <option value="">{t('export.preset.empty')}</option>
      {presets.map(p=><option key={p.name} value={p.name}>{p.name}</option>)}
     </NativeSelect>
     <div className="flex items-end gap-2">
      <Field label={t('export.preset.name')} controlId="ae-preset-name">{control=><Input {...control} value={presetName} maxLength={40} disabled={busy} onChange={e=>setPresetName(e.target.value)}/>}</Field>
      <Button size="compact" disabled={busy||!presetName.trim()} onClick={()=>{setPresets(saveExportPreset(schema.studio,presetName,values));setSelectedPreset(presetName.trim().slice(0,40));setPresetName('');}}>{t('export.preset.save')}</Button>
      <Button size="compact" variant="ghost" disabled={busy||!selectedPreset} onClick={()=>{setPresets(deleteExportPreset(schema.studio,selectedPreset));setSelectedPreset('');}}>{t('export.preset.delete')}</Button>
     </div>
    </details>
   </div>
   <div className="grid content-start gap-2" data-testid="ae-preview">
    <h3 className="m-0 text-xs font-semibold text-ink-2">{t('export.preview')}</h3>
    {preview?.url?<img alt={t('export.preview')} src={preview.url} className="max-h-56 w-full rounded border border-subtle bg-panel object-contain"/>:preview?null:<div className="grid max-h-56 min-h-24 w-full place-items-center rounded border border-subtle bg-panel text-xs text-ink-3">{rendering?t('export.rendering'):t('export.preview')}</div>}
    {preview&&<p className="m-0 text-xs text-ink-2" data-testid="ae-size">{t('export.finalSize')}: {formatExportSize(preview.bytes,{b:'B',kb:'KB',mb:'MB'})} · {preview.detail??t('export.dimensions',{width:preview.width,height:preview.height})}</p>}
    {rendering&&<p role="status" className="m-0 text-xs text-ink-3">{t('export.rendering')}</p>}
    {preview?.note&&<p className="m-0 text-xs text-ink-3">{t(preview.note)}</p>}
    {errorKey&&<p role="alert" className="m-0 text-xs text-warning">{t(errorKey,{message:errorDetail})}</p>}
   </div>
  </div>
  <div className="mt-4 flex justify-end gap-2">
   <Button variant="outline" onClick={onClose}>{t('export.cancel')}</Button>
   <Button variant="primary" disabled={busy||rendering||validation!==null} onClick={onExport}>{busy?t('export.rendering'):t('export.export')}</Button>
  </div>
  {validation&&<p role="alert" className="m-0 text-xs text-warning">{t(validation)}</p>}
 </DialogContent></Dialog>;
}
