import {useT} from '../lib/useT';
import {useState} from 'react';
import {ComponentFieldBinding,ComponentInstanceFields} from './ComponentPropsPanel';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import * as cs from '../lib/componentSystem';
import {VariantTools} from './VariantTools';
import {LibrarySharePanel} from './LibrarySharePanel';
import {loadLibrary,mutate,newId,selectedSource,insertVariant,switchVariant,findNode} from '../lib/componentActions';
/** Component library with variants. Lives in the Components tab under the HTML elements. */
export function ComponentSystemPanel(){
 const {t}=useT();
 const s=useAppStore();const [lib,setLib]=useState(loadLibrary),[name,setName]=useState(''),[mark,setMark]=useState(true);
 const run=(fn:()=>void)=>{try{fn();}catch(error){patchState({notice:t('panels.components.failed',{error:error instanceof Error?error.message:String(error)})});}};
 const edit=(fn:(l:cs.Component[])=>cs.Component[],done?:string)=>run(()=>{setLib(mutate(fn));if(done)patchState({notice:done});});
 const inst=cs.instanceOf(findNode(s.selectedElementId)?.attrs);const current=inst?lib.find(c=>c.id===inst.componentId):undefined;
 return <section className="element-library [&_button]:whitespace-normal! [&_button]:h-auto! [&_button]:min-h-8 [&_button]:max-w-full [&_button]:py-1.5!" aria-label={t('panels.components.componentLibrary')}><h3>{t('panels.components.components')}</h3>
 <p>{t('panels.components.saveASourceBlockAs')}</p>
 <label>{t('panels.components.name')}<input aria-label={t('panels.components.componentOrVariantName')} value={name} maxLength={cs.LIMITS.name} placeholder={t('panels.components.nameForNewComponentOr')} onChange={e=>setName(e.target.value)}/></label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={mark} onChange={e=>setMark(e.target.checked)}/>{t('panels.components.markInsertedBlocksWithData')}</label>
 <ComponentFieldBinding enabled={s.coreConnected&&!!s.selectedElementId} run={run}/>
 <Button variant="outline" disabled={!s.coreConnected} onClick={()=>edit(l=>cs.createComponent(l,name,selectedSource(),newId),t('panels.components.saved',{name:name.trim()}))}>{t('panels.components.saveSelectionAsNewComponent')}</Button>
 {current&&inst&&<div role="group" aria-label={t('panels.components.selectedComponentInstance')}><h4>{t('panels.components.selected',{name:current.name})}</h4><p>{t('panels.components.switchThisBlockTo')}</p>{current.variants.map(v=><Button key={v.id} variant="outline" disabled={v.id===inst.variantId} onClick={()=>run(()=>switchVariant(current,v,mark))}>{v.name}{v.id===inst.variantId?t('panels.components.current'):''}</Button>)}<ComponentInstanceFields html={selectedSource()} component={current} run={run}/></div>}
 {!lib.length&&<p>{t('panels.components.noComponentsYetSelectA')}</p>}
 {lib.map(c=>{const base=cs.variantOf(c);return <div key={c.id} role="group" aria-label={t('panels.components.component',{name:c.name})}><h4>{c.name}</h4>
  {c.variants.map(v=><div key={v.id}><span>{v.name}{v.id===c.defaultVariantId?t('panels.components.default'):''}</span> <small>{v.id===base.id?'':cs.describeDiff(cs.classDiff(base.html,v.html))}</small>
   <Button variant="outline" disabled={!s.coreConnected} aria-label={t('panels.components.insert',{component:c.name,variant:v.name})} onClick={()=>run(()=>insertVariant(c,v,mark))}>{t('panels.components.insertLabel')}</Button>
   {s.coreConnected&&s.selectedElementId&&<Button variant="outline" aria-label={t('panels.components.replace',{component:c.name,variant:v.name})} onClick={()=>run(()=>switchVariant(c,v,mark))}>{t('panels.components.replaceSelection')}</Button>}
   {v.id!==c.defaultVariantId&&<Button aria-label={t('panels.components.makeDefault',{component:c.name,variant:v.name})} onClick={()=>edit(l=>cs.setDefaultVariant(l,c.id,v.id))}>{t('panels.components.makeDefaultLabel')}</Button>}
   {c.variants.length>1&&<Button aria-label={t('panels.components.removeVariant',{component:c.name,variant:v.name})} onClick={()=>run(()=>{if(window.confirm(t('panels.components.confirmVariant',{component:c.name,variant:v.name})))edit(l=>cs.removeVariant(l,c.id,v.id));})}>{t('panels.components.removeLabel')}</Button>}
   <VariantTools component={c} variant={v} edit={edit} run={run}/>
  </div>)}
  <Button variant="outline" disabled={!s.coreConnected} onClick={()=>edit(l=>cs.addVariant(l,c.id,name,selectedSource(),newId),t('panels.components.variantAdded',{component:c.name,variant:name.trim()}))}>{t('panels.components.addSelectionAsVariant')}</Button>
  <Button aria-label={t('panels.components.rename',{name:c.name})} onClick={()=>edit(l=>cs.renameComponent(l,c.id,name),t('panels.components.renamed',{name:name.trim()}))}>{t('panels.components.renameLabel')}</Button>
  <Button aria-label={t('panels.components.remove',{name:c.name})} onClick={()=>run(()=>{if(window.confirm(t('panels.components.confirmRemove',{name:c.name})))edit(l=>cs.removeComponent(l,c.id));})}>{t('panels.components.removeComponent')}</Button>
 </div>;})}
 <LibrarySharePanel onChange={setLib}/>
 </section>;
}
