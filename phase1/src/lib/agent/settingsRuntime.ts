import {configureAgent,setAgentActiveFileAccess,type AgentConfiguration} from './panelBridge';
import {loadAgentSettings,saveAgentSettings} from './settings';
import {getAgentCore} from './core';

/** One live configuration for Settings and the panel. Drafts never affect a run. */
let state={config:{provider:'ollama',model:'',apiKey:'',allowActiveFile:false,customPrompts:[]} as AgentConfiguration,ready:false,saving:false,authBusy:false,running:false,pendingReview:false,error:'',revision:0};
const listeners=new Set<()=>void>();
const update=(patch:Partial<typeof state>)=>{state={...state,...patch};listeners.forEach(f=>f());};
export const agentSettingsSnapshot=()=>state;
export const subscribeAgentSettings=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
let loading:Promise<void>|null=null;
export function initializeAgentSettings():Promise<void>{
 if(loading)return loading;
 loading=loadAgentSettings().then(config=>{configureAgent(config);update({config});}).catch(()=>update({error:'Could not restore Agent settings. Unlock your OS credential store or configure this session again.'})).finally(()=>update({ready:true}));
 return loading;
}
export function setAgentAuthenticationBusy(authBusy:boolean){update({authBusy});}
export async function agentCredentialsChanged(){await getAgentCore().then(core=>core.clear?.());update({revision:state.revision+1});}
export function setAgentActivity(running:boolean,pendingReview:boolean){if(state.running!==running||state.pendingReview!==pendingReview)update({running,pendingReview});}
export function setActiveFileAccess(allowActiveFile:boolean){setAgentActiveFileAccess(allowActiveFile);update({config:{...state.config,allowActiveFile}});}
export async function applyAgentSettings(config:AgentConfiguration):Promise<boolean>{
 if(!state.ready||state.authBusy||state.saving||state.running||state.pendingReview)return false;
 update({saving:true,error:''});
 try{await saveAgentSettings(config);configureAgent(config);update({config:{...config,apiKey:''},revision:state.revision+1});return true;}
 catch{update({error:'Could not save settings. Check your OS credential store and prompt limits. API keys are never saved in plaintext.'});return false;}
 finally{update({saving:false});}
}
