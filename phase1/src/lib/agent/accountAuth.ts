import {invoke,isTauri} from '@tauri-apps/api/core';
/** Renderer side of the OpenAI account (OAuth) contract. Tokens never reach this code: only status. */
export type AccountState='disconnected'|'pending'|'connected'|'expired';
export type AccountMethod='account'|'api-key';
export interface AccountStatus{provider:'openai';state:AccountState;method:AccountMethod;expiresAt?:number}
export type AccountFailure='unavailable'|'unsupported'|'native-only';
const MESSAGES:Record<AccountFailure,string>={
 unavailable:'Could not update the OpenAI account. Check the OS credential store and try again.',
 unsupported:'Account sign-in is only available for OpenAI.',
 'native-only':'OpenAI account sign-in needs the desktop app.'
};
/** Generic message only: raw native errors can name credential-store internals. */
export class AccountAuthError extends Error{constructor(readonly code:AccountFailure){super(MESSAGES[code]);this.name='AccountAuthError';}}
type Invoke=<T>(command:string,args:Record<string,unknown>)=>Promise<T>;
export interface AccountDeps{invoke?:Invoke;isTauri?:()=>boolean}
const STATES:readonly string[]=['disconnected','pending','connected','expired'];
export function parseAccountStatus(value:unknown):AccountStatus{
 const v=value as Record<string,unknown>|null;
 if(!v||typeof v!=='object'||v.provider!=='openai'||!STATES.includes(v.state as string)||(v.method!=='account'&&v.method!=='api-key'))throw new AccountAuthError('unavailable');
 const out:AccountStatus={provider:'openai',state:v.state as AccountState,method:v.method};
 if(typeof v.expiresAt==='number'&&Number.isFinite(v.expiresAt))out.expiresAt=v.expiresAt;
 return out; // unknown fields (tokens, e-mail) are dropped by construction
}
async function call(command:string,provider:string,extra:Record<string,unknown>,deps:AccountDeps):Promise<AccountStatus>{
 if(provider!=='openai')throw new AccountAuthError('unsupported');
 if(!(deps.isTauri??isTauri)())throw new AccountAuthError('native-only');
 try{return parseAccountStatus(await (deps.invoke??(invoke as Invoke))(command,{provider,...extra}));}
 catch{throw new AccountAuthError('unavailable');}
}
export const accountStatus=(provider:string,deps:AccountDeps={})=>call('agent_account_status',provider,{},deps);
export const accountStart=(provider:string,deps:AccountDeps={})=>call('agent_account_start',provider,{},deps);
export const accountCancel=(provider:string,deps:AccountDeps={})=>call('agent_account_cancel',provider,{},deps);
/** Deletes OAuth tokens only; an API key stays stored. */
export const accountDisconnect=(provider:string,deps:AccountDeps={})=>call('agent_account_disconnect',provider,{},deps);
/** Explicit user choice; the backend never switches method on its own. */
export const accountSetMethod=(provider:string,method:AccountMethod,deps:AccountDeps={})=>{
 if(method!=='account'&&method!=='api-key')return Promise.reject(new AccountAuthError('unavailable'));
 return call('agent_account_set_method',provider,{method},deps);
};
/** UI polls every 2s, only while a login is pending or the account is connected (expiry/refresh changes). */
export const ACCOUNT_POLL_MS=2000;
export const shouldPollAccount=(s:AccountStatus)=>s.state==='pending'||s.state==='connected';
