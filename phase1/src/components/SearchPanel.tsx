import {useMemo,useState} from 'react';
import {applyOperations,openFileTab,patchState,useAppStore} from '../store/appStore';
import {searchProject,replaceInProject,type SearchOptions} from '../lib/projectSearch';
import {cn} from '../lib/cn';
/** Project-wide search and replace. Results update as you type; Replace all asks first and is one undo step per file. */
export function SearchPanel(){
 const s=useAppStore();const [q,setQ]=useState('');const [rep,setRep]=useState('');const [o,setO]=useState<SearchOptions>({regex:false,caseSensitive:false,wholeWord:false});
 const res=useMemo(()=>searchProject(s.files,q,o),[s.files,q,o]);
 const groups=useMemo(()=>{const g=new Map<string,typeof res.matches>();for(const m of res.matches)g.set(m.file,[...(g.get(m.file)??[]),m]);return[...g];},[res]);
 const toggle=(k:keyof SearchOptions,label:string,text:string)=><button aria-label={label} title={label} aria-pressed={o[k]} className={cn('h-6 min-w-6 rounded-sm border border-subtle bg-transparent px-1 font-mono text-[11px] text-ink-2',o[k]&&'bg-accent-soft text-ink')} onClick={()=>setO({...o,[k]:!o[k]})}>{text}</button>;
 const open=(file:string)=>{openFileTab(file);if(s.viewMode==='design')patchState({viewMode:'split'});};
 const replaceAll=()=>{const {changed,count}=replaceInProject(s.files,q,rep,o);const names=Object.keys(changed);if(!count)return;
  if(!window.confirm(`Replace ${count} match${count===1?'':'es'} in ${names.length} file${names.length===1?'':'s'}?`))return;
  try{applyOperations(names.map(f=>({type:'replaceSource' as const,file:f,text:changed[f]})),'code','search-replace');patchState({notice:`Replaced ${count} match${count===1?'':'es'} in ${names.length} file${names.length===1?'':'s'}. Undo reverts it.`});}catch(e){patchState({notice:`Replace failed: ${String(e)}`});}};
 return <div className="flex h-full flex-col gap-2 p-3" aria-label="Project search">
  <input aria-label="Search project" placeholder="Search in project" value={q} onChange={e=>setQ(e.target.value)} className="h-8 rounded-sm border border-subtle bg-transparent px-2 text-xs"/>
  <input aria-label="Replace with" placeholder="Replace with" value={rep} onChange={e=>setRep(e.target.value)} className="h-8 rounded-sm border border-subtle bg-transparent px-2 text-xs"/>
  <div className="flex items-center gap-1">{toggle('caseSensitive','Match case','Aa')}{toggle('wholeWord','Whole word','W')}{toggle('regex','Regular expression','.*')}<span className="flex-1"/>
   <button aria-label="Replace all" disabled={!res.matches.length||!!res.error} onClick={replaceAll} className="h-6 rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink-2 disabled:opacity-40">Replace all</button></div>
  <div role="status" className="text-[11px] text-ink-2" data-testid="search-summary">{res.error?res.error:q?`${res.matches.length}${res.truncated?'+':''} match${res.matches.length===1?'':'es'} in ${groups.length} file${groups.length===1?'':'s'}`:'Type to search all project files.'}</div>
  <div className="min-h-0 flex-1 overflow-auto">{groups.map(([file,ms])=><div key={file} className="mb-2"><button className="w-full truncate border-0 bg-transparent p-0 text-left text-[11px] font-medium text-ink" onClick={()=>open(file)}>{file} <span className="text-ink-2">({ms.length})</span></button>
   {ms.slice(0,50).map((m,i)=><button key={i} aria-label={`Open ${file} line ${m.line}`} onClick={()=>open(file)} className="flex w-full gap-2 border-0 bg-transparent px-1 py-0.5 text-left font-mono text-[10px] text-ink-2 hover:bg-hover"><span className="w-8 shrink-0 text-right">{m.line}</span><span className="truncate">{m.lineText.trim()}</span></button>)}{ms.length>50&&<div className="px-1 text-[10px] text-ink-2">+{ms.length-50} more</div>}</div>)}</div>
 </div>;}
