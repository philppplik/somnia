import {useState,type ReactNode} from 'react';
import {Button} from './ui/button';
import type {Component,Variant} from '../lib/componentSystem';
import {renameVariant,LIMITS} from '../lib/componentSystem';
import {duplicateVariant,saveVariantHtml,isUnchanged,diffVariants,diffSummary,variantHtmlProblem} from '../lib/variantEditing';
import {newId,selectedSource} from '../lib/componentActions';

interface Props{
 component:Component;variant:Variant;
 /** Applies a change to the stored library (panel's `edit`). Throws are shown by the panel. */
 edit:(fn:(l:Component[])=>Component[],done?:string)=>void;
 run:(fn:()=>void)=>void;
}
type Mode='idle'|'edit'|'rename'|'compare';

/** In-place variant tools: edit HTML, rename, duplicate, compare with another variant. Library only; never touches project files. */
export function VariantTools({component:c,variant:v,edit,run}:Props){
 const [mode,setMode]=useState<Mode>('idle'),[html,setHtml]=useState(v.html),[name,setName]=useState(v.name),[other,setOther]=useState('');
 const others=c.variants.filter(x=>x.id!==v.id);
 const open=(m:Mode)=>{setHtml(v.html);setName(v.name);setOther(others[0]?.id??'');setMode(m);};
 const problem=mode==='edit'?variantHtmlProblem(html):null;
 const target=others.find(x=>x.id===other)??others[0];
 let diffView:ReactNode=null;
 if(mode==='compare'&&target){
  try{const d=diffVariants(target.html,v.html);diffView=<div><p role="status">{diffSummary(d)}</p><pre aria-label={`Differences between ${target.name} and ${v.name}`}>{d.map((l,i)=><div key={i} data-diff={l.kind}>{l.kind==='added'?'+ ':l.kind==='removed'?'- ':'  '}{l.text}</div>)}</pre></div>;}
  catch(e){diffView=<p role="alert">{e instanceof Error?e.message:String(e)}</p>;}
 }
 const label=`${c.name} ${v.name}`;
 return <div role="group" aria-label={`Variant tools ${label}`}>
  <Button variant="outline" aria-label={`Edit ${label}`} onClick={()=>open(mode==='edit'?'idle':'edit')}>Edit</Button>
  <Button variant="outline" aria-label={`Rename variant ${label}`} onClick={()=>open(mode==='rename'?'idle':'rename')}>Rename variant</Button>
  <Button variant="outline" aria-label={`Duplicate ${label}`} onClick={()=>edit(l=>duplicateVariant(l,c.id,v.id,newId),`Variant "${v.name}" duplicated.`)}>Duplicate</Button>
  {others.length>0&&<Button variant="outline" aria-label={`Compare ${label}`} onClick={()=>open(mode==='compare'?'idle':'compare')}>Compare</Button>}
  {mode==='edit'&&<div>
   <label>HTML of {v.name}<textarea aria-label={`HTML of ${label}`} rows={8} spellCheck={false} value={html} onChange={e=>setHtml(e.target.value)}/></label>
   {problem&&<p role="alert">{problem}</p>}
   <Button variant="outline" aria-label={`Use selected block for ${label}`} onClick={()=>run(()=>setHtml(selectedSource()))}>Use selected block</Button>
   <Button aria-label={`Save ${label}`} disabled={!!problem||isUnchanged([c],c.id,v.id,html)} onClick={()=>{edit(l=>saveVariantHtml(l,c.id,v.id,html),`Variant "${v.name}" saved. Blocks already placed in the project are unchanged.`);setMode('idle');}}>Save</Button>
   <Button aria-label={`Cancel editing ${label}`} onClick={()=>setMode('idle')}>Cancel</Button>
  </div>}
  {mode==='rename'&&<div>
   <label>New name<input aria-label={`New name for ${label}`} value={name} maxLength={LIMITS.name} onChange={e=>setName(e.target.value)}/></label>
   <Button aria-label={`Save name for ${label}`} disabled={!name.trim()||name.trim()===v.name} onClick={()=>{edit(l=>renameVariant(l,c.id,v.id,name),`Variant renamed to "${name.trim()}".`);setMode('idle');}}>Save name</Button>
   <Button aria-label={`Cancel renaming ${label}`} onClick={()=>setMode('idle')}>Cancel</Button>
  </div>}
  {mode==='compare'&&target&&<div>
   <label>Compare {v.name} with<select aria-label={`Compare ${label} with`} value={target.id} onChange={e=>setOther(e.target.value)}>{others.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   {diffView}
   <Button aria-label={`Close comparison of ${label}`} onClick={()=>setMode('idle')}>Close</Button>
  </div>}
 </div>;
}
