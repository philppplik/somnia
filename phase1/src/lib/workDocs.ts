/** Open work across all studios: one place to ask what is unsaved, save it, or close it. Studios register a provider; nothing here knows a studio's internals. */
export interface WorkDoc{studio:string;name:string}
export interface WorkProvider{
 studio:string;
 /** Names with unsaved changes. */
 dirty():string[];
 /** True when the document is no longer dirty afterwards. False (cancelled dialog, error) keeps it open and dirty. */
 save(name:string):Promise<boolean>;
 /** Throws away unsaved changes where the studio can. Returns names it could not discard. */
 discard():string[];
 /** Closes every open document of this studio without asking. Callers offer save or discard first. */
 closeAll():void;
 /** Count of open documents, dirty or not. */
 openCount():number;
}
const providers=new Map<string,WorkProvider>();
export function registerWorkProvider(p:WorkProvider){providers.set(p.studio,p);return()=>{if(providers.get(p.studio)===p)providers.delete(p.studio);};}
export const listWorkProviders=()=>[...providers.values()];
export const dirtyDocs=():WorkDoc[]=>listWorkProviders().flatMap(p=>p.dirty().map(name=>({studio:p.studio,name})));
export const openDocCount=()=>listWorkProviders().reduce((n,p)=>n+p.openCount(),0);
/** Component-bound savers (they need a mounted editor). Keyed by studio and document name. */
const savers=new Map<string,()=>Promise<boolean>>();
const key=(studio:string,name:string)=>studio+'\u0000'+name;
export function registerDocSaver(studio:string,name:string,fn:()=>Promise<boolean>){const k=key(studio,name);savers.set(k,fn);return()=>{if(savers.get(k)===fn)savers.delete(k);};}
export async function waitForSaver(studio:string,name:string,ms=3000){const k=key(studio,name);const end=Date.now()+ms;
 while(Date.now()<end){const f=savers.get(k);if(f)return f;await new Promise(r=>setTimeout(r,50));}
 return null;}
export interface SaveAllResult{saved:WorkDoc[];failed:WorkDoc[];skipped:WorkDoc[]}
/** Saves one document after another. The first one that is not saved (dialog cancelled, error) stops the run; the rest are reported as skipped. */
export async function saveAllDocs():Promise<SaveAllResult>{
 const result:SaveAllResult={saved:[],failed:[],skipped:[]};const queue=dirtyDocs();
 for(let i=0;i<queue.length;i++){const d=queue[i];const p=providers.get(d.studio)!;
  if(!p.dirty().includes(d.name)){result.saved.push(d);continue;}
  let ok=false;try{ok=await p.save(d.name);}catch{ok=false;}
  if(ok)result.saved.push(d);else{result.failed.push(d);result.skipped.push(...queue.slice(i+1));break;}}
 return result;}
/** Discards unsaved changes and closes everything. Returns names that could not be discarded. */
export function discardAndCloseAll():string[]{const left:string[]=[];for(const p of listWorkProviders()){left.push(...p.discard());p.closeAll();}return left;}
export function closeAllDocs(){for(const p of listWorkProviders())p.closeAll();}
