import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import {PublicationController} from '../../lib/git/publication/controller';
import type {PublicationBackend, PublicationTarget} from '../../lib/git/publication/types';
import {Button} from '../ui/button';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '../ui/dialog';

/** The transport picker may supply a target; manually typed targets still require native validation. */
export function PublicationReview({backend, unsavedFiles, advanced, target: supplied}: {backend: PublicationBackend; unsavedFiles: number; advanced: boolean; target?: PublicationTarget}) {
 const {t} = useT();
 const controller = useMemo(() => new PublicationController(backend), [backend]);
 const s = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
 const [target, setTarget] = useState<PublicationTarget>(supplied ?? {remote: 'origin', sourceBranch: '', targetBranch: '', accountId: '', authRoute: 'github-https'});
 const [open, setOpen] = useState(false);
 useEffect(() => {controller.setUnsaved(unsavedFiles);}, [controller, unsavedFiles]);
 const suppliedKey = JSON.stringify(supplied); const previousTarget = useRef(suppliedKey);
 useEffect(() => {if(supplied && previousTarget.current !== suppliedKey) {setTarget(supplied); controller.invalidate();} previousTarget.current = suppliedKey;}, [suppliedKey, supplied, controller]);
 const plan = s.plan;
 const field = (key: 'remote' | 'sourceBranch' | 'targetBranch' | 'accountId', label: string) => <label className="flex flex-col gap-1 text-ink-2">{t(label)}<input className="h-8 min-w-0 rounded-sm border border-subtle bg-transparent px-2 text-ink" value={target[key]} disabled={s.busy} onChange={e => {setTarget({...target, [key]: e.target.value}); controller.invalidate();}} data-testid={`publication-${key}`}/></label>;
 const review = async (refetch: boolean) => {await controller.review(target, refetch); setOpen(true);};
 const refetchRequired = s.outcome?.kind === 'stale-plan' || s.outcome?.kind === 'uncertain-reconcile';
 const canReview = !!target.remote && !!target.accountId && !!target.sourceBranch && !!target.targetBranch && !s.busy;
 return <section className="flex flex-col gap-3 p-3 text-xs" data-testid="publication-panel">
  <h3 className="text-xs font-semibold text-ink">{t('publication.title')}</h3>
  <p className="text-ink-2">{t('publication.hint')}</p>
  {field('accountId', 'publication.account')}
  <label className="flex flex-col gap-1 text-ink-2">{t('publication.authRoute')}<select className="h-8 rounded-sm border border-subtle bg-panel px-2 text-ink" value={target.authRoute} disabled={s.busy} onChange={e => {setTarget({...target, authRoute: e.target.value as PublicationTarget['authRoute']}); controller.invalidate();}}><option value="github-https">GitHub HTTPS</option><option value="ssh">SSH</option><option value="gcm">Git Credential Manager</option></select></label>
  {field('remote', 'publication.remote')}{field('sourceBranch', 'publication.source')}{field('targetBranch', 'publication.target')}
  {s.outcome && <p role="status" className="rounded-sm border border-subtle p-2 text-ink" data-testid="publication-outcome">{t(`publication.outcome.${s.outcome.kind}`)}</p>}
  {s.error && <p role="alert" className="text-ink">{t('publication.error')}</p>}
  <Button variant="primary" disabled={!canReview} onClick={() => void review(!!refetchRequired)}>{s.busy ? t('publication.loading') : t(refetchRequired ? 'publication.refetch' : 'publication.review')}</Button>
  <Dialog open={open && !!plan} onOpenChange={v => {if(!s.busy) {setOpen(v); if(!v) controller.confirm(false);}}}>
   <DialogContent className="publication-dialog" style={{width:'min(680px, calc(100vw - 32px))',maxHeight:'calc(100vh - 40px)',overflow:'auto',padding:24,top:'50%',transform:'translate(-50%, -50%)'}}>
    <DialogTitle className="text-base font-semibold text-ink">{t('publication.title')}</DialogTitle>
    <DialogDescription className="mt-2 text-xs text-ink-2">{t('publication.hint')}</DialogDescription>
    {plan && <div className="mt-4 flex flex-col gap-3 text-xs text-ink">
     <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-sm border border-subtle p-3">
      <dt className="text-ink-3">{t('publication.account')}</dt><dd className="break-all">{plan.account.login} ({plan.authRoute})</dd>
      <dt className="text-ink-3">{t('publication.repository')}</dt><dd className="break-all">{plan.repository.name} · {t(`publication.visibility.${plan.repository.visibility}`)}</dd>
      <dt className="text-ink-3">{t('publication.destination')}</dt><dd className="break-all font-mono text-[11px]">{plan.effectiveRemoteUrl}</dd>
      <dt className="text-ink-3">{t('publication.branches')}</dt><dd className="break-all">{plan.sourceBranch} → {plan.targetBranch}</dd>
     </dl>
     <div><h4 className="font-medium">{t('publication.commits', {count: plan.commits.length})}</h4><ul className="mt-1 max-h-32 overflow-auto rounded-sm border border-subtle p-2">{plan.commits.map(c => <li className="break-words py-1" key={c.sha}>{c.subject}{advanced && <code className="ml-2 text-ink-3">{c.sha}</code>}</li>)}</ul></div>
     <div className="grid grid-cols-2 gap-3">{(['untracked', 'excluded'] as const).map(k => <div className="min-w-0 rounded-sm border border-subtle p-2" key={k}><h4 className="font-medium">{t(`publication.${k}`)}</h4><ul className="mt-1 max-h-24 overflow-auto text-ink-2">{plan[k].length ? plan[k].map(p => <li className="break-all" key={p}>{p}</li>) : <li>{t('publication.none')}</li>}</ul></div>)}</div>
     {(unsavedFiles > 0 || plan.unsavedBuffers > 0) && <p role="alert" className="rounded-sm border border-subtle p-2" data-testid="publication-unsaved">{t(plan.initiatedBy === 'agent' ? 'publication.unsavedBlock' : 'publication.unsavedWarn', {count: Math.max(unsavedFiles, plan.unsavedBuffers)})}</p>}
     {plan.initiatedBy === 'agent' && <p role="note">{plan.grant ? t('publication.grant', {grant: plan.grant.label}) : t('publication.noGrant')}</p>}
     {advanced && <details data-testid="publication-metadata"><summary className="cursor-pointer text-ink-2">{t('versions.advanced')}</summary><dl className="mt-2 space-y-1 break-all font-mono text-[10px]"><dt>HEAD</dt><dd>{plan.head}</dd><dt>tree/content hash</dt><dd>{plan.contentHash}</dd><dt>remote tip</dt><dd>{plan.remoteTip ?? t('publication.none')}</dd><dt>plan ID</dt><dd>{plan.planId}</dd></dl></details>}
     <p className="text-ink-3">{t('publication.recovery')}</p>
     <label className="flex items-start gap-2 rounded-sm border border-subtle p-3"><input type="checkbox" style={{width:16,height:16,flex:'0 0 16px'}} className="mt-0.5" checked={s.confirmed} disabled={s.busy} onChange={e => controller.confirm(e.target.checked)} data-testid="publication-confirm"/><span className="min-w-0 flex-1">{t('publication.confirm')}</span></label>
     <div className="flex justify-end gap-2"><Button disabled={s.busy} onClick={() => {setOpen(false); controller.confirm(false);}}>{t('dialogs.cancel')}</Button><Button variant="primary" disabled={!controller.canApply() || plan.initiatedBy === 'agent' && unsavedFiles > 0} onClick={() => void controller.publish()} data-testid="publication-publish">{t(s.busy ? 'publication.loading' : 'publication.publish')}</Button></div>
    </div>}
   </DialogContent>
  </Dialog>
 </section>;
}
