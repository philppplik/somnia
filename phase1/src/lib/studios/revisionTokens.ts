/**
 * Revision tokens for the Smart Open approve/revalidate contract (#166).
 * A token records "what version of a document did the plan see". After the (async) approval the coordinator
 * compares every token with the live value and refuses to commit when anything changed in between.
 * A scope without a registered source yields the token value 'unknown', which never revalidates (fail-safe: re-plan).
 */
export interface RevisionToken{scope:string;value:string|number}
export const UNKNOWN_REVISION='unknown';
const sources=new Map<string,()=>string|number>();
/** Register the live revision getter of a document scope. Returns an unregister function. */
export function registerRevisionSource(scope:string,get:()=>string|number):()=>void{
 sources.set(scope,get);return()=>{if(sources.get(scope)===get)sources.delete(scope);};
}
/** Current token of one scope. Unregistered scope or a throwing source gives the 'unknown' token. */
export function currentToken(scope:string):RevisionToken{
 const get=sources.get(scope);
 if(!get)return{scope,value:UNKNOWN_REVISION};
 try{return{scope,value:get()};}catch{return{scope,value:UNKNOWN_REVISION};}
}
/** One token per distinct scope of the affected documents (deduped, input order). */
export function collectTokens(affected:readonly {token:RevisionToken}[]):RevisionToken[]{
 const seen=new Set<string>();const out:RevisionToken[]=[];
 for(const a of affected){const k=a.token.scope+'\u0000'+String(a.token.value);if(seen.has(k))continue;seen.add(k);out.push(a.token);}
 return out;
}
/** True only when every token is known and equal to the live value of its scope. */
export function tokensCurrent(tokens:readonly RevisionToken[]):boolean{
 for(const t of tokens){
  if(t.value===UNKNOWN_REVISION)return false;
  const now=currentToken(t.scope);
  if(now.value===UNKNOWN_REVISION||now.value!==t.value)return false;
 }
 return true;
}
const ids=new WeakMap<object,number>();let nextId=1;
/** Stable numeric identity of an immutable-by-replacement object (for stores that replace state objects on every change). */
export function objectRevision(o:object):number{let v=ids.get(o);if(v===undefined){v=nextId++;ids.set(o,v);}return v;}
/** Test helper: forget all sources. */
export function resetRevisionSources():void{sources.clear();}
