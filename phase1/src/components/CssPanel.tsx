import {useMemo,useState} from 'react';
import {applyOperations,jumpToLine,patchState,useAppStore} from '../store/appStore';
import {addVariable,listClasses,parseVariables,renameClass,setVariableValue,isCss,type CssVariable} from '../lib/cssTools';
import {cn} from '../lib/cn';
/** CSS tools: custom properties (edit values, add one) and a class manager (usage, rename). Edits go through replaceSource, one undo step each. */
const input='h-7 w-auto! rounded-sm border border-subtle bg-transparent px-2! py-0! text-xs';
const small='h-6 rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink-2 disabled:opacity-40';
export function CssPanel(){
 const s=useAppStore();const [tab,setTab]=useState<'variables'|'classes'>('variables');const [q,setQ]=useState('');
 const vars=useMemo(()=>parseVariables(s.files),[s.files]);const classes=useMemo(()=>listClasses(s.files),[s.files]);
 const [renaming,setRenaming]=useState<string|null>(null);const [to,setTo]=useState('');const [err,setErr]=useState<string|null>(null);
 const [nn,setNn]=useState('--');const [nv,setNv]=useState('');const cssFiles=Object.keys(s.files).filter(isCss);
 const edit=(file:string,text:string,label:string)=>applyOperations([{type:'replaceSource' as const,file,text}],'code',label);
 const setVar=(v:CssVariable,value:string)=>{if(value.trim()===v.value)return;const t=setVariableValue(s.files,v,value);if(t===null){setErr(`"${value}" is not a valid value (no ; { } or comments).`);return;}setErr(null);edit(v.file,t,'css-variable');};
 const add=()=>{const f=cssFiles[0];if(!f){setErr('Add a .css file to the project first.');return;}const t=addVariable(s.files,f,nn.trim(),nv);if(t===null){setErr('Use a name like --brand and a value without ; or braces.');return;}setErr(null);edit(f,t,'css-variable-add');setNn('--');setNv('');};
 const doRename=(from:string)=>{const r=renameClass(s.files,from,to.trim());if('error' in r){setErr(r.error);return;}setErr(null);
  if(!r.count){setRenaming(null);return;}
  applyOperations(Object.entries(r.changed).map(([file,text])=>({type:'replaceSource' as const,file,text})),'code','css-class-rename');
  patchState({notice:`Renamed .${from} to .${to.trim()} (${r.count} places in ${Object.keys(r.changed).length} files). Undo reverts it.`});setRenaming(null);};
 const f=q.trim().toLowerCase();const fv=vars.filter(v=>!f||v.name.includes(f)||v.value.toLowerCase().includes(f));const fc=classes.filter(c=>!f||c.name.toLowerCase().includes(f));
 const tabBtn=(id:'variables'|'classes',label:string)=><button role="tab" aria-selected={tab===id} onClick={()=>{setTab(id);setErr(null);}} className={cn('h-7 flex-1 rounded-sm border-0 bg-transparent text-xs text-ink-2',tab===id&&'bg-accent-soft text-accent')}>{label}</button>;
 return <div className="flex h-full flex-col gap-2 p-3" aria-label="CSS tools">
  <div role="tablist" aria-label="CSS tools" className="flex gap-1">{tabBtn('variables',`Variables (${vars.length})`)}{tabBtn('classes',`Classes (${classes.length})`)}</div>
  <input aria-label="Filter CSS" placeholder={tab==='variables'?'Filter variables':'Filter classes'} value={q} onChange={e=>setQ(e.target.value)} className={input}/>
  {err&&<p role="alert" className="m-0 text-[11px] text-red-600">{err}</p>}
  {tab==='variables'?<>
   <div className="min-h-0 flex-1 overflow-auto">{fv.map(v=><div key={v.file+v.start} className="mb-1.5 flex flex-col gap-0.5">
     <div className="flex items-center gap-1 text-[11px]"><button aria-label={`Show ${v.name} in ${v.file}`} onClick={()=>jumpToLine(v.file,v.line,1)} className="truncate border-0 bg-transparent p-0 text-left font-mono font-medium text-ink">{v.name}</button><span className="flex-1"/><span className="text-ink-3" title={`${v.file}, ${v.scope}`}>{v.scope}</span><span className="text-ink-3">{v.uses}×</span></div>
     <div className="flex items-center gap-1">{/^#([0-9a-f]{3,8})$/i.test(v.value)&&<input type="color" aria-label={`Pick colour for ${v.name}`} value={v.value.length===4?'#'+[...v.value.slice(1)].map(c=>c+c).join(''):v.value.slice(0,7)} onChange={e=>setVar(v,e.target.value)} className="size-6! shrink-0 cursor-pointer border-0 bg-transparent p-0!"/>}
      <input key={v.value} aria-label={`Value of ${v.name}`} defaultValue={v.value} onBlur={e=>setVar(v,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} className={cn(input,'min-w-0 flex-1 font-mono')}/></div></div>)}
    {!fv.length&&<p className="p-3 text-xs text-ink-3">{vars.length?'No matching variables.':'No CSS variables yet. Add one below.'}</p>}</div>
   <div className="flex gap-1" role="group" aria-label="Add variable"><input aria-label="New variable name" value={nn} onChange={e=>setNn(e.target.value)} className={cn(input,'w-24! font-mono')}/><input aria-label="New variable value" placeholder="value" value={nv} onChange={e=>setNv(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add();}} className={cn(input,'min-w-0 flex-1 font-mono')}/><button className={small} onClick={add} disabled={nn.trim().length<3||!nv.trim()}>Add</button></div>
  </>:<div className="min-h-0 flex-1 overflow-auto">{fc.map(c=><div key={c.name} className="mb-1 flex flex-col gap-1">
    <div className="flex items-center gap-1 text-[11px]"><span className="truncate font-mono text-ink">.{c.name}</span><span className="flex-1"/>
     <span className={cn('text-ink-3',c.used&&!c.defined&&'text-amber-600',c.defined&&!c.used&&'text-ink-3')} title="Defined in CSS / used in HTML">{c.defined}d / {c.used}u{c.defined&&!c.used?' unused':''}{c.used&&!c.defined?' undefined':''}</span>
     <button className={small} aria-label={`Rename ${c.name}`} onClick={()=>{setRenaming(c.name);setTo(c.name);setErr(null);}}>Rename</button></div>
    {renaming===c.name&&<div className="flex gap-1" role="group" aria-label={`Rename ${c.name}`}><input autoFocus aria-label="New class name" value={to} onChange={e=>setTo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')doRename(c.name);if(e.key==='Escape')setRenaming(null);}} className={cn(input,'min-w-0 flex-1 font-mono')}/><button className={small} onClick={()=>doRename(c.name)}>Rename</button><button className={small} onClick={()=>{setRenaming(null);setErr(null);}}>Cancel</button></div>}
   </div>)}{!fc.length&&<p className="p-3 text-xs text-ink-3">No matching classes.</p>}</div>}
 </div>;}
