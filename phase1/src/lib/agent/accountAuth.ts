import {invoke,isTauri} from '@tauri-apps/api/core';
import type {AuthProvider} from './providerAuth';
export type AccountState='disconnected'|'pending'|'connected'|'expired';
export type AccountMethod='account'|'api-key';
/** Public metadata only. OAuth secrets stay in the native credential broker. */
export interface AccountStatus {provider:'openai';state:AccountState;method:AccountMethod;expiresAt?:number}
export type AccountCommand='agent_account_status'|'agent_account_start'|'agent_account_cancel'|'agent_account_disconnect'|'agent_account_set_method';
export type AccountTransport=(command:AccountCommand,args:Record<string,string>)=>Promise<unknown>;
export class AccountAuthError extends Error {
 constructor(readonly code:'desktop'|'unsupported'|'unavailable'|'protocol'){super(code);this.name='AccountAuthError';}
}
export function decodeAccountStatus(value:unknown):AccountStatus {
 if(!value||typeof value!=='object')throw new AccountAuthError('protocol');
 const s=value as Record<string,unknown>;
 if(s.provider!=='openai'||!['disconnected','pending','connected','expired'].includes(String(s.state))||!['account','api-key'].includes(String(s.method))||(s.expiresAt!==undefined&&(typeof s.expiresAt!=='number'||!Number.isFinite(s.expiresAt)||s.expiresAt<0)))throw new AccountAuthError('protocol');
 // Explicit projection: never pass arbitrary native fields to React or logs.
 return {provider:'openai',state:s.state as AccountState,method:s.method as AccountMethod,...(s.expiresAt===undefined?{}:{expiresAt:s.expiresAt as number})};
}
export function effectiveAccountStatus(s:AccountStatus,now=Date.now()):AccountStatus {
 return s.state==='connected'&&s.expiresAt!==undefined&&s.expiresAt<=now?{...s,state:'expired'}:s;
}
export function createAccountAuth(transport:AccountTransport,desktop:()=>boolean){
 const call=async(command:AccountCommand,provider:AuthProvider,extra:Record<string,string>={}):Promise<AccountStatus>=>{
  if(provider!=='openai')throw new AccountAuthError('unsupported');
  if(!desktop())throw new AccountAuthError('desktop');
  let value:unknown;try{value=await transport(command,{provider,...extra});}catch{throw new AccountAuthError('unavailable');}
  return effectiveAccountStatus(decodeAccountStatus(value));
 };
 return {
  status:(provider:AuthProvider)=>call('agent_account_status',provider),
  start:(provider:AuthProvider)=>call('agent_account_start',provider),
  cancel:(provider:AuthProvider)=>call('agent_account_cancel',provider),
  disconnect:(provider:AuthProvider)=>call('agent_account_disconnect',provider),
  setMethod:(provider:AuthProvider,method:AccountMethod)=>call('agent_account_set_method',provider,{method}),
 };
}
export const accountAuth=createAccountAuth((command,args)=>invoke(command,args),isTauri);
// Re-query other mounted surfaces after a credential change. No metadata in event payload.
export const ACCOUNT_CHANGED='somnia:agent-account-changed';
export function notifyAccountChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(ACCOUNT_CHANGED));}
