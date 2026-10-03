import {File,FileCode,FileText,Folder} from 'lucide-react';
import {openFileTab,patchState,useAppStore} from '../store/appStore';
import {cn} from '../lib/cn';
const icon=(f:string)=>/\.(html?|css|[jt]sx?)$/i.test(f)?FileCode:/\.(md|txt)$/i.test(f)?FileText:File;
/** Project file tree for the left sidebar. A click opens the file in a tab and reveals the code pane. */
export function FilesPanel(){
 const s=useAppStore();const paths=Object.keys(s.files).sort((a,b)=>a.localeCompare(b));
 const rows:{path:string;name:string;depth:number;dir:boolean}[]=[];const seen=new Set<string>();
 for(const path of paths){const parts=path.split('/');parts.forEach((name,i)=>{const p=parts.slice(0,i+1).join('/');if(i<parts.length-1){if(!seen.has(p)){seen.add(p);rows.push({path:p,name,depth:i,dir:true});}}else rows.push({path,name,depth:i,dir:false});});}
 if(!paths.length)return <p className="p-6 text-xs text-ink-2">No project files yet.</p>;
 return <nav aria-label="Project files" className="flex flex-col gap-0.5 p-2">{rows.map(r=>{const Icon=r.dir?Folder:icon(r.name);return r.dir
  ?<div key={r.path} className="flex h-8 items-center gap-2 px-2 text-xs text-ink-3" style={{paddingLeft:8+r.depth*14}}><Icon size={14}/>{r.name}</div>
  :<button key={r.path} aria-label={`Open ${r.path}`} aria-current={r.path===s.activeFile} className={cn('flex h-8 items-center gap-2 rounded-sm border-0 bg-transparent px-2 text-left text-xs text-ink-2 hover:bg-hover',r.path===s.activeFile&&'bg-accent-soft text-ink')} style={{paddingLeft:8+r.depth*14}} onClick={()=>{openFileTab(r.path);if(s.viewMode==='design')patchState({viewMode:'split'});}}><Icon size={14}/><span className="truncate">{r.name}</span></button>;})}</nav>;
}
