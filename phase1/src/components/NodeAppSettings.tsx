import {useCallback,useEffect,useState} from 'react';
import {Loader2,Plus,RefreshCw,Trash2} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {useT} from '../lib/useT';
import {invokeCmd} from '../lib/invokeCmd';
import type {NodeStatusView} from '../lib/commandContracts';

const KEY=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const mono={fontFamily:'var(--mono,ui-monospace,monospace)',wordBreak:'break-all'} as const;

function codeOf(e:unknown):string{
 const raw=e instanceof Error?e.message:typeof e==='string'?e:'';
 return /deploy:[a-z-]+/.exec(raw)?.[0].slice(7)??'engine-failed';
}

/** App settings of a Node target: variable names (values are write-only), status and the recent log. */
export function NodeAppSettings({targetId}:{targetId:string}){
 const {t}=useT();
 const [keys,setKeys]=useState<string[]|null>(null);
 const [status,setStatus]=useState<NodeStatusView|null>(null);
 const [logs,setLogs]=useState<string[]|null>(null);
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState<string|null>(null);
 const [name,setName]=useState('');const [value,setValue]=useState('');
 const load=useCallback(async()=>{
  setBusy(true);setErr(null);
  try{
   setKeys(await invokeCmd('deploy_node_env_keys',{targetId}));
   setStatus(await invokeCmd('deploy_node_status',{targetId}));
   setLogs(await invokeCmd('deploy_node_logs',{targetId,lines:40}));
  }catch(e){setErr(codeOf(e));}finally{setBusy(false);}
 },[targetId]);
 useEffect(()=>{setKeys(null);setStatus(null);setLogs(null);void load();},[load]);
 const apply=async(set:Array<{key:string;value:string}>,remove:string[])=>{
  setBusy(true);setErr(null);
  try{setKeys(await invokeCmd('deploy_node_env_apply',{targetId,set,remove}));setName('');setValue('');}
  catch(e){setErr(codeOf(e));}finally{setBusy(false);}
 };
 const valid=KEY.test(name.trim())&&value.length>0;
 return <section className="publish-card publish-node" data-testid="node-settings" aria-label={t('deploy.node.title')}>
  <div className="publish-card-main">
   <div className="publish-node-head"><strong>{t('deploy.node.title')}</strong>
    <Button size="compact" variant="outline" disabled={busy} onClick={()=>void load()}>{busy?<Loader2 size={12} className="publish-spin"/>:<RefreshCw size={12}/>}{t('deploy.node.refresh')}</Button></div>
   {err&&<p className="publish-note" role="alert" data-testid="node-error">{t(`deploy.err.${err}`)}</p>}
   {status&&<dl className="publish-facts" data-testid="node-status">
    <dt>{t('deploy.node.status')}</dt><dd>{t(status.active==='active'?'deploy.node.running':'deploy.node.stopped')}</dd>
    <dt>{t('deploy.node.restarts')}</dt><dd>{status.restarts}</dd>
    {status.nodeVersion&&<><dt>Node.js</dt><dd style={mono}>{status.nodeVersion}</dd></>}
    {status.port!==null&&<><dt>{t('deploy.node.port')}</dt><dd style={mono}>{status.port}</dd></>}
   </dl>}
   <p className="publish-note">{t('deploy.node.envNote')}</p>
   <ul className="publish-node-keys" aria-label={t('deploy.node.env')} data-testid="node-env-keys">
    {keys&&keys.length===0&&<li className="publish-note">{t('deploy.node.envEmpty')}</li>}
    {keys?.map(k=><li key={k}><code style={mono}>{k}</code><span className="publish-note">{t('deploy.node.hidden')}</span>
     <Button size="compact" variant="outline" disabled={busy} aria-label={t('deploy.node.remove',{name:k})} onClick={()=>void apply([],[k])}><Trash2 size={12}/></Button></li>)}
   </ul>
   <form className="publish-node-add" onSubmit={e=>{e.preventDefault();if(valid)void apply([{key:name.trim(),value}],[]);}}>
    <Input value={name} onChange={e=>setName(e.target.value)} placeholder="DATABASE_URL" aria-label={t('deploy.node.name')} autoComplete="off" spellCheck={false}/>
    <Input value={value} onChange={e=>setValue(e.target.value)} type="password" aria-label={t('deploy.node.value')} placeholder={t('deploy.node.value')} autoComplete="off"/>
    <Button size="compact" variant="primary" type="submit" disabled={busy||!valid}><Plus size={12}/>{t('deploy.node.save')}</Button>
   </form>
   <p className="publish-note">{t('deploy.node.restartNote')}</p>
   <details className="publish-node-logs"><summary>{t('deploy.node.logs')}</summary>
    <pre style={mono} tabIndex={0} aria-label={t('deploy.node.logs')} data-testid="node-logs">{logs&&logs.length>0?logs.join('\n'):t('deploy.node.logsEmpty')}</pre></details>
  </div>
 </section>;
}
