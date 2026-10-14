import {LocalPullProgress} from './LocalPullProgress';
import {localPullFailure} from '../../lib/agent/localResilience';
import {chooseModelDisk,modelDiskAdvice,type ModelDisk} from '../../lib/agent/localModelDisk';
import {StudioStatus} from '../studios/StudioStatus';
import {LocalRecommendedPicker} from './LocalRecommendedPicker';
import {Checkbox} from '../ui/checkbox';
import {useState,useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import {localModelManager,type LocalModelManager,registryModel} from '../../lib/agent/localModelManager';
import {agentSettingsSnapshot,subscribeAgentSettings} from '../../lib/agent/settingsRuntime';
import type {InstalledModel,RuntimeSnapshot} from '../../lib/agent/localModels';
import {Button} from '../ui/button';
import {Input} from '../ui/input';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
export function LocalModelActions({snapshot,onChanged,manager=localModelManager,chooseDisk=chooseModelDisk}:{snapshot:RuntimeSnapshot|null;onChanged:()=>Promise<void>;manager?:LocalModelManager;chooseDisk?:()=>Promise<ModelDisk|null>}){
 const {t}=useT();const job=useSyncExternalStore(manager.subscribe,manager.snapshot,manager.snapshot);
 useSyncExternalStore(subscribeAgentSettings,agentSettingsSnapshot,agentSettingsSnapshot);
 const [name,setName]=useState(''),[error,setError]=useState(''),[instruction,setInstruction]=useState(''),[busy,setBusy]=useState(false);
 const [confirm,setConfirm]=useState<{kind:'pull'|'delete';model:string;entry?:InstalledModel}|null>(null);
 const [ack,setAck]=useState(false);const [disk,setDisk]=useState<ModelDisk|null>(null);const [diskBusy,setDiskBusy]=useState(false);
 const diskAdvice=modelDiskAdvice(confirm?.model??'',disk);
 const inspectDisk=async()=>{setDiskBusy(true);setError('');try{setDisk(await chooseDisk());}catch{setError(t('local.disk.failed'));}finally{setDiskBusy(false);}};
 const active=!!job&&['preparing','downloading','verifying','installing','reconciling','cancel-requested'].includes(job.phase)&&!job.error;
 const locked=busy||manager.isBusy()||active||!manager.canMutate();
 const act=async(action:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await action();await onChanged();}catch{setError(t('local.action.failed'));}finally{setBusy(false);}};
 const propose=(raw:string)=>{try{const model=registryModel(raw);setAck(false);setDisk(null);setConfirm({kind:'pull',model});setError('');}catch{setError(t('local.action.invalid'));}};
 return <div className="local-model-actions">
  {error&&<StudioStatus tone="error" live="assertive">{t('local.recovery.pullFailed')}</StudioStatus>}
  {snapshot?.state==='stopped'&&<Button disabled={locked} type="button" onClick={()=>void act(async()=>{const result=await manager.launch();setInstruction(result.instruction??'');})}>{t('local.action.start')}</Button>}
  {instruction&&<p>{t('local.action.manual')} <code>{instruction}</code></p>}
  {snapshot?.state==='running'&&<>
   <LocalRecommendedPicker disabled={locked} onDownload={propose}/>
   <label>{t('local.action.name')}<Input value={name} disabled={locked} onChange={e=>setName(e.target.value)} placeholder="qwen3:4b"/></label>
   <Button type="button" variant="outline" disabled={locked||!name.trim()} onClick={()=>propose(name)}>{t('local.action.pull')}</Button>
   <ul className="local-models-list">{snapshot.models.map(model=><li key={model.id}><span>{model.id}</span><div className="local-models-badges"><Button type="button" size="compact" disabled={locked} onClick={()=>propose(model.id)} aria-label={t('local.action.updateModel',{model:model.id})}>{t('local.action.update')}</Button><Button type="button" size="compact" disabled={locked||!model.digest} onClick={()=>{setAck(false);setConfirm({kind:'delete',model:model.id,entry:model});}} aria-label={t('local.action.deleteModel',{model:model.id})}>{t('local.action.delete')}</Button></div></li>)}</ul>
  </>}
  {job&&<div role="status" className="local-models-runtime"><strong>{job.model}</strong><p>{t('local.job.'+job.phase)}</p>
   <LocalPullProgress job={job}/>
   {job.cancelOutcome&&<p>{t('local.cancel.'+job.cancelOutcome)}</p>}
   {job.error&&<p>{t('local.resilience.error.'+localPullFailure(job.error))}</p>}{!active&&['interrupted','failed','reconciling'].includes(job.phase)&&<><p>{t('local.recovery.resumeBoundary')}</p><Button type="button" disabled={locked} onClick={()=>propose(job.model)}>{t('local.recovery.resume')}</Button></>}
   {active&&<Button type="button" disabled={job.phase==='cancel-requested'} onClick={()=>void manager.cancel()}>{t('local.action.cancel')}</Button>}
  </div>}
  <Dialog open={!!confirm} onOpenChange={open=>{if(!open)setConfirm(null);}}><DialogContent className="local-model-confirm"><DialogTitle>{t(confirm?.kind==='delete'?'local.action.confirmDelete':'local.action.confirmPull')}</DialogTitle><DialogDescription>{confirm?.model}</DialogDescription>
   {confirm?.kind==='pull'?<><p>{t('local.action.source')} ollama.com/library/{confirm.model.split(':')[0]}</p><p>{t('local.action.downloadNotice')}</p><p>{t('local.disk.notice')}</p><Button disabled={diskBusy||locked} onClick={()=>void inspectDisk()}>{t('local.disk.choose')}</Button><StudioStatus>{t('local.disk.'+diskAdvice.state)}{disk&&` · ${disk.freeBytes} bytes`}{diskAdvice.requiredBytes&&` / ${diskAdvice.requiredBytes} bytes`}</StudioStatus></>:<p>{t('local.action.deleteNotice')}</p>}
   <Checkbox label={t('local.action.ack')} checked={ack} onChange={e=>setAck(e.target.checked)}/>
   <div className="local-models-badges"><Button type="button" onClick={()=>setConfirm(null)}>{t('local.action.cancel')}</Button><Button type="button" disabled={!ack||locked||diskBusy||confirm?.kind==='pull'&&(!disk||diskAdvice.state==='insufficient'||diskAdvice.state==='stale')} onClick={()=>{const action=confirm!;setConfirm(null);void act(()=>action.kind==='pull'?manager.pull(action.model,disk??undefined):manager.remove(action.model,action.entry!.digest!));}}>{t('local.action.confirm')}</Button></div>
  </DialogContent></Dialog>
 </div>;
}
