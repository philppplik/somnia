import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {useEffect,useState} from 'react';
import {getState,useAppStore} from '../../store/appStore';
import {localToolDiagnostics} from '../../lib/agent/localToolLint';
import type {AgentToolDefinition} from '../../lib/agent/types';
export function LocalToolDiagnostics({definitions}:{definitions?:readonly AgentToolDefinition[]}){
 const {t}=useT();const app=useAppStore();const [rows,setRows]=useState<ReturnType<typeof localToolDiagnostics>>([]),[error,setError]=useState('');
 useEffect(()=>{setRows(definitions?localToolDiagnostics(definitions):[]);setError('');},[definitions,app.activeFile,app.activeStudio]);
 const inspect=async()=>{try{const {inspectStudioToolDefinitions}=await import('../../lib/agent/panelBridge');setRows(localToolDiagnostics(inspectStudioToolDefinitions(getState().activeFile)));setError('');}catch(e){setError(t('local.lint.failed'));}};
 return <details><summary>{t('local.lint.title')}</summary><p>{t('local.lint.boundary')}</p>{!definitions&&<Button type="button" onClick={()=>void inspect()}>{t('local.lint.inspect')}</Button>}<ul className="local-tool-reasons">{rows.map((row,index)=><li key={row.name+index}><code>{row.name}</code>: {t('local.lint.'+row.tier)} - {t(row.offered?'local.lint.eligible':'local.lint.omitted')}{row.reasons.length>0&&<ul className="local-tool-reasons local-tool-reasons-nested">{row.reasons.map(reason=><li key={reason}>{t('local.lint.reason.'+reason)}</li>)}</ul>}</li>)}</ul>{error&&<p role="alert">{error}</p>}</details>;
}
