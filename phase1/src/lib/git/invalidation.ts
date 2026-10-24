/** Watcher hints only: never approval, never a replacement for exact-content validation. */
export interface GitInvalidation {projectId:string;generation:number;watcherFailed:boolean}
export interface InvalidationPort {
 listen(event:string,handler:(event:{payload:GitInvalidation})=>void):Promise<()=>void>;
}
/** Installs a project-scoped listener. Safe even when disposal races async registration. */
export function watchGitInvalidation(port:InvalidationPort,projectId:string,onInvalidate:(event:GitInvalidation)=>void):()=>void {
 let disposed=false,off:(()=>void)|undefined,last=-1;
 port.listen('somnia://git-invalidated',({payload})=>{
  if(disposed||payload.projectId!==projectId||!Number.isSafeInteger(payload.generation)||payload.generation<=last)return;
  last=payload.generation;onInvalidate(payload);
 }).then(stop=>{if(disposed)stop();else off=stop;}).catch(()=>{/* Manual refresh remains available when native event registration fails. */});
 return()=>{disposed=true;off?.();};
}
