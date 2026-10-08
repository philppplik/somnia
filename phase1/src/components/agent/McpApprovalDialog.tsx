import {useEffect,useSyncExternalStore} from 'react';
import {patchState} from '../../store/appStore';
import {ShieldAlert} from 'lucide-react';
import {ConfirmShell} from '../ConfirmShell';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {getMcpRuntime,type McpRuntime} from '../../lib/agent/mcpRuntime';
const noop=()=>()=>{};const empty=()=>null;
/** One decision per call. Shows exactly what will be sent to the external tool. Closing or Escape means "no". */
export function McpApprovalDialog({runtime=getMcpRuntime()}:{runtime?:McpRuntime|null}){
 const {t}=useT();
 const snap=useSyncExternalStore(runtime?.subscribe??noop,runtime?.getSnapshot??empty,runtime?.getSnapshot??empty);
 const req=snap?.pending[0];
 /* A modal Settings dialog would hide this one (inert page). The decision must be visible, so Settings closes. */
 useEffect(()=>{if(req)patchState({settingsOpen:false});},[req?.id]);
 if(!runtime||!req)return null;
 let args=JSON.stringify(req.args,null,2);if(args.length>4000)args=args.slice(0,4000)+'\n…';
 return <ConfirmShell open onCancel={()=>runtime.decide(req.id,false)} tone="warning" Icon={ShieldAlert} alert ariaLabel={t('mcp.approve.title')} title={t('mcp.approve.title')} description={t('mcp.approve.desc',{tool:req.tool,server:req.server})}
  body={<pre data-testid="mcp-approval-args" className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{args}</pre>}
  footer={<><Button onClick={()=>runtime.decide(req.id,false)} data-testid="mcp-deny">{t('mcp.approve.deny')}</Button><Button variant="primary" onClick={()=>runtime.decide(req.id,true)} data-testid="mcp-allow">{t('mcp.approve.allow')}</Button></>}/>;}
