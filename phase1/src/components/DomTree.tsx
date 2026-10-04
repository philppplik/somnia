import {useMemo,useState} from 'react';
import {ChevronDown,ChevronRight} from 'lucide-react';
import type {EditorNode} from '@somnia/editor-core';
import {patchState,useAppStore} from '../store/appStore';
import {crumbLabel,pathToId} from '../lib/breadcrumbs';
import {cn} from '../lib/cn';
/** Collapsible DOM tree of the design file. Selecting a node selects it everywhere (Layers, code, canvas); the path to the selection is kept open. */
export function DomTree(){
 const s=useAppStore();const [collapsed,setCollapsed]=useState<Set<string>>(new Set());const [q,setQ]=useState('');
 const forced=useMemo(()=>new Set(pathToId(s.nodes,s.selectedElementId).map(n=>n.id)),[s.nodes,s.selectedElementId]);
 const term=q.trim().toLowerCase();
 const hit=(n:EditorNode):boolean=>!term||crumbLabel(n).toLowerCase().includes(term)||Object.values(n.attrs).some(v=>String(v).toLowerCase().includes(term))||n.children.some(hit);
 const toggle=(id:string)=>setCollapsed(c=>{const x=new Set(c);if(x.has(id))x.delete(id);else x.add(id);return x;});
 const row=(n:EditorNode,depth:number):React.ReactNode=>{if(!hit(n))return null;const open=!!term||forced.has(n.id)||!collapsed.has(n.id);const sel=s.selectedElementId===n.id;
  return <li key={n.id} role="none"><div role="treeitem" aria-expanded={n.children.length?open:undefined} aria-selected={sel} className={cn('flex h-7 items-center gap-1 rounded-sm pr-2 font-mono text-[11px] text-ink-2 hover:bg-hover',sel&&'bg-accent-soft text-accent')} style={{paddingLeft:6+depth*14}}>
   {n.children.length?<button aria-label={`${open?'Collapse':'Expand'} ${crumbLabel(n)}`} onClick={()=>toggle(n.id)} className="grid size-4 cursor-pointer place-items-center border-0 bg-transparent p-0 text-ink-3">{open?<ChevronDown size={12}/>:<ChevronRight size={12}/>}</button>:<span className="size-4"/>}
   <button aria-label={`Select ${crumbLabel(n)}`} onClick={()=>patchState({selectedElementId:n.id,selectedElementIds:[n.id]})} className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-mono text-[11px] text-inherit">{'<'}{crumbLabel(n)}{'>'}</button></div>
   {n.children.length>0&&open&&<ul role="group" className="m-0 list-none p-0">{n.children.map(c=>row(c,depth+1))}</ul>}</li>;};
 return <section aria-label="DOM tree" className="flex h-full min-h-0 flex-col">
  <div className="border-b border-subtle p-3"><input aria-label="Search DOM tree" placeholder="Search tag, id or class" value={q} onChange={e=>setQ(e.target.value)} className="h-7 w-full rounded-sm border border-subtle bg-transparent px-2 text-[11px] text-ink"/></div>
  <ul role="tree" aria-label="Document tree" className="m-0 min-h-0 flex-1 list-none overflow-auto p-2">{s.nodes.length?s.nodes.map(n=>row(n,0)):<li className="p-3 text-[11px] text-ink-3">Open an HTML file to see its DOM tree.</li>}</ul>
 </section>;}
