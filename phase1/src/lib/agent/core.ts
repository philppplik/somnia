export * from './coreTypes';
import type {AgentCore} from './coreTypes';
let active:AgentCore|null=null;
export function setAgentCore(core:AgentCore|null){active=core;}
export async function getAgentCore():Promise<AgentCore>{
 if(active)return active;
 const {realCore}=await import('./panelBridge');return realCore;
}
