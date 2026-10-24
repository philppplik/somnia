import {Field} from '../ui/field';import {NativeInput} from '../ui/native-controls';import {EmbeddingModelReview} from './EmbeddingModelReview';
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
export function LocalModelActions({snapshot,onChanged,manager=localModelManager,chooseDisk=chooseModelDisk,embeddingOnly=false}:{snapshot:RuntimeSnapshot|null;onChanged:()=>Promise<void>;manager?:LocalModelManager;chooseDisk?:()=>Promise<ModelDisk|null>;embeddingOnly?:boolean}){
 const {t,locale}=useT();const job=useSyncExternalStore(manager.subscribe,manager.snapshot,manager.snapshot);
 useSyncExternalStore(subscribeAgentSettings,agentSettingsSnapshot,agentSettingsSnapshot);
 const [errorKind,setErrorKind]=useState<'pull'|'delete'|'launch'>('pull');const [filter,setFilter]=useState(''),[page,setPage]=useState(0);const [name,setName]=useState(''),[error,setError]=useState(''),[instruction,setInstruction]=useState(''),[busy,setBusy]=useState(false);
 const [confirm,setConfirm]=useState<{kind:'pull'|'delete';model:string;entry?:InstalledModel}|null>(null);
 const [ack,setAck]=useState(false);const [disk,setDisk]=useState<ModelDisk|null>(null);const [diskBusy,setDiskBusy]=useState(false);
 const diskAdvice=modelDiskAdvice(confirm?.model??'',disk);
 const inspectDisk=async()=>{setDiskBusy(true);setError('');try{setDisk(await chooseDisk());}catch{setError(t('local.disk.failed'));}finally{setDiskBusy(false);}};
 const active=!!job&&['preparing','downloading','verifying','installing','reconciling','cancel-requested'].includes(job.phase)&&!job.error;
 const locked=busy||manager.isBusy()||active||!manager.canMutate();
 const act=async(action:()=>Promise<unknown>,kind:'pull'|'delete'|'launch'='pull')=>{setErrorKind(kind);setBusy(true);setError('');try{await action();await onChanged();}catch{setError(t('local.action.failed'));}finally{setBusy(false);}};
 const propose=(raw:string)=>{try{const model=registryModel(raw);if(embeddingOnly&&model!=='embeddinggemma:300m')throw Error('Exact search model only');setAck(false);setDisk(null);setConfirm({kind:'pull',model});setError('');}catch{setError(t('local.action.invalid'));}};
 const matches=(snapshot?.models??[]).filter(model=>model.id.toLowerCase().includes(filter.trim().toLowerCase()));const lastPage=Math.max(0,Math.ceil(matches.length/20)-1),currentPage=Math.min(page,lastPage);const size=(n:number|undefined)=>n===undefined?t('local.unknown'):new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n/1e9)+' GB';
 return <div className="local-model-actions">
  {error&&<StudioStatus tone="error" live="assertive">{t(errorKind==='delete'?'local.deleteReview.failed':errorKind==='pull'?'local.search.recovery.download': 'local.action.failed')}</StudioStatus>}
  {snapshot?.state==='stopped'&&<Button disabled={locked} type="button" onClick={()=>void act(async()=>{const result=await manager.launch();setInstruction(result.instruction??'');},'launch')}>{t('local.action.start')}</Button>}
  {instruction&&<p>{t('local.action.manual')} <code>{instruction}</code></p>}
  {snapshot?.state==='running'&&<>
   <EmbeddingModelReview disabled={locked} onReview={()=>propose('embeddinggemma:300m')}/>{!embeddingOnly&&<><LocalRecommendedPicker disabled={locked} onDownload={propose}/>
   <label>{t('local.action.name')}<Input value={name} disabled={locked} onChange={e=>setName(e.target.value)} placeholder="qwen3:4b"/></label>
   <Button type="button" variant="outline" disabled={locked||!name.trim()} onClick={()=>propose(name)}>{t('local.action.pull')}</Button>
   <Field label={t('local.deleteReview.filter')}>{control=><NativeInput {...control} type="search" value={filter} maxLength={100} disabled={locked} onChange={e=>{setFilter(e.target.value);setPage(0);}}/>}</Field><p>{t('local.deleteReview.count',{count:String(matches.length),total:String(snapshot.models.length)})}</p><ul className="local-models-list">{matches.slice(currentPage*20,currentPage*20+20).map(model=><li key={model.id}><span>{model.id}</span><p>{size(model.sizeBytes)} · {t('local.deleteReview.digest')}: <code className="break-all">{model.digest??t('local.unknown')}</code></p><div className="local-models-badges"><Button type="button" size="compact" disabled={locked} onClick={()=>propose(model.id)} aria-label={t('local.action.updateModel',{model:model.id})}>{t('local.action.update')}</Button><Button type="button" size="compact" disabled={locked||!model.digest} onClick={()=>{setAck(false);setConfirm({kind:'delete',model:model.id,entry:{...model}});}} aria-label={t('local.action.deleteModel',{model:model.id})}>{t('local.action.delete')}</Button></div></li>)}</ul>{matches.length>20&&<div className="local-models-badges"><Button type="button" disabled={locked||currentPage===0} onClick={()=>setPage(currentPage-1)}>{t('local.previous')}</Button><p>{currentPage+1}/{lastPage+1}</p><Button type="button" disabled={locked||currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>{t('local.next')}</Button></div>}</>}
  </>}
  {job&&(!embeddingOnly||job.model==='embeddinggemma:300m')&&<div role="status" className="local-models-runtime"><strong>{job.model}</strong><p>{t('local.job.'+job.phase)}</p>
   <LocalPullProgress job={job}/>
   {job.cancelOutcome&&<p>{t('local.cancel.'+job.cancelOutcome)}</p>}
   {job.error&&<p>{t('local.resilience.error.'+localPullFailure(job.error))}</p>}{!active&&['interrupted','failed','reconciling'].includes(job.phase)&&<><p>{t('local.recovery.resumeBoundary')}</p><Button type="button" disabled={locked} onClick={()=>propose(job.model)}>{t('local.recovery.resume')}</Button></>}
   {active&&<Button type="button" disabled={job.phase==='cancel-requested'} onClick={()=>void manager.cancel()}>{t('local.action.cancel')}</Button>}
  </div>}
  <Dialog open={!!confirm} onOpenChange={open=>{if(!open)setConfirm(null);}}><DialogContent className="local-model-confirm"><DialogTitle>{t(confirm?.kind==='delete'?'local.action.confirmDelete':'local.action.confirmPull')}</DialogTitle><DialogDescription>{confirm?.model}</DialogDescription>
   {confirm?.kind==='pull'?<>{confirm.model==='embeddinggemma:300m'&&<EmbeddingModelReview/>}<p>{t('local.action.source')} ollama.com/library/{confirm.model.split(':')[0]}</p><p>{t('local.action.downloadNotice')}</p><p>{t('local.disk.notice')}</p><Button disabled={diskBusy||locked} onClick={()=>void inspectDisk()}>{t('local.disk.choose')}</Button><StudioStatus>{t('local.disk.'+diskAdvice.state)}{disk&&` · ${disk.freeBytes} bytes`}{diskAdvice.requiredBytes&&` / ${diskAdvice.requiredBytes} bytes`}</StudioStatus></>:<><p>{t('local.action.deleteNotice')}</p><p>{t('local.deleteReview.boundary')}</p><p>{size(confirm?.entry?.sizeBytes)} · {t('local.deleteReview.digest')}: <code className="break-all">{confirm?.entry?.digest??t('local.unknown')}</code></p></>}
   <Checkbox label={t('local.action.ack')} checked={ack} onChange={e=>setAck(e.target.checked)}/>
   <div className="local-models-badges"><Button type="button" onClick={()=>setConfirm(null)}>{t('local.action.cancel')}</Button><Button type="button" disabled={!ack||locked||diskBusy||confirm?.kind==='pull'&&(!disk||diskAdvice.state==='insufficient'||diskAdvice.state==='stale')} onClick={()=>{const action=confirm!;setConfirm(null);void act(()=>action.kind==='pull'?manager.pull(action.model,disk??undefined):manager.remove(action.model,action.entry!.digest!),action.kind);}}>{t('local.action.confirm')}</Button></div>
  </DialogContent></Dialog>
 </div>;
}
