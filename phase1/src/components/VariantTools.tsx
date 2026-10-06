import {useT} from '../lib/useT';
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
 const {t}=useT();
 const [mode,setMode]=useState<Mode>('idle'),[html,setHtml]=useState(v.html),[name,setName]=useState(v.name),[other,setOther]=useState('');
 const others=c.variants.filter(x=>x.id!==v.id);
 const open=(m:Mode)=>{setHtml(v.html);setName(v.name);setOther(others[0]?.id??'');setMode(m);};
 const problem=mode==='edit'?variantHtmlProblem(html):null;
 const target=others.find(x=>x.id===other)??others[0];
 let diffView:ReactNode=null;
 if(mode==='compare'&&target){
  try{const d=diffVariants(target.html,v.html);diffView=<div><p role="status">{diffSummary(d)}</p><pre data-copyable aria-label={t('panels.variants.differences',{from:target.name,to:v.name})}>{d.map((l,i)=><div key={i} data-diff={l.kind}>{l.kind==='added'?'+ ':l.kind==='removed'?'- ':'  '}{l.text}</div>)}</pre></div>;}
  catch(e){diffView=<p role="alert">{e instanceof Error?e.message:String(e)}</p>;}
 }
 const label=`${c.name} ${v.name}`;
 return <div role="group" aria-label={t('panels.variants.tools',{label})}>
  <Button variant="outline" aria-label={t('panels.variants.edit',{label})} onClick={()=>open(mode==='edit'?'idle':'edit')}>{t('panels.variants.editLabel')}</Button>
  <Button variant="outline" aria-label={t('panels.variants.rename',{label})} onClick={()=>open(mode==='rename'?'idle':'rename')}>{t('panels.variants.renameVariant')}</Button>
  <Button variant="outline" aria-label={t('panels.variants.duplicate',{label})} onClick={()=>edit(l=>duplicateVariant(l,c.id,v.id,newId),t('panels.variants.duplicated',{name:v.name}))}>{t('panels.variants.duplicateLabel')}</Button>
  {others.length>0&&<Button variant="outline" aria-label={t('panels.variants.compare',{label})} onClick={()=>open(mode==='compare'?'idle':'compare')}>{t('panels.variants.compareLabel')}</Button>}
  {mode==='edit'&&<div>
   <label>{t('panels.variants.htmlLabel',{name:v.name})}<textarea aria-label={t('panels.variants.html',{label})} rows={8} spellCheck={false} value={html} onChange={e=>setHtml(e.target.value)}/></label>
   {problem&&<p role="alert">{problem}</p>}
   <Button variant="outline" aria-label={t('panels.variants.useBlock',{label})} onClick={()=>run(()=>setHtml(selectedSource()))}>{t('panels.variants.useSelectedBlock')}</Button>
   <Button aria-label={t('panels.variants.save',{label})} disabled={!!problem||isUnchanged([c],c.id,v.id,html)} onClick={()=>{edit(l=>saveVariantHtml(l,c.id,v.id,html),t('panels.variants.saved',{name:v.name}));setMode('idle');}}>{t('panels.variants.saveLabel')}</Button>
   <Button aria-label={t('panels.variants.cancelEdit',{label})} onClick={()=>setMode('idle')}>{t('panels.variants.cancel')}</Button>
  </div>}
  {mode==='rename'&&<div>
   <label>{t('panels.variants.newNameLabel')}<input aria-label={t('panels.variants.newName',{label})} value={name} maxLength={LIMITS.name} onChange={e=>setName(e.target.value)}/></label>
   <Button aria-label={t('panels.variants.saveName',{label})} disabled={!name.trim()||name.trim()===v.name} onClick={()=>{edit(l=>renameVariant(l,c.id,v.id,name),t('panels.variants.renamed',{name:name.trim()}));setMode('idle');}}>{t('panels.variants.saveNameLabel')}</Button>
   <Button aria-label={t('panels.variants.cancelRename',{label})} onClick={()=>setMode('idle')}>{t('panels.variants.cancel')}</Button>
  </div>}
  {mode==='compare'&&target&&<div>
   <label>{t('panels.variants.compareLabel',{name:v.name})}<select aria-label={t('panels.variants.compareWith',{label})} value={target.id} onChange={e=>setOther(e.target.value)}>{others.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
   {diffView}
   <Button aria-label={t('panels.variants.closeComparison',{label})} onClick={()=>setMode('idle')}>{t('panels.variants.close')}</Button>
  </div>}
 </div>;
}
