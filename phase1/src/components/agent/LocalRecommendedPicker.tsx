import {useState} from 'react';
import {useT} from '../../lib/useT';
import {Field} from '../ui/field';
import {NativeSelect} from '../ui/native-controls';
import {Button} from '../ui/button';
import {Badge} from '../ui/badge';
import {inspectHardware,type Hardware} from '../../lib/agent/localModelAdvice';
import {recommendedModelCandidates,type ModelTask} from '../../lib/agent/localModelPicker';
export function LocalRecommendedPicker({disabled,onDownload,hardwareProbe=inspectHardware}:{disabled:boolean;onDownload:(tag:string)=>void;hardwareProbe?:()=>Promise<Hardware|null>}){
 const {t,locale}=useT();const [task,setTask]=useState<ModelTask>('text'),[hardware,setHardware]=useState<Hardware|null>(null),[busy,setBusy]=useState(false);
 const inspect=async()=>{setBusy(true);try{setHardware(await hardwareProbe());}catch{setHardware(null);}finally{setBusy(false);}};
 return <details className="local-runtime-discovery"><summary>{t('local.picker.title')}</summary><p>{t('local.picker.boundary')}</p><Field label={t('local.picker.task')}>{control=><NativeSelect {...control} value={task} disabled={disabled} onChange={e=>setTask(e.target.value as ModelTask)}>{(['text','vision','tools'] as const).map(value=><option key={value} value={value}>{t('local.cap.'+value)}</option>)}</NativeSelect>}</Field><Button type="button" disabled={busy} onClick={()=>void inspect()}>{t('local.picker.hardware')}</Button><p>{t(hardware?'local.hardware.heuristic':'local.hardware.unavailable')}</p><p>{t('local.hardware.storageUnknown')}</p><ul className="local-models-list">{recommendedModelCandidates(task,hardware).map(({entry,fit})=><li key={entry.id}><strong>{entry.tag}</strong> <Badge>{t('local.fit.'+fit.label)}</Badge><p>{entry.estimatedBytes===undefined?t('local.unknown'):new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(entry.estimatedBytes/1e9)+' GB'} · {entry.license}</p><p>{t('local.picker.unverified')}</p><a href={entry.sourceUrl} target="_blank" rel="noreferrer">{t('local.catalog.source')}</a> · <a href={entry.licenseUrl} target="_blank" rel="noreferrer">{t('local.picker.license')}</a><Button type="button" disabled={disabled} onClick={()=>onDownload(entry.tag)}>{t('local.picker.download',{model:entry.tag})}</Button></li>)}</ul></details>;
}
