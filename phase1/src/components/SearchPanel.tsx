import {useT} from '../lib/useT';
import {useMemo,useState} from 'react';
import {applyOperations,jumpToLine,openFileTab,patchState,useAppStore} from '../store/appStore';
import {searchProject,replaceInProject,type SearchOptions} from '../lib/projectSearch';
import {cn} from '../lib/cn';
/** Project-wide search and replace. Results update as you type; Replace all asks first and is one undo step per file. */
export function SearchPanel(){
 const {t}=useT();
 const s=useAppStore();const [q,setQ]=useState('');const [rep,setRep]=useState('');const [ask,setAsk]=useState(false);const [o,setO]=useState<SearchOptions>({regex:false,caseSensitive:false,wholeWord:false});
 const res=useMemo(()=>searchProject(s.files,q,o),[s.files,q,o]);
 const groups=useMemo(()=>{const g=new Map<string,typeof res.matches>();for(const m of res.matches)g.set(m.file,[...(g.get(m.file)??[]),m]);return[...g];},[res]);
 const toggle=(k:keyof SearchOptions,label:string,text:string)=><button aria-label={label} title={label} aria-pressed={o[k]} className={cn('h-6 min-w-6 rounded-sm border border-subtle bg-transparent px-1 font-mono text-[11px] text-ink-2',o[k]&&'bg-accent-soft text-ink')} onClick={()=>setO({...o,[k]:!o[k]})}>{text}</button>;
 const open=(file:string)=>{openFileTab(file);if(s.viewMode==='design')patchState({viewMode:'split'});};
 const pending=()=>replaceInProject(s.files,q,rep,o);
 const replaceAll=()=>{const {changed,count}=pending();const names=Object.keys(changed);if(!count){setAsk(false);return;}
  try{applyOperations(names.map(f=>({type:'replaceSource' as const,file:f,text:changed[f]})),'code','search-replace');patchState({notice:t('panels.search.replaced',{matches:t('panels.search.matches',{count}),files:t('common.files',{count:names.length})})});}catch(e){patchState({notice:t('panels.search.failed',{error:String(e)})});}setAsk(false);};
 return <div className="flex h-full flex-col gap-2 p-3" aria-label={t('panels.search.projectSearch')}>
  <input aria-label={t('panels.search.searchProject')} placeholder={t('panels.search.searchInProject')} value={q} onChange={e=>setQ(e.target.value)} className="h-8 rounded-sm border border-subtle bg-transparent px-2 text-xs"/>
  <input aria-label={t('panels.search.replaceWith')} placeholder={t('panels.search.replaceWith')} value={rep} onChange={e=>setRep(e.target.value)} className="h-8 rounded-sm border border-subtle bg-transparent px-2 text-xs"/>
  <div className="flex items-center gap-1">{toggle('caseSensitive',t('panels.search.matchCase'),'Aa')}{toggle('wholeWord',t('panels.search.wholeWord'),'W')}{toggle('regex',t('panels.search.regularExpression'),'.*')}<span className="flex-1"/>
   <button aria-label={t('panels.search.replaceAll')} disabled={!res.matches.length||!!res.error} onClick={()=>setAsk(true)} className="h-6 rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink-2 disabled:opacity-40">{t('panels.search.replaceAll')}</button></div>
  {ask&&(()=>{const {changed,count}=pending();const n=Object.keys(changed).length;return <div role="group" aria-label={t('panels.search.confirmReplace')} className="flex items-center gap-2 rounded-sm border border-subtle p-2 text-[11px]"><span className="flex-1">{t('panels.search.confirm',{matches:t('panels.search.matches',{count}),files:t('common.files',{count:n})})}</span><button className="h-6 rounded-sm border border-subtle bg-transparent px-2" onClick={()=>setAsk(false)}>{t('panels.search.cancel')}</button><button className="h-6 rounded-sm border border-subtle bg-transparent px-2" onClick={replaceAll}>{t('panels.search.replace')}</button></div>;})()}<div role="status" className="text-[11px] text-ink-2" data-testid="search-summary">{res.error?res.error:q?t('panels.search.summary',{matches:t('panels.search.matches',{count:res.matches.length})+(res.truncated?'+':''),files:t('common.files',{count:groups.length})}):t('panels.search.typeToSearchAllProject')}</div>
  <div className="min-h-0 flex-1 overflow-auto">{groups.map(([file,ms])=><div key={file} className="mb-2"><button className="w-full truncate border-0 bg-transparent p-0 text-left text-[11px] font-medium text-ink" onClick={()=>open(file)}>{file} <span className="text-ink-2">({ms.length})</span></button>
   {ms.slice(0,50).map((m,i)=><button key={i} aria-label={t('panels.search.openLine',{file,line:m.line})} onClick={()=>jumpToLine(file,m.line,(m as {col?:number}).col??1)} className="flex w-full gap-2 border-0 bg-transparent px-1 py-0.5 text-left font-mono text-[10px] text-ink-2 hover:bg-hover"><span className="w-8 shrink-0 text-right">{m.line}</span><span className="truncate">{m.lineText.trim()}</span></button>)}{ms.length>50&&<div className="px-1 text-[10px] text-ink-2">{t('panels.search.more',{count:ms.length-50})}</div>}</div>)}</div>
 </div>;}
