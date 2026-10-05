import {decodeFileBytes} from './textEncoding';
import type {FilePort,FileEvent,Read,Revision,Recovery} from './fileAdapter';
/** Browser storage port over the File System Access API (ADR-002, option B). Same commands and payloads as the native contract. */
type Journal={get(key:string):Promise<{content:string;clientRevision:number}|undefined>;put(key:string,value:{content:string;clientRevision:number}):Promise<void>;delete(key:string):Promise<void>;keys(prefix:string):Promise<string[]>};
export interface WebFsOptions{pickDirectory?:()=>Promise<FileSystemDirectoryHandle|null>;journal?:Journal;maxFiles?:number;handles?:HandleStore;connectNotice?:string;canReconnect?:boolean;volatile?:boolean}
const SKIP=new Set(['node_modules','.git','dist','target']);
const empty:Revision={exists:false,hash:null};
export function webFsSupported(){return typeof window!=='undefined'&&'showDirectoryPicker' in window&&window.isSecureContext;}
async function sha256(text:string){const bytes=new TextEncoder().encode(text);const digest=await crypto.subtle.digest('SHA-256',bytes);return 'sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
export function memoryJournal():Journal{const map=new Map<string,{content:string;clientRevision:number}>();return{async get(k){return map.get(k);},async put(k,v){map.set(k,v);},async delete(k){map.delete(k);},async keys(p){return [...map.keys()].filter(k=>k.startsWith(p));}};}
export function indexedDbJournal():Journal{
 const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('somnia-web-journal',1);r.onupgradeneeded=()=>r.result.createObjectStore('journal');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const run=async<T,>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>)=>{const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction('journal',mode);const req=fn(tx.objectStore('journal'));tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});};
 return{get:k=>run('readonly',s=>s.get(k)),put:async(k,v)=>{await run('readwrite',s=>s.put(v,k));},delete:async k=>{await run('readwrite',s=>s.delete(k));},keys:async p=>(await run('readonly',s=>s.getAllKeys())).map(String).filter(k=>k.startsWith(p))};
}
function parts(path:string){const p=path.split('/');if(!path||path.startsWith('/')||p.some(x=>x===''||x==='.'||x==='..'||x.includes('\\')))throw Error(`Invalid project path: ${path}`);return p;}
async function fileHandle(root:FileSystemDirectoryHandle,path:string,create:boolean){const p=parts(path);let dir=root;for(const name of p.slice(0,-1))dir=await dir.getDirectoryHandle(name,{create});return dir.getFileHandle(p[p.length-1],{create});}
async function readText(root:FileSystemDirectoryHandle,path:string):Promise<string|null>{try{return decodeFileBytes(path,await (await (await fileHandle(root,path,false)).getFile()).arrayBuffer()).text;}catch(e){if(e instanceof DOMException&&(e.name==='NotFoundError'||e.name==='TypeMismatchError'))return null;throw e;}}
async function revisionOf(text:string|null):Promise<Revision>{return text===null?empty:{exists:true,hash:await sha256(text)};}
const same=(a:Revision|undefined,b:Revision)=>!!a&&a.exists===b.exists&&a.hash===b.hash;
/** Remembers the last picked directory handle across reloads (IndexedDB structured clone). The browser still needs a click to re-grant access. */
export interface HandleStore{get():Promise<FileSystemDirectoryHandle|undefined>;put(h:FileSystemDirectoryHandle):Promise<void>}
export function indexedDbHandleStore():HandleStore{
 const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('somnia-web-handles',1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const run=async<T,>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>)=>{const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction('handles',mode);const req=fn(tx.objectStore('handles'));tx.oncomplete=()=>{db.close();resolve(req.result);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});};
 return{get:()=>run('readonly',s=>s.get('last')),put:async h=>{await run('readwrite',s=>s.put(h,'last'));}};
}
export function createWebFsPort(options:WebFsOptions={}):FilePort{
 const journal=options.journal??indexedDbJournal();const handles=options.handles??indexedDbHandleStore();
 const projects=new Map<string,{root:FileSystemDirectoryHandle;name:string}>();
 const listeners=new Set<(event:{payload:FileEvent})=>void>();
 const emit=(event:FileEvent)=>listeners.forEach(fn=>fn({payload:event}));
 const project=(id:unknown)=>{const p=projects.get(String(id));if(!p)throw Error('Project folder is not connected.');return p;};
 const key=(id:string,path:string)=>`${id}\u0000${path}`;
 const event=(projectId:string,path:string,clientRevision:number,state:FileEvent['state'],diskRevision:Revision,error:string|null=null,durability:string|null=null):FileEvent=>({projectId,path,clientRevision,state,diskRevision,error,durability});
 async function walk(dir:FileSystemDirectoryHandle,prefix:string,out:string[],limit:number,depth:number){
  for await(const [name,handle] of (dir as unknown as {entries():AsyncIterable<[string,FileSystemHandle]>}).entries()){
   if(name.startsWith('.')||SKIP.has(name))continue;
   if(handle.kind==='directory'){if(depth<8)await walk(handle as FileSystemDirectoryHandle,`${prefix}${name}/`,out,limit,depth+1);}
   else out.push(prefix+name);
   if(out.length>limit*4)throw Error('This folder has too many files. Pick a smaller project folder.');
  }
 }
 const commands:Record<string,(args:Record<string,unknown>)=>Promise<unknown>>={
  async choose_project(args){
   if(args?.reconnect){
    const saved=await handles.get().catch(()=>undefined);if(!saved)throw Error('No earlier folder is remembered in this browser. Use Open folder.');
    const h=saved as FileSystemDirectoryHandle&{queryPermission?(o:object):Promise<string>;requestPermission?(o:object):Promise<string>};
    let state=await h.queryPermission?.({mode:'readwrite'});if(state!=='granted')state=await h.requestPermission?.({mode:'readwrite'});
    if(state!=='granted')throw Error('The browser did not grant access to the remembered folder.');
    const projectId=crypto.randomUUID();projects.set(projectId,{root:saved,name:saved.name});return{projectId,name:saved.name};
   }
   const root=await (options.pickDirectory?options.pickDirectory():(window as unknown as {showDirectoryPicker(o:object):Promise<FileSystemDirectoryHandle>}).showDirectoryPicker({mode:'readwrite',id:'somnia-project'}).catch(e=>{if(e instanceof DOMException&&e.name==='AbortError')return null;throw e;}));
   if(!root)return null;if(args?.createSubfolder){const n=String(args.createSubfolder);if(!n||n==='.'||n==='..'||/[<>:"\/\\|?*\u0000-\u001f]/.test(n)||/[. ]$/.test(n))throw Error('Folder name is not allowed.');const sub=await root.getDirectoryHandle(n,{create:true});await handles.put(sub).catch(()=>undefined);const projectId=crypto.randomUUID();projects.set(projectId,{root:sub,name:n});return{projectId,name:n};}
   await handles.put(root).catch(()=>undefined);const projectId=crypto.randomUUID();projects.set(projectId,{root,name:root.name});return{projectId,name:root.name};
  },
  async list_files({projectId}){const out:string[]=[];await walk(project(projectId).root,'',out,options.maxFiles??64,0);return out.sort();},
  async read_file({projectId,path}){const {root}=project(projectId);const content=await readText(root,String(path));const revision=await revisionOf(content);return{content,revision,status:event(String(projectId),String(path),0,'saved',revision)} satisfies Read;},
  async stage_edit({projectId,path,content,clientRevision}){
   const id=String(projectId),p=String(path),rev=Number(clientRevision);parts(p);const k=key(id,p);const previous=await journal.get(k);
   if(previous&&rev<=previous.clientRevision)throw Error('Stale edit revision rejected. Edits remain unsaved.');
   await journal.put(k,{content:String(content),clientRevision:rev});
   return event(id,p,rev,'dirty',empty,null,'browser-journal');
  },
  async save_file({projectId,path,expectedRevision}){
   const id=String(projectId),p=String(path),{root}=project(id);const k=key(id,p);const staged=await journal.get(k);
   if(!staged)throw Error(`Nothing staged for ${p}. Save stopped.`);
   const disk=await readText(root,p);const diskRevision=await revisionOf(disk);
   if(!same(expectedRevision as Revision,diskRevision)){const e=event(id,p,staged.clientRevision,'conflict',diskRevision,'The file changed on disk since it was opened.');emit(e);return e;}
   try{
    const writable=await (await fileHandle(root,p,true)).createWritable();await writable.write(staged.content);await writable.close();
    const after=await readText(root,p);const written=await revisionOf(after);
    if(after!==staged.content){const e=event(id,p,staged.clientRevision,'error',written,'Write could not be verified. Edits stay in recovery.');emit(e);return e;}
    const latest=await journal.get(k);if(latest&&latest.clientRevision===staged.clientRevision)await journal.delete(k);
    const e=event(id,p,staged.clientRevision,'saved',written,null,'verified-write');emit(e);return e;
   }catch(error){const e=event(id,p,staged.clientRevision,'error',diskRevision,error instanceof Error?error.message:String(error));emit(e);return e;}
  },
  async delete_file({projectId,path,expectedRevision}){
   const id=String(projectId),p=String(path),{root}=project(id);const disk=await readText(root,p);const rev=await revisionOf(disk);
   if(!same(expectedRevision as Revision,rev))throw Error(`${p} changed on disk since it was opened. Delete cancelled.`);
   if(disk!==null){const names=parts(p);let dir=root;for(const n of names.slice(0,-1))dir=await dir.getDirectoryHandle(n);await dir.removeEntry(names[names.length-1]);}
   await journal.delete(key(id,p));return null;
  },
  async recovery_list({projectId}){const id=String(projectId);const out:Recovery[]=[];for(const k of await journal.keys(id+'\u0000')){const v=await journal.get(k);if(v)out.push({path:k.slice(id.length+1),content:v.content,clientRevision:v.clientRevision});}return out.sort((a,b)=>a.path.localeCompare(b.path));},
  async recovery_read({projectId,path}){const v=await journal.get(key(String(projectId),String(path)));if(!v)throw Error('No recovery snapshot for this file.');return{path:String(path),content:v.content,clientRevision:v.clientRevision} satisfies Recovery;},
  async recovery_restore({projectId,path,clientRevision}){const id=String(projectId),p=String(path),k=key(id,p);const v=await journal.get(k);if(!v)throw Error('No recovery snapshot for this file.');await journal.put(k,{content:v.content,clientRevision:Number(clientRevision)});return event(id,p,Number(clientRevision),'dirty',empty,null,'browser-journal');},
  async recovery_discard({projectId,path}){await journal.delete(key(String(projectId),String(path)));return null;},
  async close_project({projectId,keepRecovery}){const id=String(projectId);if(!keepRecovery)for(const k of await journal.keys(id+'\u0000'))await journal.delete(k);projects.delete(id);return null;}
 };
 return{
  canReconnect:options.canReconnect??true,volatile:options.volatile,
  connectNotice:options.connectNotice??'Folder connected in the browser. Press Ctrl+S to write to disk. Edits are journaled for recovery meanwhile.',
  invoke:async<T,>(command:string,args:Record<string,unknown>={})=>{const fn=commands[command];if(!fn)throw Error(`Unknown command ${command}`);return await fn(args) as T;},
  listen:async<T,>(name:string,handler:(e:{payload:T})=>void)=>{if(name!=='somnia://file-state')return()=>{};const fn=handler as unknown as (e:{payload:FileEvent})=>void;listeners.add(fn);return()=>{listeners.delete(fn);};}
 };
}
