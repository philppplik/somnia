/**
 * Session file-access grants ("Accept for session"). In-memory only, never persisted:
 * cleared on new chat and project change. Concept: visible and revocable in the agent panel.
 * A grant only skips the per-file access prompt; every edit still lands as a reviewed proposal.
 */
export type SessionGrantAction='read'|'write';
export interface SessionGrant{path:string;actions:SessionGrantAction[];grantedAt:number}
const permissions=new Map<string,{actions:Set<SessionGrantAction>;grantedAt:number}>();
const listeners=new Set<()=>void>();
let version=0;
const notify=()=>{version++;listeners.forEach(fn=>fn());};
export function subscribeSessionGrants(fn:()=>void):()=>void{listeners.add(fn);return()=>{listeners.delete(fn);};}
export function sessionGrantsVersion():number{return version;}
export function listSessionGrants():SessionGrant[]{return[...permissions.entries()].map(([path,g])=>({path,actions:[...g.actions].sort() as SessionGrantAction[],grantedAt:g.grantedAt}));}
export function addSessionGrant(path:string,action:SessionGrantAction,now=Date.now()):void{const g=permissions.get(path)??{actions:new Set<SessionGrantAction>(),grantedAt:now};g.actions.add('read');if(action==='write')g.actions.add('write');g.grantedAt=now;permissions.set(path,g);notify();}
export function revokeSessionGrant(path:string):boolean{const ok=permissions.delete(path);if(ok)notify();return ok;}
export function clearSessionGrants():void{if(permissions.size){permissions.clear();notify();}}
export function hasSessionGrant(path:string,action:SessionGrantAction):boolean{return permissions.get(path)?.actions.has(action)??false;}
