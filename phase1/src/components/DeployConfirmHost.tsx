import {useEffect,useState,useSyncExternalStore} from 'react';
import {AlertTriangle,ShieldQuestion,UploadCloud,Undo2} from 'lucide-react';
import {ConfirmShell} from './ConfirmShell';
import {Button} from './ui/button';
import {useT} from '../lib/useT';
import {captureGesture,registerDeployConfirmPresenter} from '../lib/deploy/confirmation';
import {answerDeployDialog,dialogPresenter,getDeployDialogSnapshot,subscribeDeployDialog,summarizePlan,type DeployDialogRequest} from '../lib/deploy/confirmStore';
import type {DeployPlanFile} from '../lib/deploy/contract';

const MAX_ROWS=500;
const mono={fontFamily:'var(--font-mono,ui-monospace,monospace)',wordBreak:'break-all'} as const;

function Field({label,children}:{label:string;children:React.ReactNode}){
 return <div className="flex items-baseline gap-3 py-1 text-[13px]"><span className="w-28 shrink-0 text-muted">{label}</span><span className="min-w-0 grow">{children}</span></div>;
}
function FileRow({f,t}:{f:DeployPlanFile;t:(k:string)=>string}){
 return <li className="flex items-center gap-2 py-0.5 text-[12px]" data-change={f.change}><span className="w-16 shrink-0 text-muted">{t('deploy.change.'+f.change)}</span><span className="min-w-0 grow truncate" style={mono} title={f.path}>{f.path}</span><span className="shrink-0 text-muted">{f.size} B</span></li>;
}

/** Confirmation dialogs for publish, rollback and host-key trust. Registers itself as the presenter the deploy commands use. */
export function DeployConfirmHost(){
 useEffect(()=>registerDeployConfirmPresenter(dialogPresenter),[]);
 const req=useSyncExternalStore(subscribeDeployDialog,getDeployDialogSnapshot);
 if(!req)return null;
 return <Body key={req.kind+(req.kind==='plan'?req.plan.planHash:req.info.fingerprint)} req={req}/>;
}

function Body({req}:{req:DeployDialogRequest}){
 const {t}=useT();
 const [ack,setAck]=useState(false);
 const cancel=()=>answerDeployDialog(null);
 const cancelBtn=<Button className="dlg-cancel" autoFocus onClick={cancel}>{t('deploy.cancel')}</Button>;
 if(req.kind==='plan'){
  const {plan,target}=req;const n=summarizePlan(plan);const rollback=plan.action==='rollback';
  const url=target.domain?`https://${target.domain}`:`${target.host}`;
  return <ConfirmShell open onCancel={cancel} tone="accent" Icon={rollback?Undo2:UploadCloud} ariaLabel={t(rollback?'deploy.rollback.title':'deploy.publish.title',{name:target.name})} title={t(rollback?'deploy.rollback.title':'deploy.publish.title',{name:target.name})} description={t(rollback?'deploy.rollback.desc':'deploy.publish.desc')}
   body={<div data-testid="deploy-confirm">
    <Field label={t('deploy.field.server')}><span style={mono}>{target.user}@{target.host}:{target.port}</span></Field>
    <Field label={t('deploy.field.address')}><span style={mono}>{url}</span></Field>
    <Field label={t('deploy.field.fingerprint')}><span style={mono} data-testid="deploy-fingerprint">{plan.fingerprint}</span></Field>
    {rollback?<Field label={t('deploy.field.release')}><span style={mono}>{plan.releaseId}</span></Field>
     :<Field label={t('deploy.field.changes')}>{t('deploy.summary',{added:n.added,changed:n.changed,removed:n.removed})}</Field>}
    {plan.files.length>0&&<ul className="mt-2 max-h-[220px] overflow-auto rounded-[var(--r-control)] border border-subtle px-3 py-2" aria-label={t('deploy.field.files')}>{plan.files.slice(0,MAX_ROWS).map(f=><FileRow key={f.path} f={f} t={t}/>)}{plan.files.length>MAX_ROWS&&<li className="py-1 text-[12px] text-muted">{t('deploy.more',{count:plan.files.length-MAX_ROWS})}</li>}</ul>}
    {rollback&&<p className="mt-2 text-[12px] text-muted">{t('deploy.rollback.note')}</p>}
   </div>}
   footer={<>{cancelBtn}<span className="dlg-spacer"/><Button variant="primary" onClick={e=>answerDeployDialog({gesture:captureGesture(e.nativeEvent)})}>{t(rollback?'deploy.rollback.confirm':'deploy.publish.confirm')}</Button></>}/>;
 }
 if(req.kind==='hostkey'){
  const {target,info}=req;
  return <ConfirmShell open onCancel={cancel} tone="accent" Icon={ShieldQuestion} ariaLabel={t('deploy.hostkey.title')} title={t('deploy.hostkey.title')} description={t('deploy.hostkey.desc')}
   body={<div data-testid="deploy-hostkey">
    <Field label={t('deploy.field.server')}><span style={mono}>{target.host}:{target.port}</span></Field>
    <Field label={t('deploy.field.fingerprint')}><span style={mono} data-testid="deploy-fingerprint">{info.fingerprint}</span></Field>
    <Field label={t('deploy.field.algorithm')}><span style={mono}>{info.algorithm}</span></Field>
    <p className="mt-2 text-[12px] text-muted">{t('deploy.hostkey.compare')}</p>
    <p className="mt-1 text-[12px]" style={mono}>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</p>
   </div>}
   footer={<>{cancelBtn}<span className="dlg-spacer"/><Button variant="primary" onClick={e=>answerDeployDialog({gesture:captureGesture(e.nativeEvent)})}>{t('deploy.hostkey.trust')}</Button></>}/>;
 }
 const {target,oldFingerprint,info}=req;
 return <ConfirmShell open onCancel={cancel} tone="warning" alert Icon={AlertTriangle} ariaLabel={t('deploy.changed.title')} title={t('deploy.changed.title')} description={t('deploy.changed.desc')}
  body={<div data-testid="deploy-hostkey-changed">
   <Field label={t('deploy.field.server')}><span style={mono}>{target.host}:{target.port}</span></Field>
   <Field label={t('deploy.field.oldKey')}><span style={mono}>{oldFingerprint}</span></Field>
   <Field label={t('deploy.field.newKey')}><span style={mono} data-testid="deploy-fingerprint">{info.fingerprint}</span></Field>
   <label className="mt-3 flex items-start gap-2 text-[13px]"><input type="checkbox" style={{width:16,height:16,flex:"0 0 16px",marginTop:2}} checked={ack} onChange={e=>setAck(e.target.checked)}/><span>{t('deploy.changed.ack')}</span></label>
  </div>}
  footer={<>{cancelBtn}<span className="dlg-spacer"/><Button className="dlg-danger" disabled={!ack} onClick={e=>answerDeployDialog({gesture:captureGesture(e.nativeEvent),acknowledged:ack})}>{t('deploy.changed.replace')}</Button></>}/>;
}
