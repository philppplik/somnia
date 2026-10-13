import {DeploySetupWizard} from './DeploySetupWizard';
import {mayCancel} from '../lib/deploy/setup';
import {useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {AlertTriangle,ArrowLeft,Check,Copy,ExternalLink,KeyRound,Loader2,Pencil,Plus,Server,ShieldCheck,Trash2,Undo2,UploadCloud,X} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './ui/dialog';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {useT} from '../lib/useT';
import {configurePublish,getPublishStore,publishAvailable} from '../lib/deploy/publishController';
import {getState as getAppState} from '../store/appStore';
configurePublish({projectFiles:()=>getAppState().files});
import type {PublishState,PublishStore} from '../lib/deploy/publishStore';
import type {DeployTargetStatus} from '../lib/deploy/contract';
import {PROGRESS_STEPS,emptyTargetForm,formFromTarget,formatBytes,liveUrl,releaseDate,shortFingerprint,validateTargetForm,type TargetForm,type DeployErrorAction,type FormField} from '../lib/deploy/publishModel';
import {summarizePlan} from '../lib/deploy/confirmStore';

type T=(k:string,p?:Record<string,string|number>)=>string;
const mono={fontFamily:'var(--mono,ui-monospace,monospace)',wordBreak:'break-all'} as const;
const SAFE_KEY=/^[A-Za-z0-9@:+/=. _-]{20,2000}$/;

/** Hook for any component that needs the live Publish state. */
export function usePublish():{state:PublishState;store:PublishStore}{
 const store=getPublishStore();
 const state=useSyncExternalStore(store.subscribe,store.getState,store.getState);
 return {state,store};
}

/** Header button: opens the panel, shows a spinner while a publish runs. Desktop only. */
export function PublishButton(){
 const {t}=useT();
 if(!publishAvailable())return null;
 return <PublishButtonInner t={t}/>;
}
function PublishButtonInner({t}:{t:T}){
 const {state,store}=usePublish();
 const running=state.busy==='publish'||state.busy==='rollback';
 return <Button variant="outline" className="!h-8 rounded-[var(--r-control)]" aria-label={t(running?'deploy.button.running':'deploy.button')} data-testid="publish-button" onClick={()=>void store.open()}>
  {running?<Loader2 size={14} className="publish-spin"/>:<UploadCloud size={14}/>}<span>{t(running?'deploy.button.running':'deploy.button')}</span></Button>;
}

/** The Publish dialog: servers, key and trust steps, publish with live progress, result and rollback. */
export function PublishDialog(){
 if(!publishAvailable())return null;
 return <PublishDialogInner/>;
}
function PublishDialogInner(){
 const {t,locale}=useT();const {state,store}=usePublish();
 const selected=state.targets.find(s=>s.target.id===state.selectedId)??null;
 const title=state.view==='setup'?t('deploy.setup.title'):state.view==='form'?t(state.editingId?'deploy.form.title.edit':'deploy.form.title.add'):state.view==='rollback'?t('deploy.rollbackView.title'):t('deploy.panel.title');
 const desc=state.view==='setup'?t('deploy.setup.desc'):state.view==='form'?t('deploy.form.desc'):state.view==='rollback'?t('deploy.rollbackView.desc'):t('deploy.panel.desc');
 return <Dialog open={state.open} onOpenChange={o=>{if(!o)store.close();}}>
  <DialogContent className="dlg-popup publish-popup" aria-label={t('deploy.panel.aria')} data-testid="publish-dialog">
   <header className="dlg-head">
    <span className="dlg-tile" data-tone="accent" aria-hidden="true"><UploadCloud size={20}/></span>
    <div className="dlg-head-text"><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></div>
   </header>
   <div className="dlg-body publish-body">
    {state.view==='setup'&&selected&&<DeploySetupWizard key={selected.target.id} target={selected} store={store} t={t}/>}
    {state.view==='home'&&<Home state={state} store={store} selected={selected} t={t}/>}
    {state.view==='form'&&<ServerForm state={state} store={store} t={t}/>}
    {state.view==='rollback'&&<RollbackList state={state} store={store} selected={selected} t={t} locale={locale}/>}
   </div>
   <button type="button" className="dlg-close" aria-label={t('set.close.aria')} title={t('set.close')} onClick={()=>store.close()}><X size={16} aria-hidden="true"/></button>
  </DialogContent>
 </Dialog>;
}

function Failure({state,store,t}:{state:PublishState;store:PublishStore;t:T}){
 const f=state.failure;if(!f)return null;
 const id=f.targetId??state.selectedId;
 const act:Record<DeployErrorAction,()=>void>={
  setup:()=>{if(id)store.showSetup(id);},
  retry:()=>{store.dismissFailure();if(id&&f.during==='publish')void store.publish(id);else if(id&&f.during==='trust')void store.trust(id);else if(f.during==='load'||f.during==='releases'){void store.refresh();if(id&&f.during==='releases')void store.showRollback(id);}},
  edit:()=>{store.showForm(id);},
  showKey:()=>{if(id)void store.showPublicKey(id);},
  createKey:()=>{if(id)void store.createKey(id);},
  trust:()=>{if(id)void store.trust(id);},
  replaceKey:()=>{if(id)void store.replaceKey(id);},
  rollbackList:()=>{void store.showRollback(id??undefined);},
  dismiss:()=>store.dismissFailure(),
 };
 const labelKey:Record<DeployErrorAction,string>={setup:'deploy.setup.open',retry:'deploy.action.retry',edit:'deploy.action.edit',showKey:'deploy.action.showKey',createKey:'deploy.action.createKey',trust:'deploy.action.trust',replaceKey:'deploy.action.replaceKey',rollbackList:'deploy.action.rollbackList',dismiss:'deploy.action.dismiss'};
 return <section className="publish-card publish-failure" role="alert" data-testid="publish-failure" data-code={f.code}>
  <AlertTriangle size={18} aria-hidden="true"/>
  <div className="publish-card-main"><strong>{t(f.messageKey)}</strong>
   {f.path&&<p className="publish-note" style={mono} data-testid="publish-failure-path">{f.path}</p>}
   <p>{t(f.safe?'deploy.err.safe':'deploy.err.unsafe')}</p>
   {f.actions.includes('showKey')&&id&&<KeyBlock state={state} id={id} t={t} user={state.targets.find(s=>s.target.id===id)?.target.user??'somnia'}/>}
   <div className="publish-actions">{f.actions.map(a=><Button key={a} variant={a===f.actions[0]?'primary':'outline'} size="compact" onClick={act[a]}>{t(labelKey[a])}</Button>)}</div>
  </div>
 </section>;
}

function KeyBlock({state,id,t,user}:{state:PublishState;id:string;t:T;user:string}){
 const key=state.publicKeys[id];const [copied,setCopied]=useState(false);
 if(!key||!SAFE_KEY.test(key))return <p className="publish-note" data-testid="publish-key-gone">{t('deploy.key.gone')}</p>;
 const copy=()=>{void navigator.clipboard?.writeText(key).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1800);},()=>{});};
 return <div className="publish-key" data-testid="publish-key">
  <div className="publish-key-head"><span>{t('deploy.key.public')}</span><Button size="compact" variant="outline" onClick={copy}>{copied?<Check size={12}/>:<Copy size={12}/>}{t(copied?'deploy.key.copied':'deploy.key.copy')}</Button></div>
  <code style={mono} tabIndex={0} aria-label={t('deploy.key.public')}>{key}</code>
  <p className="publish-note">{t('deploy.key.add',{user})}</p>
 </div>;
}

function Home({state,store,selected,t}:{state:PublishState;store:PublishStore;selected:DeployTargetStatus|null;t:T}){
 const running=state.busy==='publish'||state.busy==='rollback';
 const [confirmDelete,setConfirmDelete]=useState<string|null>(null);const [alsoKey,setAlsoKey]=useState(true);
 useEffect(()=>{setConfirmDelete(null);},[state.selectedId]);
 if(!state.loaded)return <p className="publish-note" role="status"><Loader2 size={14} className="publish-spin"/> {t('deploy.loading')}</p>;
 if(state.targets.length===0)return <div className="publish-empty" data-testid="publish-empty"><Server size={28} aria-hidden="true"/><p>{t('deploy.targets.empty')}</p><Button variant="primary" onClick={()=>store.showForm(null)}><Plus size={14}/>{t('deploy.targets.add')}</Button><Failure state={state} store={store} t={t}/></div>;
 return <div className="publish-home">
  <ul className="publish-targets" role="listbox" aria-label={t('deploy.targets.title')}>
   {state.targets.map(s=><li key={s.target.id}><button type="button" role="option" aria-selected={s.target.id===state.selectedId} className="publish-target" data-state={s.state} disabled={state.busy!==null&&!running?false:running} onClick={()=>store.select(s.target.id)}>
    <Server size={16} aria-hidden="true"/><span className="publish-target-name"><strong>{s.target.name}</strong><small style={mono}>{s.target.user}@{s.target.host}{s.target.port!==22?`:${s.target.port}`:''}</small></span>
    <span className="publish-chip" data-state={s.state}>{t(s.state==='ready'?'deploy.state.ready':s.state==='needs-trust'?'deploy.state.needsTrust':'deploy.state.needsKey')}</span></button></li>)}
  </ul>
  <Button size="compact" variant="outline" className="publish-add" disabled={state.busy!==null} onClick={()=>store.showForm(null)}><Plus size={12}/>{t('deploy.targets.add')}</Button>
  {state.staged&&selected&&state.staged.targetId===selected.target.id&&<section className="publish-card" data-testid="publish-staged"><UploadCloud size={18} aria-hidden="true"/><div className="publish-card-main"><strong>{t('deploy.staged',{name:selected.target.name,count:state.staged.files.filter(f=>f.change!=='unchanged').length})}</strong><div className="publish-actions"><Button size="compact" variant="outline" onClick={()=>store.clearStaged()}>{t('deploy.action.dismiss')}</Button></div></div></section>}
  {selected&&<Detail state={state} store={store} s={selected} t={t} onDelete={()=>setConfirmDelete(selected.target.id)}/>}
  {confirmDelete&&selected&&confirmDelete===selected.target.id&&<section className="publish-card publish-delete" role="group" aria-label={t('deploy.delete.title')} data-testid="publish-delete-confirm"><Trash2 size={18} aria-hidden="true"/><div className="publish-card-main"><strong>{t('deploy.delete.confirm',{name:selected.target.name})}</strong><label className="publish-check"><input type="checkbox" checked={alsoKey} onChange={e=>setAlsoKey(e.target.checked)}/><span>{t('deploy.delete.key')}</span></label><p className="publish-note">{t('deploy.delete.note')}</p>
   <div className="publish-actions"><Button size="compact" variant="outline" autoFocus onClick={()=>setConfirmDelete(null)}>{t('deploy.cancel')}</Button><Button size="compact" className="publish-danger" onClick={()=>{void store.deleteTarget(selected.target.id,alsoKey);setConfirmDelete(null);}}>{t('deploy.delete.yes')}</Button></div></div></section>}
  <Failure state={state} store={store} t={t}/>
 </div>;
}

function Detail({state,store,s,t,onDelete}:{state:PublishState;store:PublishStore;s:DeployTargetStatus;t:T;onDelete:()=>void}){
 const id=s.target.id;const running=state.busy==='publish'||state.busy==='rollback';
 const result=state.result&&state.result.targetId===id?state.result:null;
 const url=liveUrl(s.target);const busy=state.busy!==null;
 const kindKey=s.target.kind==='static'?'deploy.kind.static':s.target.kind==='node'?'deploy.kind.node':'deploy.kind.upload';
 return <section className="publish-detail" aria-label={s.target.name} data-testid="publish-detail" data-state={s.state}>
  <dl className="publish-facts">
   <dt>{t('deploy.field.server')}</dt><dd style={mono}>{s.target.user}@{s.target.host}:{s.target.port}</dd>
   <dt>{t('deploy.field.address')}</dt><dd style={mono}>{url??t('deploy.noDomain')}</dd>
   <dt>{t('deploy.field.kind')}</dt><dd>{t(kindKey)}</dd>
   {s.fingerprint&&<><dt>{t('deploy.pinned')}</dt><dd style={mono} title={s.fingerprint} data-testid="publish-pinned">{shortFingerprint(s.fingerprint)}</dd></>}
  </dl>
  <div className="publish-tools"><Button size="compact" variant="ghost" disabled={busy} onClick={()=>store.showForm(id)}><Pencil size={12}/>{t('deploy.edit')}</Button><Button size="compact" variant="ghost" disabled={busy} onClick={onDelete}><Trash2 size={12}/>{t('deploy.delete')}</Button><Button size="compact" variant="ghost" disabled={busy} onClick={()=>store.showSetup(id)}>{t('deploy.setup.open')}</Button></div>
  {running&&state.selectedId===id?<><Progress state={state} t={t} rollback={state.busy==='rollback'}/>{state.busy==='publish'&&state.progress.seen.length>0&&mayCancel(state.progress.seen)&&<Button variant="outline" disabled={state.cancelRequested} onClick={()=>void store.cancelPublish(id)}>{t(state.cancelRequested?'deploy.setup.cancelling':'deploy.setup.cancelPublish')}</Button>}</>:<>
   {s.state==='key-missing'&&<Step icon={<KeyRound size={18}/>} title={t('deploy.step.key.title')} text={t('deploy.step.key.text')}><Button variant="primary" disabled={busy} onClick={()=>void store.createKey(id)}>{state.busy==='key'?<Loader2 size={14} className="publish-spin"/>:null}{t('deploy.step.key.button')}</Button></Step>}
   {s.state==='needs-trust'&&<Step icon={<ShieldCheck size={18}/>} title={t('deploy.step.trust.title')} text={t('deploy.step.trust.text')}>
     {state.publicKeys[id]&&<KeyBlock state={state} id={id} t={t} user={s.target.user}/>}
     <Button variant="primary" disabled={busy} onClick={()=>void store.trust(id)}>{state.busy==='trust'?<Loader2 size={14} className="publish-spin"/>:null}{t('deploy.step.trust.button')}</Button></Step>}
   {s.state==='ready'&&!result&&<Step icon={<UploadCloud size={18}/>} title={t('deploy.step.ready.title')} text={t('deploy.step.ready.text')}>
     <div className="publish-actions"><Button variant="primary" disabled={busy} data-testid="publish-go" onClick={()=>void store.publish(id)}><UploadCloud size={14}/>{t('deploy.publish.button')}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void store.showRollback(id)}><Undo2 size={14}/>{t('deploy.rollback.open')}</Button></div></Step>}
   {result&&<Result state={state} store={store} s={s} t={t}/>}
  </>}
 </section>;
}

function Step({icon,title,text,children}:{icon:React.ReactNode;title:string;text:string;children:React.ReactNode}){
 return <div className="publish-card publish-step"><span className="publish-step-icon" aria-hidden="true">{icon}</span><div className="publish-card-main"><strong>{title}</strong><p>{text}</p><div className="publish-step-actions">{children}</div></div></div>;
}

function Progress({state,t,rollback}:{state:PublishState;t:T;rollback:boolean}){
 const latest=state.progress.latest;const seen=state.progress.seen;const b=state.build;
 const idx=latest?PROGRESS_STEPS.indexOf(latest.step as typeof PROGRESS_STEPS[number]):-1;
 const label=(s:typeof PROGRESS_STEPS[number])=>{const p=seen.find(x=>x.step===s);return s==='upload'&&p?.done!==undefined&&p.total!==undefined?t('deploy.progress.upload.count',{done:p.done,total:p.total}):t(`deploy.progress.${s}`);};
 const pct=latest?.step==='upload'&&latest.done!==undefined&&latest.total?Math.round(latest.done/latest.total*100):null;
 return <div className="publish-card publish-progress" role="status" aria-live="polite" data-testid="publish-progress" data-step={latest?.step??'prepare'}>
  <Loader2 size={18} className="publish-spin" aria-hidden="true"/>
  <div className="publish-card-main"><strong>{t(rollback?'deploy.progress.rollback':'deploy.progress.title')}</strong>
   <ol className="publish-steps">
    {!rollback&&b.phase&&<li data-status={b.phase==='done'?'done':'active'} data-testid="publish-build-step" data-phase={b.phase}>{b.phase==='done'?<Check size={12} aria-hidden="true"/>:<Loader2 size={12} className="publish-spin" aria-hidden="true"/>}<span>{b.phase==='done'&&b.summary?t('deploy.progress.build.done',{count:b.summary.fileCount}):t(`deploy.progress.build.${b.phase}`)}</span></li>}
    <li data-status={latest?'done':b.phase&&b.phase!=='done'?'todo':'active'}>{latest?<Check size={12} aria-hidden="true"/>:b.phase&&b.phase!=='done'?<i className="publish-dot" aria-hidden="true"/>:<Loader2 size={12} className="publish-spin" aria-hidden="true"/>}<span>{b.phase?t(latest?'deploy.progress.compare.done':'deploy.progress.compare'):t(latest?'deploy.progress.prepare.done':'deploy.progress.prepare')}</span></li>
    {PROGRESS_STEPS.map((s,i)=>{const status=idx<0?'todo':i<idx?'done':i===idx?'active':'todo';return <li key={s} data-status={status}>{status==='done'?<Check size={12} aria-hidden="true"/>:status==='active'?<Loader2 size={12} className="publish-spin" aria-hidden="true"/>:<i className="publish-dot" aria-hidden="true"/>}<span>{label(s)}</span></li>;})}
   </ol>
   {pct!==null&&<div className="publish-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('deploy.progress.upload')}><i style={{width:`${pct}%`}}/></div>}
   {idx<0&&!(b.phase&&b.phase!=='done')&&<p className="publish-note">{t('deploy.progress.waiting')}</p>}
  </div>
 </div>;
}

function Result({state,store,s,t}:{state:PublishState;store:PublishStore;s:DeployTargetStatus;t:T}){
 const r=state.result!;const url=r.outcome.url??liveUrl(s.target);const [copied,setCopied]=useState(false);
 const copy=()=>{if(!url)return;void navigator.clipboard?.writeText(url).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1800);},()=>{});};
 return <section className="publish-card publish-result" role="status" data-testid="publish-result" data-kind={r.kind}>
  <Check size={18} aria-hidden="true"/>
  <div className="publish-card-main"><strong>{r.kind==='rollback'?t('deploy.result.rollback',{release:r.outcome.releaseId}):url?t('deploy.result.publish',{url:url.replace(/^https:\/\//,'')}):t('deploy.result.publishNoDomain',{release:r.outcome.releaseId})}</strong>
   {r.outcome.rolledBack&&r.kind==='publish'&&<p>{t('deploy.result.autoBack')}</p>}
   <p className="publish-note" style={mono}>{t('deploy.result.release',{release:r.outcome.releaseId})}</p>
   <div className="publish-actions">
    {url&&<Button size="compact" variant="primary" onClick={()=>void store.openSite(s.target.id)}><ExternalLink size={12}/>{t('deploy.result.open')}</Button>}
    {url&&<Button size="compact" variant="outline" onClick={copy}>{copied?<Check size={12}/>:<Copy size={12}/>}{t(copied?'deploy.key.copied':'deploy.result.copy')}</Button>}
    {r.kind==='publish'&&<Button size="compact" variant="outline" onClick={()=>void store.showRollback(s.target.id)}><Undo2 size={12}/>{t('deploy.result.undo')}</Button>}
    <Button size="compact" variant="ghost" onClick={()=>store.dismissResult()}>{t('deploy.action.dismiss')}</Button>
   </div>
  </div>
 </section>;
}

function Field({label,error,children,id}:{label:string;error?:string;children:React.ReactNode;id:string}){
 return <div className="publish-field"><label htmlFor={id}>{label}</label>{children}{error&&<span className="publish-field-error" id={`${id}-err`} role="alert">{error}</span>}</div>;
}

function ServerForm({state,store,t}:{state:PublishState;store:PublishStore;t:T}){
 const editing=state.editingId?state.targets.find(s=>s.target.id===state.editingId)?.target:undefined;
 const [form,setForm]=useState<TargetForm>(()=>editing?formFromTarget(editing):emptyTargetForm());const [tried,setTried]=useState(false);
 const errors=useMemo(()=>validateTargetForm(form),[form]);const shown=tried?errors:{};
 const set=<K extends keyof TargetForm>(k:K,v:TargetForm[K])=>setForm(f=>({...f,[k]:v}));
 const err=(k:FormField)=>shown[k]?t(shown[k]!):undefined;
 const submit=async()=>{setTried(true);if(Object.keys(errors).length)return;const id=await store.saveTarget(form);if(id&&!editing)store.showSetup(id);};
 const kinds=[['static','deploy.kind.static','deploy.kind.static.desc'],['node','deploy.kind.node','deploy.kind.node.desc'],['upload-only','deploy.kind.upload','deploy.kind.upload.desc']] as const;
 const busy=state.busy==='save';
 return <form className="publish-form" noValidate onSubmit={e=>{e.preventDefault();void submit();}} data-testid="publish-form">
  <Field id="pf-name" label={t('deploy.form.name')} error={err('name')}><Input id="pf-name" autoFocus value={form.name} placeholder={t('deploy.form.name.ph')} aria-invalid={!!shown.name} onChange={e=>set('name',e.target.value)}/></Field>
  <div className="publish-row">
   <Field id="pf-host" label={t('deploy.form.host')} error={err('host')}><Input id="pf-host" value={form.host} spellCheck={false} autoCapitalize="off" placeholder={t('deploy.form.host.ph')} aria-invalid={!!shown.host} onChange={e=>set('host',e.target.value)}/></Field>
   <Field id="pf-port" label={t('deploy.form.port')} error={err('port')}><Input id="pf-port" inputMode="numeric" value={form.port} aria-invalid={!!shown.port} onChange={e=>set('port',e.target.value)}/></Field>
  </div>
  <div className="publish-row">
   <Field id="pf-user" label={t('deploy.form.user')} error={err('user')}><Input id="pf-user" value={form.user} spellCheck={false} autoCapitalize="off" aria-invalid={!!shown.user} onChange={e=>set('user',e.target.value)}/></Field>
   <Field id="pf-domain" label={t('deploy.form.domain')} error={err('domain')}><Input id="pf-domain" value={form.domain} spellCheck={false} autoCapitalize="off" placeholder={t('deploy.form.domain.ph')} aria-invalid={!!shown.domain} onChange={e=>set('domain',e.target.value)}/></Field>
  </div>
  <fieldset className="publish-kinds"><legend>{t('deploy.form.kind')}</legend>
   {kinds.map(([k,title,desc])=><label key={k} className="publish-kind" data-checked={form.kind===k}><input type="radio" name="pf-kind" checked={form.kind===k} onChange={()=>set('kind',k)}/><span><strong>{t(title)}</strong><small>{t(desc)}</small></span></label>)}
  </fieldset>
  {form.kind==='static'&&<label className="publish-check"><input type="checkbox" checked={form.spa} onChange={e=>set('spa',e.target.checked)}/><span>{t('deploy.form.spa')}</span></label>}
  {form.kind==='node'&&<Field id="pf-app" label={t('deploy.form.appPort')} error={err('appPort')}><Input id="pf-app" inputMode="numeric" value={form.appPort} aria-invalid={!!shown.appPort} onChange={e=>set('appPort',e.target.value)}/></Field>}
  <Failure state={state} store={store} t={t}/>
  <footer className="dlg-foot publish-foot">
   {state.targets.length>0||editing?<button type="button" className="dlg-cancel" onClick={()=>store.showHome()}><ArrowLeft size={12} style={{display:'inline',marginRight:6}}/>{t('deploy.back')}</button>:null}
   <span className="dlg-spacer"/>
   <Button variant="primary" type="submit" disabled={busy}>{busy&&<Loader2 size={14} className="publish-spin"/>}{t(editing?'deploy.form.save':'deploy.form.saveAdd')}</Button>
  </footer>
 </form>;
}

function RollbackList({state,store,selected,t,locale}:{state:PublishState;store:PublishStore;selected:DeployTargetStatus|null;t:T;locale:string}){
 const id=selected?.target.id??null;const live=id?state.liveByTarget[id]:undefined;
 const fmt=useMemo(()=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}),[locale]);
 const loading=state.busy==='releases';const running=state.busy==='rollback';
 return <div className="publish-rollback" data-testid="publish-rollback">
  {running?<Progress state={state} t={t} rollback/>:<>
   {loading&&<p className="publish-note" role="status"><Loader2 size={14} className="publish-spin"/> {t('deploy.rollbackView.loading')}</p>}
   {!loading&&!state.failure&&state.releases.length===0&&<p className="publish-note" data-testid="publish-no-releases">{t('deploy.rollbackView.none')}</p>}
   {state.releases.length>0&&<ul className="publish-releases" aria-label={t('deploy.rollbackView.title')}>
    {state.releases.map(r=>{const d=releaseDate(r);const isLive=r===live;return <li key={r} className="publish-release" data-live={isLive}>
     <span className="publish-release-main"><strong>{d?fmt.format(d):r}</strong><small style={mono}>{r}</small></span>
     {isLive&&<span className="publish-chip" data-state="ready">{t('deploy.rollbackView.live')}</span>}
     <Button size="compact" variant="outline" disabled={isLive||state.busy!==null||!id} onClick={()=>id&&void store.rollback(id,r)}><Undo2 size={12}/>{t('deploy.rollbackView.goBack')}</Button></li>;})}
   </ul>}
   <p className="publish-note">{t('deploy.rollback.note')}</p>
  </>}
  <Failure state={state} store={store} t={t}/>
  <footer className="dlg-foot publish-foot"><button type="button" className="dlg-cancel" disabled={running} onClick={()=>store.showHome()}><ArrowLeft size={12} style={{display:'inline',marginRight:6}}/>{t('deploy.back')}</button></footer>
 </div>;
}
export {formatBytes,summarizePlan};
