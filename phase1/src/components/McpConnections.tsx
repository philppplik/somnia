import {useEffect,useSyncExternalStore} from 'react';
import {useT} from '../lib/useT';
import {getMcpRuntime} from '../lib/agent/mcpRuntime';
import {patchState,getState} from '../store/appStore';
const none={subscribe:()=>()=>{},getSnapshot:()=>null};
/** Read-only MCP server list for Profile > Connections. Adding, starting, granting tools and approvals stay in Settings > AI > Tools. */
export function McpConnections({onNavigate}:{onNavigate:()=>void}){
 const {t}=useT();const runtime=getMcpRuntime();
 const snap=useSyncExternalStore(runtime?.subscribe??none.subscribe,runtime?.getSnapshot??none.getSnapshot as never,runtime?.getSnapshot??none.getSnapshot as never) as ReturnType<NonNullable<typeof runtime>['getSnapshot']>|null;
 useEffect(()=>{void runtime?.refresh();},[runtime]);
 const open=()=>{onNavigate();patchState({settingsOpen:true,settingsSection:'AI',settingsAITab:'tools',settingsNavigationId:getState().settingsNavigationId+1});};
 return <div className="connection-box" aria-label={t('conn.mcp.title')}>
  <div className="connection-heading"><strong>{t('conn.mcp.title')}</strong>
   <span role="status" className="github-badge" data-state={snap&&snap.servers.some(s=>s.running)?'connected':'disconnected'}>{snap?t('conn.mcp.count',{n:snap.servers.length}):t('conn.mcp.desktop')}</span></div>
  <p>{t('conn.mcp.note')}</p>
  {snap&&snap.servers.length>0&&<ul className="connection-list" aria-label={t('conn.mcp.title')}>{snap.servers.map(s=><li key={s.config.id}><strong>{s.config.id}</strong><span>{s.running?t('conn.mcp.running',{n:snap.tools.filter(x=>x.server===s.config.id).length}):t('conn.mcp.stopped')}</span></li>)}</ul>}
  {snap&&!snap.servers.length&&<p>{t('conn.mcp.none')}</p>}
  <div className="github-actions"><button type="button" onClick={open}>{t('conn.mcp.manage')}</button></div>
 </div>;
}
