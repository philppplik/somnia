import {useState,useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {AgentReview} from '../AgentReview';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import type {AgentBoardPort,BoardRequest,BoardTask,ReviewMaterial} from '../../lib/agentBoard/contracts';
import {assertRequest,bindingFor,columnFor,requestFor,reviewIsCurrent,sameContent,verificationIsCurrent} from '../../lib/agentBoard/model';
import {exportPreview} from '../../lib/agentBoard/export';
export interface AgentBoardProps {port:AgentBoardPort;onCombine?:(request:BoardRequest,branch:string)=>Promise<void>}
const columns=['queue','running','review','done','failed'] as const;
export function AgentBoard({port,onCombine}:AgentBoardProps){
 const {t,locale}=useT();
 const snapshot=useSyncExternalStore(port.subscribe,port.getSnapshot,port.getSnapshot);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [review,setReview]=useState<{request:BoardRequest;material:ReviewMaterial}|null>(null);
 const [exporting,setExport]=useState<{id:string;json:string}|null>(null);
 const run=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e instanceof Error&&e.message.startsWith('board.error.')?e.message:'board.error.action');}finally{setBusy(false);}};
 const guarded=(request:BoardRequest)=>{const task=assertRequest(port.getSnapshot(),request);const g=port.guards(task);if(g.unsavedBuffers.length||g.activeReviews.length)throw Error('board.error.guard');return task;};
 const openReview=(task:BoardTask)=>run(async()=>{
  const binding=bindingFor(task,port.getSnapshot());if(!binding)throw Error('board.error.stale');const request=requestFor(task,binding);guarded(request);
  const material=await port.loadReview(request);guarded(request);if(!sameContent(binding,material.binding))throw Error('board.error.stale');setReview({request,material});
 });
 const reviewTask=review?snapshot.tasks.find(task=>task.taskId===review.request.taskId):null;
 const current=reviewTask?bindingFor(reviewTask,snapshot):null;
 const reviewStale=!!review&&(!current||!sameContent(current,review.request.binding));
 return <section className="ab-board" aria-label={t('board.title')}>
  <header className="ab-header"><h2>{t('board.title')}</h2><p>{t('board.subtitle')}</p></header>
  {notice&&<p className="ab-alert" role="alert">{t(notice)}</p>}
  {!snapshot.tasks.length&&<p className="ab-empty">{t('board.empty')}</p>}
  <div className="ab-columns">{columns.map(column=><section className="ab-column" key={column} aria-label={t('board.'+column)}>
   <h3>{t('board.'+column)} <span>{snapshot.tasks.filter(task=>columnFor(task.status)===column).length}</span></h3>
   {snapshot.tasks.filter(task=>columnFor(task.status)===column).map(task=>{
    const binding=bindingFor(task,snapshot),fresh=reviewIsCurrent(task,binding),verified=verificationIsCurrent(task,binding),supported=task.producer.kind==='builtin'&&task.schemaVersion===1;
    const stale=!!task.review&&!fresh||!!task.verification&&!verified;
    const active=['queued','preparing','running','waiting-input'].includes(task.status);
    return <article className="ab-card" key={task.taskId} data-task={task.taskId} data-status={task.status}>
     <div className="ab-card-head"><strong title={task.title}>{task.title}</strong><span className="ab-status">{t('board.'+task.status)}</span></div>
     <p className="ab-classification">{t('board.'+(fresh&&task.headSha?'approved':task.checkpoint?'checkpoint':'proposal'))}</p>
     <dl><dt>{t('board.producer')}</dt><dd>{task.producer.name} · {task.producer.provider} / {task.producer.model}</dd>
      <dt>{t('board.base')}</dt><dd><code title={task.baseSha}>{task.baseSha.slice(0,10)}</code></dd>
      <dt>{t('board.result')}</dt><dd><code title={task.headSha}>{task.headSha?.slice(0,10)||'·'}</code></dd>
      {binding&&<><dt>{t('board.hash')}</dt><dd><code title={binding.contentHash}>{binding.contentHash.slice(0,12)}</code></dd></>}
      {task.cost?.tokens!==undefined&&<><dt>{t('board.tokens')}</dt><dd>{new Intl.NumberFormat(locale).format(task.cost.tokens)}</dd></>}
      {task.cost?.amount!==undefined&&<><dt>{t('board.cost')}</dt><dd>{new Intl.NumberFormat(locale,{maximumFractionDigits:4}).format(task.cost.amount)} {task.cost.currency}</dd></>}
     </dl>
     <p className="ab-evidence" data-valid={verified}>{t(verified?(task.verification?.outcome==='passed'?'board.verified':task.verification?.outcome==='failed'?'board.verificationFailed':'board.unverified'):'board.unverified')}</p>
     {task.autoCommit&&<p className="ab-meta">{t('board.autoLocal')}</p>}
     {stale&&<p className="ab-alert" role="status">{t('board.stale')}</p>}
     {!supported&&<p className="ab-alert">{t('board.unsupported')}</p>}
     <div className="ab-actions">
      {active&&<Button disabled={busy||!supported} onClick={()=>void run(()=>port.cancel(task.taskId))}>{t('board.cancel')}</Button>}
      {['failed','cancelled'].includes(task.status)&&<Button disabled={busy||!supported||!binding} onClick={()=>void run(async()=>{const r=requestFor(task,binding!);guarded(r);await port.retry(r);})}>{t('board.retry')}</Button>}
      {['review','done'].includes(task.status)&&<Button disabled={busy||!supported||!binding} onClick={()=>void openReview(task)}>{t('board.openReview')}</Button>}
      {onCombine&&['review','done'].includes(task.status)&&<Button disabled={busy||!supported||!fresh||!binding} onClick={()=>void run(async()=>{const r=requestFor(task,binding!);const live=guarded(r);if(!reviewIsCurrent(live,r.binding))throw Error('board.error.stale');await onCombine(r,task.branch);})}>{t('board.combine')}</Button>}
      <Button disabled={busy||!supported} onClick={()=>void run(async()=>{setExport({id:task.taskId,json:exportPreview(await port.prepareExport(task.taskId))});})}>{t('board.export')}</Button>
     </div>
    </article>;
   })}
  </section>)}</div>
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!busy)setReview(null);}}><DialogContent className="ab-review-popup" aria-label={t('board.reviewTitle')}><div className="ab-dialog-body"><DialogTitle>{t('board.reviewTitle')}</DialogTitle><DialogDescription>{t('board.reviewHint')}</DialogDescription>
   {reviewStale?<p role="alert" className="ab-alert">{t('board.error.stale')}</p>:review&&<AgentReview key={JSON.stringify(review.request.binding)} submitLabel={t('board.confirmReview')} completionHint={t('board.reviewNoWrite')} changeSet={review.material.changeSet} readCurrent={review.material.readCurrent} onApply={(plan,decisions)=>void run(async()=>{guarded(review.request);await port.review(review.request,plan,decisions);setReview(null);})} onDiscard={()=>setReview(null)}/>}
   <Button disabled={busy} onClick={()=>setReview(null)}>{t('board.close')}</Button>
  </div></DialogContent></Dialog>
  <Dialog open={!!exporting} onOpenChange={open=>{if(!open&&!busy)setExport(null);}}><DialogContent className="ab-export-popup" aria-label={t('board.exportTitle')}><div className="ab-dialog-body"><DialogTitle>{t('board.exportTitle')}</DialogTitle><DialogDescription>{t('board.exportHint')}</DialogDescription><pre data-copyable>{exporting?.json}</pre><div className="ab-actions"><Button disabled={busy} onClick={()=>setExport(null)}>{t('board.close')}</Button><Button variant="primary" disabled={busy} onClick={()=>void run(async()=>{if(exporting){await port.saveExport(exporting.id,exporting.json);setExport(null);}})}>{t('board.saveExport')}</Button></div></div></DialogContent></Dialog>
 </section>;
}
