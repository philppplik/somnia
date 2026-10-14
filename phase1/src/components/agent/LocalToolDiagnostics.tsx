import {Button} from '../ui/button';
import {useEffect,useState} from 'react';
import {getState,useAppStore} from '../../store/appStore';
import {localToolDiagnostics} from '../../lib/agent/localToolLint';
import type {AgentToolDefinition} from '../../lib/agent/types';
const reasons:Record<string,string>={'$ref':'Schema references are not supported','oneOf':'Alternative schema branches (oneOf)','anyOf':'Alternative schema branches (anyOf)','allOf':'Combined schema branches (allOf)','array-of-complex':'Array items are missing, objects or nested arrays','nested-depth-over-2':'Schema nesting exceeds two levels','properties-over-8':'Object has more than eight properties','description-over-400':'Description exceeds 400 characters','schema-too-large':'Schema traversal exceeds 500 entries','tool-limit-eight':'Only the first eight eligible tools are offered'};
export function LocalToolDiagnostics({definitions}:{definitions?:readonly AgentToolDefinition[]}){
 const app=useAppStore();const [rows,setRows]=useState<ReturnType<typeof localToolDiagnostics>>([]),[error,setError]=useState('');
 useEffect(()=>{setRows(definitions?localToolDiagnostics(definitions):[]);setError('');},[definitions,app.activeFile,app.activeStudio]);
 const inspect=async()=>{try{const {inspectStudioToolDefinitions}=await import('../../lib/agent/panelBridge');setRows(localToolDiagnostics(inspectStudioToolDefinitions(getState().activeFile)));setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 return <details><summary>Local tool schema compatibility</summary><p>Schema advice, not model quality or permission. Complex tools are omitted; the first eight eligible tools keep their original schemas and host order. Active source catalog only; studio scope and permissions may narrow the actual request further.</p>{!definitions&&<Button type="button" onClick={()=>void inspect()}>Inspect active source tool schemas</Button>}<ul className="local-tool-reasons">{rows.map((row,index)=><li key={row.name+index}><code>{row.name}</code>: {row.tier} - {row.offered?'schema eligible':'omitted'}{row.reasons.length>0&&<ul className="local-tool-reasons local-tool-reasons-nested">{row.reasons.map(reason=><li key={reason}>{reasons[reason]??reason}</li>)}</ul>}</li>)}</ul>{error&&<p role="alert">{error}</p>}</details>;
}
