import {useEffect,useRef,useState} from 'react';
import {Check,Copy,KeyRound,Loader2,ShieldCheck} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {createTauriDeployBackend} from '../lib/deploy/tauriBackend';
import type {DeployBackend,DeployTargetStatus} from '../lib/deploy/contract';
import type {PublishStore} from '../lib/deploy/publishStore';
import {dnsRows,type DeployDnsCheck,type DeployBootstrapReport} from '../lib/deploy/setup';

type T=(key:string,p?:Record<string,string|number>)=>string;
type Step='key'|'trust'|'prepare'|'domain';
const backend=createTauriDeployBackend();
/** Only public setup data is React state. Passwords are uncontrolled, cleared before awaiting IPC. */
export function DeploySetupWizard({target,store,t,be=backend}:{target:DeployTargetStatus;store:PublishStore;t:T;be?:DeployBackend}) {
 const id=target.target.id;
 const [step,setStep]=useState<Step>(target.state==='key-missing'?'key':target.state==='needs-trust'?'trust':'prepare');
 const [publicKey,setPublicKey]=useState(''); const [script,setScript]=useState(''); const [dns,setDns]=useState<DeployDnsCheck|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [report,setReport]=useState<DeployBootstrapReport|null>(null);
 const [loginUser,setLoginUser]=useState('root');const [privilege,setPrivilege]=useState<'root'|'sudo-passwordless'|'sudo-password'>('root');
 const [confirmRun,setConfirmRun]=useState(false);const [copied,setCopied]=useState(false);
 const loginPassword=useRef<HTMLInputElement>(null);const sudoPassword=useRef<HTMLInputElement>(null);
 const clearPasswords=()=>{if(loginPassword.current)loginPassword.current.value='';if(sudoPassword.current)sudoPassword.current.value='';};
 useEffect(()=>()=>clearPasswords(),[]);
 useEffect(()=>{setConfirmRun(false);clearPasswords();},[step]);
 const work=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError(null);try{await fn();}catch(e){const code=/deploy:([a-z-]+)/.exec(e instanceof Error?e.message:'');setError(`deploy.setup.error.${code?.[1]??'failed'}`);}finally{setBusy(false);}};
 const readScript=async()=>{if(!be.bootstrapScript)throw new Error('deploy:failed');setScript(await be.bootstrapScript(id));};
 const checkDns=async()=>{if(!be.dnsCheck)throw new Error('deploy:failed');setDns(await be.dnsCheck(id));};
 const toPrepare=()=>void work(async()=>{await readScript();setStep('prepare');});
 useEffect(()=>{if(step==='prepare')void work(readScript);},[]);
 const run=()=>{
  const input={targetId:id,loginUser,privilege,loginPassword:loginPassword.current?.value??'',sudoPassword:sudoPassword.current?.value??''};
  clearPasswords();setConfirmRun(false);
  void work(async()=>{try {if(!be.bootstrapRun)throw new Error('deploy:failed');const r=await be.bootstrapRun(input);setReport(r);if(r.outcome==='done'){await store.finishSetup(id);await store.refresh();}}finally{input.loginPassword='';input.sudoPassword='';}});
 };
 const copy=(text:string)=>{if(!navigator.clipboard){setError('deploy.setup.error.clipboard');return;}void navigator.clipboard.writeText(text).then(()=>{setCopied(true);},()=>{setError('deploy.setup.error.clipboard');});};
 const order:Step[]=['key','trust','prepare','domain'];
 return <section className="deploy-setup" data-testid="deploy-setup" data-step={step} aria-label={t('deploy.setup.title')}>
  <ol className="deploy-setup-nav" aria-label={t('deploy.setup.steps')}>{order.map((s,i)=><li key={s} aria-current={step===s?'step':undefined} data-current={step===s}><span>{i+1}</span>{t(`deploy.setup.step.${s}`)}</li>)}</ol>
  <div className="publish-card"><div className="publish-card-main">
   <h3>{t(`deploy.setup.${step}.title`)}</h3><p>{t(`deploy.setup.${step}.text`)}</p>
   {step==='key'&&<>
    <Button variant="primary" disabled={busy} onClick={()=>void work(async()=>{const key=await store.createKey(id);if(key){setPublicKey(key);setStep('trust');}})}><KeyRound size={14}/>{t('deploy.step.key.button')}</Button>
   </>}
   {step==='trust'&&<>
    {publicKey&&<pre className="deploy-setup-key">{publicKey}</pre>}
    <Button variant="primary" disabled={busy} onClick={()=>void work(async()=>{await store.trust(id);const status=(await be.targetsList()).find(s=>s.target.id===id);if(status?.state==='ready'){await readScript();setStep('prepare');}})}><ShieldCheck size={14}/>{t('deploy.step.trust.button')}</Button>
   </>}
   {step==='prepare'&&<>
    <ul className="deploy-setup-changes">{['ports','caddy','user','key','dirs','config','start'].map(s=><li key={s}>{t(`deploy.setup.change.${s}`)}</li>)}{target.target.kind==='node'&&<li>{t('deploy.setup.change.linger')}</li>}</ul>
    <details open><summary>{t('deploy.setup.script')}</summary><pre className="deploy-setup-script" tabIndex={0} aria-label={t('deploy.setup.script')}>{script||t('deploy.loading')}</pre></details>
    <div className="publish-actions"><Button size="compact" variant="outline" disabled={!script||busy} onClick={()=>copy(script)}>{copied?<Check size={12}/>:<Copy size={12}/>} {t('deploy.setup.copyScript')}</Button><Button size="compact" variant="outline" disabled={busy} onClick={()=>void work(async()=>{const key=await store.showPublicKey(id);if(key)setPublicKey(key);})}>{t('deploy.setup.showKey')}</Button></div>
    {publicKey&&<pre className="deploy-setup-key" tabIndex={0}>{publicKey}</pre>}
    <details><summary>{t('deploy.setup.runHere')}</summary>
     <p className="publish-note">{t('deploy.setup.credentials')}</p>
     <label className="publish-field">{t('deploy.setup.loginUser')}<Input value={loginUser} autoComplete="username" onChange={e=>{setLoginUser(e.target.value);setPrivilege(e.target.value==='root'?'root':'sudo-password');}}/></label>
     <label className="publish-field">{t('deploy.setup.loginPassword')}<Input ref={loginPassword} type="password" autoComplete="off" data-testid="setup-login-password"/></label>
     {loginUser!=='root'&&<><label className="publish-check"><input type="checkbox" checked={privilege==='sudo-passwordless'} onChange={e=>setPrivilege(e.target.checked?'sudo-passwordless':'sudo-password')}/>{t('deploy.setup.passwordless')}</label>{privilege==='sudo-password'&&<label className="publish-field">{t('deploy.setup.sudoPassword')}<Input ref={sudoPassword} type="password" autoComplete="off" data-testid="setup-sudo-password"/></label>}</>}
     <label className="publish-check"><input type="checkbox" checked={confirmRun} onChange={e=>setConfirmRun(e.target.checked)}/>{t('deploy.setup.reviewed',{host:target.target.host})}</label>
     <Button variant="primary" disabled={busy||!confirmRun||!script} onClick={run}>{t('deploy.setup.run')}</Button>
    </details>
    {report&&<div role="status" className="deploy-setup-outcome" data-outcome={report.outcome}><strong>{t(`deploy.setup.outcome.${report.outcome}`,{port:report.port??''})}</strong>{report.hostFingerprint&&<code>{report.hostFingerprint}</code>}</div>}
    <p className="publish-note">{t('deploy.setup.ports')}</p>
    <Button variant="primary" disabled={busy} onClick={()=>void work(async()=>{setStep('domain');if(target.target.domain)await checkDns();})}>{t(report?.outcome==='done'?'deploy.setup.continue':'deploy.setup.already')}</Button>
   </>}
   {step==='domain'&&<>
    <p className="publish-note">{t('deploy.setup.ports')}</p>
    {!target.target.domain?<><p>{t('deploy.setup.noDomain')}</p><Button variant="outline" onClick={()=>store.showForm(id)}>{t('deploy.edit')}</Button></>:<>
     {dns&&<><table className="deploy-dns-table"><caption>{t('deploy.setup.records')}</caption><thead><tr><th>{t('deploy.setup.type')}</th><th>{t('deploy.setup.name')}</th><th>{t('deploy.setup.value')}</th></tr></thead><tbody>{dnsRows(dns.expected).map((r,i)=><tr key={i}><td>{r.type}</td><td>{r.name}</td><td><code>{r.value}</code></td></tr>)}</tbody></table>
      <div role="status" data-testid="deploy-dns-status" data-ready={dns.ready}><strong>{t(dns.ready?'deploy.setup.dnsReady':'deploy.setup.dnsNotReady',{domain:target.target.domain})}</strong>
       {dns.staleIpv6&&<p>{t('deploy.setup.staleIpv6')}</p>}{dns.wwwMissing&&<p>{t('deploy.setup.wwwMissing')}</p>}{dns.resolverFailed&&<p>{t('deploy.setup.resolverFailed')}</p>}
      </div>
      <details><summary>{t('deploy.setup.resolved')}</summary><ul>{dns.records.map((r,i)=><li key={i}><code>{r.name} ({r.source}, {r.type})</code>: {r.values.join(', ')||t('deploy.setup.noRecords')}</li>)}</ul></details>
     </>}
     <p>{t('deploy.setup.propagation')}</p>
     <div className="publish-actions"><Button variant="outline" disabled={busy} onClick={()=>void work(checkDns)}>{t('deploy.setup.checkDns')}</Button>{dns&&<Button variant="outline" onClick={()=>copy(dnsRows(dns.expected).map(r=>`${r.type}\t${r.name}\t${r.value}`).join('\n'))}>{t('deploy.setup.copyRecords')}</Button>}
      <Button variant="primary" disabled={busy||!dns} onClick={()=>{store.showHome();void store.publish(id);}}>{t(dns?.ready?'deploy.setup.publish':'deploy.setup.publishAnyway')}</Button></div>
    </>}
   </>}
   {busy&&<p className="publish-note" role="status"><Loader2 size={14} className="publish-spin"/> {t('deploy.setup.working')}</p>}
   {error&&<p role="alert">{t(error)===error?t('deploy.setup.error.failed'):t(error)}</p>}
  </div></div>
  <footer className="dlg-foot publish-foot"><Button variant="ghost" disabled={busy} onClick={()=>{if(step==='domain')toPrepare();else if(step==='prepare')setStep('trust');else store.showHome();}}>{t('deploy.back')}</Button><span className="dlg-spacer"/><Button variant="ghost" disabled={busy} onClick={()=>{clearPasswords();store.showHome();}}>{t('deploy.setup.finishLater')}</Button></footer>
 </section>;
}
