import type {AgentBoardPort} from './contracts';
let port:AgentBoardPort|null=null;const listeners=new Set<()=>void>();
export function registerAgentBoardPort(next:AgentBoardPort){port=next;listeners.forEach(f=>f());return()=>{if(port===next){port=null;listeners.forEach(f=>f());}};}
export const getAgentBoardPort=()=>port;
export const subscribeAgentBoardPort=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
