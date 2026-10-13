import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Check,Loader2,Plus,Server,Undo2} from 'lucide-react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {Input} from '../ui/input';
import {useAppStore} from '../../store/appStore';
import {publishAvailable} from '../../lib/deploy/publishController';
import {usePublish} from '../PublishDialog';
import {detectFramework,frameworkLabel} from '../../lib/frameworks/detect';
import {mayCancel} from '../../lib/deploy/setup';
import {formatBytes,liveUrl,releaseDate,shortFingerprint} from '../../lib/deploy/publishModel';
import {canPublish,checkDomain,dryRunView,frameworkAdvice,liveLog,targetRows} from '../../lib/deployPanels/model';
import {commandDispatcher} from '../../lib/commandDispatcher';
const runCommand=(id:string,params:unknown,opts:{origin:'ui'})=>commandDispatcher.runCommand(id,params,opts);
import type {PanelHostProps,InspectorSectionProps} from '../../lib/shell/types';

const mono={fontFamily:'var(--mono,ui-monospace,monospace)',wordBreak:'break-all'} as const;
const note='m-0 text-xs text-ink-3';
const ui=(id:string,params?:unknown)=>void runCommand(id,params,{origin:'ui'});

function Unavailable(){const {t}=useT();return <p className={`${note} p-3`} data-testid="deploy-unavailable">{t('deploy.shell.desktopOnly')}</p>;}
function useLoaded(){const p=usePublish();useEffect(()=>{if(!p.state.loaded)void p.store.refresh();},[p.state.loaded,p.store]);return p;}

/** Left panel: servers, status chip, Publish and Dry run for the selected one. Every publish still opens the confirmation dialog. */
export function DeployTargetsPanel(_props:PanelHostProps){
 if(!publishAvailable())return <Unavailable/>;
 return <TargetsInner/>;
}
function TargetsInner(){
 const {t}=useT(),{state,store}=useLoaded();
 const rows=targetRows(state),selected=state.targets.find(s=>s.target.id===state.selectedId)??null;
 const plan=state.staged&&selected&&state.staged.targetId===selected.target.id?state.staged:null;
 const busy=state.busy!==null,running=state.busy==='publish'||state.busy==='rollback';
 const stateKey={ready:'deploy.state.ready','needs-trust':'deploy.state.needsTrust','key-missing':'deploy.state.needsKey'} as const;
 if(!state.loaded)return <p className={`${note} flex items-center gap-2 p-3`} role="status"><Loader2 size={14} className="publish-spin"/>{t('deploy.loading')}</p>;
 return <section className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs" aria-label={t('deploy.shell.publish')} data-testid="deploy-targets">
  {rows.length===0?<div className="flex flex-col items-start gap-2" data-testid="deploy-empty"><Server size={22} aria-hidden="true"/><p className="m-0">{t('deploy.targets.empty')}</p></div>
  :<ul className="m-0 flex list-none flex-col gap-1.5 p-0" role="listbox" aria-label={t('deploy.targets.title')}>
   {rows.map(r=><li key={r.id}><button type="button" role="option" aria-selected={r.selected} className="publish-target" data-state={r.state} disabled={running} onClick={()=>ui('deploy.target.select',{targetId:r.id})}>
    <Server size={14} aria-hidden="true"/><span className="publish-target-name"><strong>{r.name}</strong><small style={mono}>{r.address}</small></span>
    <span className="publish-chip" data-state={r.state}>{t(stateKey[r.state])}</span></button></li>)}
  </ul>}
  <div className="flex flex-wrap gap-2">
   <Button size="compact" variant="outline" disabled={busy} onClick={()=>void store.open({view:'form'})} data-testid="deploy-add"><Plus size={12}/>{t('deploy.targets.add')}</Button>
   {rows.length>0&&<Button size="compact" variant="ghost" disabled={busy} onClick={()=>void store.open()}>{t('deploy.shell.manage')}</Button>}
  </div>
  {selected&&<div className="flex flex-col gap-2 rounded-md border border-subtle p-2" data-testid="deploy-selected" data-state={selected.state}>
   <div className="flex items-baseline justify-between gap-2"><strong>{selected.target.name}</strong><span style={mono} className="text-ink-3">{liveUrl(selected.target)??t('deploy.noDomain')}</span></div>
   {selected.fingerprint&&<span className={note} style={mono} title={selected.fingerprint}>{t('deploy.pinned')}: {shortFingerprint(selected.fingerprint)}</span>}
   {selected.state!=='ready'&&<Button size="compact" variant="primary" disabled={busy} data-testid="deploy-finish-setup" onClick={()=>store.open({view:'setup',targetId:selected.target.id})}>{t('deploy.shell.finishSetup')}</Button>}
   {selected.state==='ready'&&<div className="flex flex-wrap gap-2">
    <Button size="compact" variant="primary" disabled={!canPublish(selected,state.busy)} data-testid="deploy-publish" onClick={()=>void store.publish(selected.target.id)}>{running?<Loader2 size={12} className="publish-spin"/>:null}{t(running?'deploy.button.running':'deploy.button')}</Button>
    <Button size="compact" variant="outline" disabled={busy} data-testid="deploy-dryrun" onClick={()=>ui('deploy.dryrun',{targetId:selected.target.id})}>{state.busy==='plan'?<Loader2 size={12} className="publish-spin"/>:null}{t('deploy.shell.dryrunButton')}</Button>
   </div>}
   {selected.state==='ready'&&<p className={note}>{t('deploy.shell.dryrunHint')}</p>}
   {plan&&<p className="m-0" data-testid="deploy-panel-counts">{t('deploy.shell.counts',dryRunView(plan).counts)}</p>}
  </div>}
  {state.failure&&<p className="m-0 flex items-start gap-2 text-xs text-[var(--danger,#c0392b)]" role="alert" data-testid="deploy-failure" data-code={state.failure.code}><AlertTriangle size={14} aria-hidden="true"/><span>{t(state.failure.messageKey)}</span></p>}
 </section>;
}

/** Left panel: live log of the running publish, the last result and the earlier versions for rollback. */
export function DeployLogPanel(_props:PanelHostProps){
 if(!publishAvailable())return <Unavailable/>;
 return <LogInner/>;
}
function LogInner(){
 const {t,locale}=useT(),{state,store}=useLoaded();
 const lines=liveLog(state),selected=state.targets.find(s=>s.target.id===state.selectedId)??null;
 const result=state.result,live=selected?state.liveByTarget[selected.target.id]:undefined;
 const running=state.busy==='publish'||state.busy==='rollback'||state.busy==='plan';
 const fmt=useMemo(()=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}),[locale]);
 return <section className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs" aria-label={t('deploy.shell.log')} data-testid="deploy-log">
  {lines.length>0?<ol className="m-0 flex list-none flex-col gap-1 p-0" role="status" aria-live="polite" data-testid="deploy-log-lines">
   {lines.map((l,i)=><li key={i} className="flex items-center gap-2" data-status={l.status}>{l.status==='done'?<Check size={12} aria-hidden="true"/>:<Loader2 size={12} className="publish-spin" aria-hidden="true"/>}<span>{t(l.key,l.params)}</span></li>)}
  </ol>:!result&&<p className={note}>{t('deploy.shell.logEmpty')}</p>}
  {state.busy==='publish'&&selected&&state.progress.seen.length>0&&mayCancel(state.progress.seen)&&<Button size="compact" variant="outline" disabled={state.cancelRequested} onClick={()=>void store.cancelPublish(selected.target.id)}>{t('deploy.cancel')}</Button>}
  {result&&!running&&<div className="flex flex-col gap-1 rounded-md border border-subtle p-2" data-testid="deploy-result">
   <strong>{result.kind==='rollback'?t('deploy.result.rollback',{release:result.outcome.releaseId}):result.outcome.url?t('deploy.result.publish',{url:result.outcome.url}):t('deploy.result.publishNoDomain',{release:result.outcome.releaseId})}</strong>
   {result.outcome.rolledBack&&<span className={note}>{t('deploy.result.autoBack')}</span>}
   {result.outcome.url&&<div><Button size="compact" variant="outline" onClick={()=>void store.openSite(result.targetId)}>{t('deploy.result.open')}</Button></div>}
  </div>}
  {selected&&selected.state==='ready'&&<div className="flex flex-col gap-2" data-testid="deploy-versions">
   <div className="flex items-center justify-between gap-2"><strong>{t('deploy.shell.versions')}</strong>
    <Button size="compact" variant="ghost" disabled={state.busy!==null} onClick={()=>void store.showRollback(selected.target.id).then(()=>store.showHome())} data-testid="deploy-load-versions">{t('deploy.shell.versionsLoad')}</Button></div>
   {state.releasesFor===selected.target.id&&(state.releases.length===0?<p className={note}>{t('deploy.rollbackView.none')}</p>
    :<ul className="m-0 flex list-none flex-col gap-1 p-0">{state.releases.map(r=>{const d=releaseDate(r),isLive=r===live;return <li key={r} className="flex items-center justify-between gap-2"><span style={mono}>{d?fmt.format(d):r}{isLive&&<span className="publish-chip ml-2" data-state="ready">{t('deploy.rollbackView.live')}</span>}</span>
     {!isLive&&<Button size="compact" variant="ghost" disabled={state.busy!==null} onClick={()=>void store.rollback(selected.target.id,r)}><Undo2 size={12}/>{t('deploy.rollbackView.goBack')}</Button>}</li>;})}</ul>)}
  </div>}
 </section>;
}

function useSelected(){const {state,store}=usePublish();return {state,store,selected:state.targets.find(s=>s.target.id===state.selectedId)??null};}

/** Inspector section: address and domain of the selected target. Saving goes through deploy.target.setDomain. */
export function DeployTargetSection(_props:InspectorSectionProps){
 if(!publishAvailable())return <Unavailable/>;
 return <TargetSectionInner/>;
}
function TargetSectionInner(){
 const {t}=useT(),{selected,state}=useSelected();useLoaded();
 const [value,setValue]=useState(''),[msg,setMsg]=useState<'invalid'|'saved'|null>(null);
 useEffect(()=>{setValue(selected?.target.domain??'');setMsg(null);},[selected?.target.id,selected?.target.domain]);
 if(!selected)return <p className={`${note} p-3`}>{t('deploy.shell.noTarget')}</p>;
 const check=checkDomain(value),dirty=value.trim().toLowerCase()!==(selected.target.domain??'');
 const save=async()=>{if(!check.ok){setMsg('invalid');return;}const r=await runCommand('deploy.target.setDomain',{targetId:selected.target.id,domain:check.value},{origin:'ui'}) as {saved?:boolean}|undefined;setMsg(r?.saved?'saved':null);};
 return <form className="flex flex-col gap-2 p-3 text-xs" data-testid="deploy-section-target" onSubmit={e=>{e.preventDefault();void save();}}>
  <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"><dt className="text-ink-3">{t('deploy.field.server')}</dt><dd className="m-0" style={mono}>{selected.target.user}@{selected.target.host}:{selected.target.port}</dd>
   <dt className="text-ink-3">{t('deploy.field.address')}</dt><dd className="m-0" style={mono}>{liveUrl(selected.target)??t('deploy.noDomain')}</dd></dl>
  <label className="flex flex-col gap-1">{t('deploy.shell.domain')}<Input value={value} placeholder={t('deploy.shell.domainPlaceholder')} aria-invalid={msg==='invalid'} autoCapitalize="off" spellCheck={false} onChange={e=>{setValue(e.target.value);setMsg(null);}}/></label>
  {msg==='invalid'&&<p className="m-0 text-[var(--danger,#c0392b)]" role="alert">{t('deploy.shell.domainInvalid')}</p>}
  {msg==='saved'&&<p className={note} role="status">{t('deploy.shell.domainSaved')}</p>}
  <div><Button type="submit" size="compact" variant="outline" disabled={!dirty||state.busy!==null}>{t('deploy.shell.domainSave')}</Button></div>
 </form>;
}

/** Inspector section: what the detected framework builds and whether the selected target fits it. */
export function DeployFrameworkSection(_props:InspectorSectionProps){
 const {t}=useT(),files=useAppStore().files,{selected}=useSelected();
 const detected=useMemo(()=>detectFramework(files),[files]);
 const advice=frameworkAdvice(detected,selected?.target??null);
 const adviceKey={match:'deploy.shell.fw.match','needs-node':'deploy.shell.fw.needsNode','node-not-needed':'deploy.shell.fw.nodeNotNeeded','upload-only':'deploy.shell.fw.uploadOnly'} as const;
 return <section className="flex flex-col gap-2 p-3 text-xs" data-testid="deploy-section-framework" data-advice={advice}>
  <p className="m-0">{detected?t('deploy.shell.fw.detected',{name:frameworkLabel(detected.framework),kind:t(detected.output==='node'?'deploy.shell.fw.node':'deploy.shell.fw.static')}):t('deploy.shell.fw.none')}</p>
  {advice!=='none'&&<p className={advice==='needs-node'?'m-0 flex gap-2 text-[var(--danger,#c0392b)]':note} role={advice==='needs-node'?'alert':undefined}>{advice==='needs-node'&&<AlertTriangle size={14} aria-hidden="true"/>}<span>{t(adviceKey[advice])}</span></p>}
 </section>;
}

/** Inspector section: file diff of the last dry run for the selected target. */
export function DeployDryRunSection(_props:InspectorSectionProps){
 if(!publishAvailable())return <Unavailable/>;
 return <DryRunInner/>;
}
function DryRunInner(){
 const {t}=useT(),{state,selected}=useSelected();
 const plan=state.staged&&selected&&state.staged.targetId===selected.target.id?state.staged:null;
 const view=useMemo(()=>plan?dryRunView(plan):null,[plan]);
 if(!selected)return <p className={`${note} p-3`}>{t('deploy.shell.noTarget')}</p>;
 return <section className="flex flex-col gap-2 p-3 text-xs" data-testid="deploy-section-dryrun">
  <div><Button size="compact" variant="outline" disabled={state.busy!==null||selected.state!=='ready'} onClick={()=>ui('deploy.dryrun',{targetId:selected.target.id})}>{state.busy==='plan'?<Loader2 size={12} className="publish-spin"/>:null}{t('deploy.shell.dryrunButton')}</Button></div>
  {!view?<p className={note}>{t('deploy.shell.dryrunNone')}</p>:<>
   <p className="m-0" data-testid="deploy-dryrun-counts">{t('deploy.shell.counts',view.counts)}</p>
   {view.empty?<p className={note}>{t('deploy.shell.noChanges')}</p>:<>
    <p className={note}>{t('deploy.shell.upload',{size:formatBytes(view.uploadBytes)})}</p>
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0" data-testid="deploy-dryrun-files">{view.rows.map(r=><li key={r.path} className="flex items-baseline gap-2" data-change={r.change}><span className="w-14 shrink-0 text-ink-3">{t(`versions.kind.${r.change==='changed'?'modified':r.change==='removed'?'deleted':'added'}`)}</span><span style={mono}>{r.path}</span></li>)}</ul>
    {view.hidden>0&&<p className={note}>{t('deploy.shell.more',{count:view.hidden})}</p>}</>}
  </>}
 </section>;
}
