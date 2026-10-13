import {useEffect,useRef,useState} from 'react';
import {Folder,File as FileIcon,KeyRound,Loader2,ShieldCheck} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {createTauriDeployBackend} from '../lib/deploy/tauriBackend';
import {formatBytes} from '../lib/deploy/publishModel';
import type {DeployBackend,DeployRemoteEntry,DeployTargetStatus} from '../lib/deploy/contract';
import type {PublishStore} from '../lib/deploy/publishStore';

type T=(key:string,p?:Record<string,string|number>)=>string;
const backend=createTauriDeployBackend();

/** FTP/FTPS setup: password into the keychain, then trust the server certificate. No server preparation. */
export function FtpSetup({target,store,t}:{target:DeployTargetStatus;store:PublishStore;t:T}){
 const id=target.target.id;
 const [step,setStep]=useState<'password'|'trust'>(target.state==='key-missing'?'password':'trust');
 const pw=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 useEffect(()=>()=>{if(pw.current)pw.current.value='';},[]);
 const savePassword=async()=>{
  const value=pw.current?.value??'';if(!value||busy)return;
  if(pw.current)pw.current.value='';
  setBusy(true);setError(null);
  try{const ok=await store.setFtpPassword(id,value);if(ok)setStep('trust');else setError('deploy.setup.error.failed');}finally{setBusy(false);}
 };
 const trust=async()=>{if(busy)return;setBusy(true);setError(null);try{await store.trust(id);store.showHome();}catch{setError('deploy.setup.error.failed');}finally{setBusy(false);}};
 const plain=target.target.ftp?.security==='plain';
 return <section className="deploy-setup" data-testid="ftp-setup" data-step={step} aria-label={t('deploy.setup.title')}>
  <div className="publish-card"><div className="publish-card-main">
   <h3>{t(`deploy.ftp.${step}.title`)}</h3><p>{t(`deploy.ftp.${step}.text`)}</p>
   {plain&&<p role="alert" className="publish-note">{t('deploy.ftp.plainWarning')}</p>}
   {step==='password'&&<>
    <label className="publish-field">{t('deploy.ftp.password')}<Input ref={pw} type="password" autoComplete="off" data-testid="ftp-password"/></label>
    <Button variant="primary" disabled={busy} onClick={()=>void savePassword()}><KeyRound size={14}/>{t('deploy.ftp.password.save')}</Button>
   </>}
   {step==='trust'&&<Button variant="primary" disabled={busy} onClick={()=>void trust()}><ShieldCheck size={14}/>{t('deploy.step.trust.button')}</Button>}
   {busy&&<p className="publish-note" role="status"><Loader2 size={14} className="publish-spin"/> {t('deploy.setup.working')}</p>}
   {error&&<p role="alert">{t(error)}</p>}
  </div></div>
  <footer className="dlg-foot publish-foot"><Button variant="ghost" disabled={busy} onClick={()=>{if(pw.current)pw.current.value='';store.showHome();}}>{t('deploy.setup.finishLater')}</Button></footer>
 </section>;
}

/** Read-only listing of the remote folder. Nothing here can change the server. */
export function RemoteBrowser({target,t,be=backend}:{target:DeployTargetStatus;t:T;be?:DeployBackend}){
 /** Paths are relative to the target's server folder; '/' is that folder itself. */
 const root='/';
 const [path,setPath]=useState(root);const [rows,setRows]=useState<DeployRemoteEntry[]|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState(false);
 const load=async(p:string)=>{
  if(!be.remoteList)return;setBusy(true);setError(false);
  try{setRows(await be.remoteList(target.target.id,p));setPath(p);}catch{setError(true);}finally{setBusy(false);}
 };
 const up=()=>{const i=path.lastIndexOf('/');return i<=0?'/':path.slice(0,i);};
 const join=(n:string)=>path==='/'?`/${n}`:`${path}/${n}`;
 return <section className="publish-card" data-testid="ftp-remote" aria-label={t('deploy.ftp.remote.title')}><div className="publish-card-main">
  <strong>{t('deploy.ftp.remote.title')}</strong>
  <div className="publish-actions"><Button size="compact" variant="outline" disabled={busy} onClick={()=>void load(rows?path:root)}>{busy?<Loader2 size={12} className="publish-spin"/>:null}{t(rows?'deploy.ftp.remote.refresh':'deploy.ftp.remote.load')}</Button>
   {rows&&path!==root&&<Button size="compact" variant="ghost" disabled={busy} onClick={()=>void load(up())}>{t('deploy.ftp.remote.up')}</Button>}</div>
  {error&&<p role="alert">{t('deploy.ftp.remote.failed')}</p>}
  {rows&&<><code>{target.target.ftp?.remotePath==='/'||path!=='/'?(target.target.ftp?.remotePath??'')+(path==='/'?'':path):target.target.ftp?.remotePath}</code>{rows.length===0?<p className="publish-note">{t('deploy.ftp.remote.empty')}</p>:<ul className="publish-releases" data-testid="ftp-remote-list">{rows.map(r=><li key={r.name}>
   {r.kind==='dir'?<button type="button" className="publish-release" disabled={busy} onClick={()=>void load(join(r.name))}><Folder size={12} aria-hidden="true"/> {r.name}</button>:<span><FileIcon size={12} aria-hidden="true"/> {r.name}</span>} {r.kind==='file'&&r.size!==null&&<small>{formatBytes(r.size)}</small>}</li>)}</ul>}</>}
 </div></section>;
}
