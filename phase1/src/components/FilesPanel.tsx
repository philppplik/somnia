import {useRef,useState,useEffect} from 'react';
import {File,FileCode,FileText,Folder,FilePlus,Pencil,Copy,Trash2} from 'lucide-react';
import {applyOperations,openFileTab,patchState,useAppStore} from '../store/appStore';
import {cn} from '../lib/cn';
import {checkPath,copyName,folderRename,starterFor} from '../lib/fileOps';
const icon=(f:string)=>/\.(html?|css|[jt]sx?)$/i.test(f)?FileCode:/\.(md|txt)$/i.test(f)?FileText:File;
type Edit={mode:'new'|'rename'|'duplicate';path:string;dir?:boolean};
/** Project file tree for the left sidebar. A click opens the file in a tab and reveals the code pane. New, rename, duplicate and delete are undoable editor operations. */
export function FilesPanel(){
 const s=useAppStore();const paths=Object.keys(s.files).sort((a,b)=>a.localeCompare(b));
 const [edit,setEdit]=useState<Edit|null>(null);const [value,setValue]=useState('');const [error,setError]=useState('');const [confirmDelete,setConfirmDelete]=useState<string|null>(null);const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(edit)input.current?.focus();},[edit]);
 const start=(e:Edit)=>{setConfirmDelete(null);setError('');setEdit(e);setValue(e.mode==='new'?'untitled.html':e.mode==='duplicate'?copyName(e.path,paths):e.path);};
 const run=(ops:Parameters<typeof applyOperations>[0],after?:()=>void)=>{try{applyOperations(ops,'canvas');after?.();return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}};
 const commit=()=>{if(!edit)return;const p=value.trim();const bad=checkPath(p);if(bad){setError(bad);return;}
  const ok=edit.mode==='new'?run([{type:'createFile',file:p,text:starterFor(p)}],()=>openFileTab(p))
   :edit.mode==='duplicate'?run([{type:'createFile',file:p,text:s.files[edit.path]??''}],()=>openFileTab(p))
   :edit.dir?run(folderRename(paths,edit.path,p).map(x=>({type:'renameFile' as const,...x})))
   :run([{type:'renameFile',file:edit.path,to:p}],()=>{if(s.activeFile===edit.path)patchState({activeFile:p});});
  if(ok){setEdit(null);setError('');}};
 const del=(path:string,dir:boolean)=>{const targets=dir?paths.filter(f=>f.startsWith(path+'/')):[path];if(run(targets.map(file=>({type:'deleteFile' as const,file}))))setConfirmDelete(null);};
 const rows:{path:string;name:string;depth:number;dir:boolean}[]=[];const seen=new Set<string>();
 for(const path of paths){const parts=path.split('/');parts.forEach((name,i)=>{const p=parts.slice(0,i+1).join('/');if(i<parts.length-1){if(!seen.has(p)){seen.add(p);rows.push({path:p,name,depth:i,dir:true});}}else rows.push({path,name,depth:i,dir:false});});}
 const act=(label:string,I:typeof Pencil,fn:()=>void)=><button aria-label={label} title={label} onClick={fn} className="grid size-6 place-items-center rounded-sm border-0 bg-transparent p-0 text-ink-2 hover:bg-hover"><I size={12}/></button>;
 return <nav aria-label="Project files" className="flex flex-col gap-0.5 p-2">
  <div className="mb-1 flex items-center justify-between px-2"><span className="text-[10px] uppercase tracking-[.08em] text-ink-2">Files</span>{act('New file',FilePlus,()=>start({mode:'new',path:''}))}</div>
  {edit&&<div className="mb-1 flex flex-col gap-1 rounded-sm border border-subtle p-2" role="group" aria-label={edit.mode==='new'?'New file':edit.mode==='rename'?'Rename':'Duplicate'}>
   <input ref={input} aria-label="File path" aria-invalid={!!error} value={value} onChange={e=>{setValue(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEdit(null);}} className="h-7 rounded-sm border border-subtle bg-transparent px-2 font-mono text-[11px]"/>
   <div className="text-[10px] text-ink-2">Use folder/name.ext to put it in a folder.</div>
   {error&&<div role="alert" className="text-[11px] text-[#e5484d]">{error}</div>}
   <div className="flex justify-end gap-1"><button className="h-6 rounded-sm border border-subtle bg-transparent px-2 text-[11px]" onClick={()=>setEdit(null)}>Cancel</button><button className="h-6 rounded-sm border border-subtle bg-transparent px-2 text-[11px]" onClick={commit}>{edit.mode==='new'?'Create':edit.mode==='rename'?'Rename':'Duplicate'}</button></div></div>}
  {!paths.length&&<p className="p-4 text-xs text-ink-2">No project files yet. Use New file.</p>}
  {rows.map(r=>{const Icon=r.dir?Folder:icon(r.name);const pad=8+r.depth*14;
   return <div key={r.path} className="group flex items-center">
    {r.dir?<div className="flex h-8 flex-1 items-center gap-2 px-2 text-xs text-ink-3" style={{paddingLeft:pad}}><Icon size={14}/>{r.name}</div>
    :<button aria-label={`Open ${r.path}`} aria-current={r.path===s.activeFile} className={cn('flex h-8 flex-1 items-center gap-2 overflow-hidden rounded-sm border-0 bg-transparent px-2 text-left text-xs text-ink-2 hover:bg-hover',r.path===s.activeFile&&'bg-accent-soft text-ink')} style={{paddingLeft:pad}} onClick={()=>{openFileTab(r.path);if(s.viewMode==='design')patchState({viewMode:'split'});}}><Icon size={14}/><span className="truncate">{r.name}</span></button>}
    {confirmDelete===r.path?<span className="flex items-center gap-1 pr-1 text-[10px]" role="group" aria-label={`Delete ${r.path}?`}><button className="h-6 rounded-sm border border-subtle bg-transparent px-1.5 text-[#e5484d]" onClick={()=>del(r.path,r.dir)}>Delete</button><button className="h-6 rounded-sm border border-subtle bg-transparent px-1.5" onClick={()=>setConfirmDelete(null)}>Keep</button></span>
    :<span className="flex opacity-0 focus-within:opacity-100 group-hover:opacity-100">{act(`Rename ${r.path}`,Pencil,()=>start({mode:'rename',path:r.path,dir:r.dir}))}{!r.dir&&act(`Duplicate ${r.path}`,Copy,()=>start({mode:'duplicate',path:r.path}))}{act(`Delete ${r.path}`,Trash2,()=>{setEdit(null);setConfirmDelete(r.path);})}</span>}
   </div>;})}
 </nav>;
}
