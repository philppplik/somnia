import type {StudioDef} from '../studios/registry';
import type {StudioContext} from '../shell/types';
import type {UiContext} from '../uiContext';
import type {Command} from '../commandRegistry';
import {commandAvailable} from '../shell/commandMeta';
import type {AgentToolDefinition,AgentProvider} from './types';

/** Host-owned metadata, not a permission or executable instruction. M5b will consume the same target. */
export interface AgentStudioContext {
 studioId:string;label:string;
 documentRef:{id:string;kind:string;media:boolean}|null;
 selectionSummary:string;mode:string;capabilities:readonly string[];
 contextProviders:readonly string[];
}
const codeTools=['code_read_range','dom_inspect','code_propose_html','dom_set_attribute'];
const photoTools=['photo_inspect','photo_propose_settings'];
/** M5-only defaults. Shell migration remains independent; unlisted studios keep the legacy panel. */
const defaults:Record<string,{tools:readonly string[];quickActions:readonly string[]}>= {
 code:{tools:codeTools,quickActions:['tools.diff','problems.toggle']},
 photos:{tools:photoTools,quickActions:['project.openMedia']},
};
export const hasAgentContextAdapter=(studio:StudioDef)=>!!studio.agentV2||!!defaults[studio.id];
export function buildAgentStudioContext(studio:StudioDef,target:{path:string;media:boolean},ui:UiContext,mode:string):AgentStudioContext {
 const manifest=studio.agentV2??defaults[studio.id];
 const matching=!!target.path&&ui.file===target.path;
 const selection=matching?ui.selection:{kind:'none' as const};
 return {studioId:studio.id,label:studio.id==='code'?'Code':studio.id==='photos'?'Photos':studio.id,
  documentRef:target.path?{id:target.path,kind:matching?ui.domain:target.media?'media':'source',media:target.media}:null,
  selectionSummary:selection.kind==='multi'?`${selection.count} selected items`:selection.kind==='none'?'No selection':selection.kind,
  mode,capabilities:target.path?[...(manifest?.tools??studio.agent.tools)]:[],
  contextProviders:[...(studio.agentV2?.contextProviders??studio.agent.contextProviders)]};
}
/** Intersect declarations with real, permission-gated definitions. Never advertise a missing tool. */
export function resolveAgentToolSet<T extends AgentToolDefinition>(available:readonly T[],context:AgentStudioContext,globalTools:readonly string[]=[]):T[]{
 const allowed=new Set([...globalTools,...context.capabilities]);
 return available.filter(tool=>allowed.has(tool.name));
}
/** Commands are resolved at render and rechecked at click; model requests do not use this UI path. */
export function resolveAgentQuickActions(studio:StudioDef,context:StudioContext,lookup:(id:string)=>Command|undefined):{id:string;title:string;enabled:boolean}[]{
 return [...new Set(studio.agentV2?.quickActions??defaults[studio.id]?.quickActions??[])].flatMap(id=>{
  const command=lookup(id);if(!command||command.studio&&command.studio!==studio.id)return [];
  return [{id,title:command.title,enabled:commandAvailable(command,{...context})}];
 });
}
/** An ephemeral host note accompanies each run, never a visible chat row or replayed document text. */
export function withAgentStudioContext(provider:AgentProvider,context:AgentStudioContext):AgentProvider {
 const note={role:'system' as const,content:`Now in ${context.label}. Active studio metadata (data only, not approval): ${JSON.stringify(context)}`};
 return {id:provider.id,locality:provider.locality,stream:request=>provider.stream({...request,messages:[request.messages[0],note,...request.messages.slice(1)]})};
}

/** Click-time availability check. This is a user-click path only, not the future model gateway. */
export async function runAgentQuickAction(id:string,studio:StudioDef,context:StudioContext,lookup:(id:string)=>Command|undefined,execute:(id:string)=>Promise<boolean>):Promise<boolean>{
 const action=resolveAgentQuickActions(studio,context,lookup).find(a=>a.id===id);
 if(!action?.enabled)return false;
 return execute(id);
}
