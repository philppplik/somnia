import {invoke,isTauri} from '@tauri-apps/api/core';
export type GithubState='disconnected'|'pending'|'connected';
/** Public metadata only. The OAuth token and device code stay in the native host. */
export interface GithubStatus {state:GithubState;login?:string;name?:string;userCode?:string;verificationUri?:string}
export type GithubCommand='github_account_status'|'github_account_start'|'github_account_cancel'|'github_account_disconnect';
export type GithubTransport=(command:GithubCommand)=>Promise<unknown>;
export class GithubAuthError extends Error {
 constructor(readonly code:'desktop'|'unavailable'|'protocol'){super(code);this.name='GithubAuthError';}
}
const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max?v:undefined;
export function decodeGithubStatus(value:unknown):GithubStatus {
 if(!value||typeof value!=='object')throw new GithubAuthError('protocol');
 const s=value as Record<string,unknown>;
 if(s.provider!=='github'||!['disconnected','pending','connected'].includes(String(s.state)))throw new GithubAuthError('protocol');
 // Explicit projection: unknown native fields (a token, say) never reach React or logs.
 const login=str(s.login,39),name=str(s.name,200),userCode=str(s.userCode,32);
 return {state:s.state as GithubState,...(login?{login}:{}),...(name?{name}:{}),...(userCode?{userCode}:{}),...(s.verificationUri==='https://github.com/login/device'?{verificationUri:s.verificationUri}:{})};
}
export function createGithubAuth(transport:GithubTransport,desktop:()=>boolean){
 const call=async(command:GithubCommand)=>{
  if(!desktop())throw new GithubAuthError('desktop');
  let value:unknown;try{value=await transport(command);}catch{throw new GithubAuthError('unavailable');}
  return decodeGithubStatus(value);
 };
 return {status:()=>call('github_account_status'),start:()=>call('github_account_start'),cancel:()=>call('github_account_cancel'),disconnect:()=>call('github_account_disconnect')};
}
export const githubAuth=createGithubAuth(c=>invoke(c),isTauri);
export const GITHUB_CHANGED='somnia:github-account-changed';
export function notifyGithubChanged(){if(typeof window!=='undefined')window.dispatchEvent(new Event(GITHUB_CHANGED));}
