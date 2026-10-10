import {useState,useSyncExternalStore} from 'react';
import {useT} from '../../lib/useT';
import {Button} from '../ui/button';
import {getMcpRuntime,type McpRuntime,type McpServerConfig} from '../../lib/agent/mcpRuntime';
import {getStudioMcpHost,type StudioMcpHost,type StudioMcpSnapshot} from '../../lib/agent/studioMcpHost';
const none={subscribe:()=>()=>{},getSnapshot:()=>null};
const parseArgs=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);
const parseEnv=(s:string):Record<string,string>|null=>{const o:Record<string,string>={};for(const line of s.split('\n').map(x=>x.trim()).filter(Boolean)){const i=line.indexOf('=');if(i<1)return null;o[line.slice(0,i)]=line.slice(i+1);}return o;};
/** Settings > AI > Tools. Servers are saved by explicit user action; every tool needs its own grant and every call a human approval. */
export function McpSettings({runtime=getMcpRuntime()}:{runtime?:McpRuntime|null}){
 const {t}=useT();
 const snap=useSyncExternalStore(runtime?.subscribe??none.subscribe,runtime?.getSnapshot??none.getSnapshot as never,runtime?.getSnapshot??none.getSnapshot as never) as ReturnType<McpRuntime['getSnapshot']>|null;
 const host=getStudioMcpHost();
 const hsnap=useSyncExternalStore(host?.subscribe??none.subscribe,host?.getSnapshot??none.getSnapshot as never,host?.getSnapshot??none.getSnapshot as never) as StudioMcpSnapshot|null;
 const [form,setForm]=useState({id:'',command:'',args:'',env:''}),[formError,setFormError]=useState('');
 if(!runtime||!snap)return <p role="status" data-testid="mcp-desktop-only">{t('mcp.desktopOnly')}</p>;
 const add=async()=>{const env=parseEnv(form.env);if(!env){setFormError(t('mcp.envInvalid'));return;}setFormError('');
  const cfg:McpServerConfig={id:form.id.trim(),command:form.command.trim(),args:parseArgs(form.args),env};await runtime.save(cfg);if(!runtime.getSnapshot().error)setForm({id:'',command:'',args:'',env:''});};
 const toolsOf=(id:string)=>snap.tools.filter(x=>x.server===id);
 return <div className="mcp-settings" data-testid="mcp-settings">
  <p className="pr-8">{t('mcp.intro')}</p>
  {snap.error&&<p role="alert">{snap.error}</p>}
  <ul aria-label={t('mcp.servers')} className="m-0 list-none p-0">{snap.servers.map(s=><li key={s.config.id} data-testid="mcp-server" className="mb-3 rounded-sm border border-subtle p-2">
   <strong>{s.config.id}</strong> <code>{[s.config.command,...s.config.args].join(' ')}</code>
   <div className="mt-1 flex gap-2">
    {s.running?<Button onClick={()=>void runtime.stop(s.config.id)} disabled={snap.busy}>{t('mcp.stop')}</Button>:<Button onClick={()=>void runtime.start(s.config.id)} disabled={snap.busy}>{t('mcp.start')}</Button>}
    <Button onClick={()=>{if(window.confirm(t('mcp.removeConfirm',{id:s.config.id})))void runtime.remove(s.config.id);}} disabled={snap.busy}>{t('mcp.remove')}</Button></div>
   {s.running&&<ul className="m-0 mt-2 list-none p-0" aria-label={t('mcp.tools')}>{toolsOf(s.config.id).map(tool=><li key={tool.name}><label className="flex items-start justify-start! gap-2 text-left"><input type="checkbox" className="mt-1 size-4 shrink-0 grow-0 basis-4" checked={runtime.isGranted(tool)} onChange={e=>runtime.setGranted(tool,e.target.checked)}/><span className="min-w-0 flex-1 text-left"><strong>{tool.name}</strong><br/><small>{t('mcp.untrustedText')} {tool.description.slice(0,200)}</small></span></label></li>)}{!toolsOf(s.config.id).length&&<li><small>{t('mcp.noTools')}</small></li>}</ul>}
  </li>)}</ul>
  {!snap.servers.length&&<p>{t('mcp.noServers')}</p>}
  <section className="mt-3" aria-label={t('mcp.activity')} data-testid="mcp-activity">
   <div className="flex items-center justify-between"><strong>{t('mcp.activity')}</strong>{snap.activity.length>0&&<Button onClick={()=>runtime.clearActivity()}>{t('mcp.activityClear')}</Button>}</div>
   {snap.activity.length===0?<p><small>{t('mcp.activityEmpty')}</small></p>:<ul className="m-0 list-none p-0">{snap.activity.map((a,i)=><li key={`${a.at}-${i}`} data-testid="mcp-activity-row"><small>{new Date(a.at).toLocaleTimeString()} · {a.server}/{a.tool} · {t(`mcp.outcome.${a.outcome}`)} · {a.ms} ms{a.detail?` · ${a.detail}`:''}</small></li>)}</ul>}
  </section>
  <fieldset className="mt-3 flex flex-col gap-2"><legend>{t('mcp.add')}</legend>
   <label>{t('mcp.id')}<input value={form.id} onChange={e=>setForm({...form,id:e.target.value})} placeholder="files"/></label>
   <label>{t('mcp.command')}<input value={form.command} onChange={e=>setForm({...form,command:e.target.value})} placeholder="/usr/local/bin/my-mcp-server"/></label>
   <label>{t('mcp.args')}<textarea value={form.args} onChange={e=>setForm({...form,args:e.target.value})} rows={2}/></label>
   <label>{t('mcp.env')}<textarea value={form.env} onChange={e=>setForm({...form,env:e.target.value})} rows={2}/></label>
   <p><small>{t('mcp.saveHint')}</small></p>
   {formError&&<p role="alert">{formError}</p>}
   <Button variant="primary" onClick={()=>void add()} disabled={snap.busy||!form.id.trim()||!form.command.trim()} data-testid="mcp-save">{t('mcp.save')}</Button></fieldset>
  {host&&hsnap&&<StudioServerSection host={host} snap={hsnap}/>}
 </div>;}

/** Somnia as MCP server: switch, loopback URL, per-session token and the call activity. */
function StudioServerSection({host,snap}:{host:StudioMcpHost;snap:StudioMcpSnapshot}){
 const {t}=useT();
 const [copied,setCopied]=useState(false);
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{/* clipboard unavailable */}};
 const url=`http://127.0.0.1:${snap.port}/mcp`;
 return <section className="mt-3" aria-label={t('mcp.server.title')} data-testid="mcp-server-section">
  <strong>{t('mcp.server.title')}</strong>
  <p className="pr-8"><small>{t('mcp.server.hint')}</small></p>
  {snap.error&&<p role="alert">{snap.error}</p>}
  {snap.running?<div className="flex flex-col gap-2">
    <label>{t('mcp.server.url')}<input readOnly value={url} data-testid="mcp-server-url" onFocus={e=>e.target.select()}/></label>
    <label>{t('mcp.server.token')}<input readOnly value={snap.token} data-testid="mcp-server-token" onFocus={e=>e.target.select()}/></label>
    <div className="flex gap-2">
     <Button onClick={()=>void copy(`${url}\n${snap.token}`)}>{t(copied?'mcp.server.copied':'mcp.server.copy')}</Button>
     <Button onClick={()=>void host.stop()} disabled={snap.busy} data-testid="mcp-server-stop">{t('mcp.server.stop')}</Button>
    </div>
    <p><small>{t('mcp.server.document')}: {snap.document||t('mcp.server.noDocument')}</small></p>
   </div>
   :<Button variant="primary" onClick={()=>void host.start()} disabled={snap.busy} data-testid="mcp-server-start">{t('mcp.server.start')}</Button>}
  {snap.activity.length>0&&<div className="mt-2" data-testid="mcp-server-activity">
   <strong>{t('mcp.server.activity')}</strong>
   <ul className="m-0 list-none p-0">{snap.activity.map((a,i)=><li key={`${a.at}-${i}`}><small>{new Date(a.at).toLocaleTimeString()} · {a.studio}/{a.tool} · {t(`mcp.outcome.${a.outcome}`)} · {a.ms} ms</small></li>)}</ul>
  </div>}
 </section>;
}
