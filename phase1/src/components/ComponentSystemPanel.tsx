import {useState} from 'react';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import * as cs from '../lib/componentSystem';
import {LibrarySharePanel} from './LibrarySharePanel';
import {loadLibrary,mutate,newId,selectedSource,insertVariant,switchVariant,findNode} from '../lib/componentActions';
/** Component library with variants. Lives in the Components tab under the HTML elements. */
export function ComponentSystemPanel(){
 const s=useAppStore();const [lib,setLib]=useState(loadLibrary),[name,setName]=useState(''),[mark,setMark]=useState(true);
 const run=(fn:()=>void)=>{try{fn();}catch(error){patchState({notice:`Component action failed: ${error instanceof Error?error.message:String(error)} Nothing was changed.`});}};
 const edit=(fn:(l:cs.Component[])=>cs.Component[],done?:string)=>run(()=>{setLib(mutate(fn));if(done)patchState({notice:done});});
 const inst=cs.instanceOf(findNode(s.selectedElementId)?.attrs);const current=inst?lib.find(c=>c.id===inst.componentId):undefined;
 return <section className="element-library" aria-label="Component library"><h3>Components</h3>
 <p>Save a source block as a component, add variants (for example Primary and Outline), insert one, or switch a placed block to another variant. Stored only in this app profile, not in the project.</p>
 <label>Name<input aria-label="Component or variant name" value={name} maxLength={cs.LIMITS.name} placeholder="Name for new component or variant" onChange={e=>setName(e.target.value)}/></label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={mark} onChange={e=>setMark(e.target.checked)}/>Mark inserted blocks with data-somnia-* attributes (needed for switching)</label>
 <Button variant="outline" disabled={!s.coreConnected} onClick={()=>edit(l=>cs.createComponent(l,name,selectedSource(),newId),`Component "${name.trim()}" saved. Project save state is unchanged.`)}>Save selection as new component</Button>
 {current&&inst&&<div role="group" aria-label="Selected component instance"><h4>Selected: {current.name}</h4><p>Switch this block to:</p>{current.variants.map(v=><Button key={v.id} variant="outline" disabled={v.id===inst.variantId} onClick={()=>run(()=>switchVariant(current,v,mark))}>{v.name}{v.id===inst.variantId?' (current)':''}</Button>)}</div>}
 {!lib.length&&<p>No components yet. Select a block in Layers, name it, and save.</p>}
 {lib.map(c=>{const base=cs.variantOf(c);return <div key={c.id} role="group" aria-label={`Component ${c.name}`}><h4>{c.name}</h4>
  {c.variants.map(v=><div key={v.id}><span>{v.name}{v.id===c.defaultVariantId?' (default)':''}</span> <small>{v.id===base.id?'':cs.describeDiff(cs.classDiff(base.html,v.html))}</small>
   <Button variant="outline" disabled={!s.coreConnected} aria-label={`Insert ${c.name} ${v.name}`} onClick={()=>run(()=>insertVariant(c,v,mark))}>Insert</Button>
   {s.coreConnected&&s.selectedElementId&&<Button variant="outline" aria-label={`Replace the selected block with ${c.name} ${v.name}`} onClick={()=>run(()=>switchVariant(c,v,mark))}>Replace selection</Button>}
   {v.id!==c.defaultVariantId&&<Button aria-label={`Make ${v.name} the default of ${c.name}`} onClick={()=>edit(l=>cs.setDefaultVariant(l,c.id,v.id))}>Make default</Button>}
   {c.variants.length>1&&<Button aria-label={`Remove variant ${v.name} from ${c.name}`} onClick={()=>run(()=>{if(window.confirm(`Remove variant ${v.name} from ${c.name}? Project files are unchanged.`))edit(l=>cs.removeVariant(l,c.id,v.id));})}>Remove</Button>}
  </div>)}
  <Button variant="outline" disabled={!s.coreConnected} onClick={()=>edit(l=>cs.addVariant(l,c.id,name,selectedSource(),newId),`Variant "${name.trim()}" added to ${c.name}.`)}>Add selection as variant</Button>
  <Button aria-label={`Rename ${c.name}`} onClick={()=>edit(l=>cs.renameComponent(l,c.id,name),`Renamed to "${name.trim()}".`)}>Rename</Button>
  <Button aria-label={`Remove ${c.name} from library`} onClick={()=>run(()=>{if(window.confirm(`Remove ${c.name} and all its variants from this personal library? Project files are unchanged.`))edit(l=>cs.removeComponent(l,c.id));})}>Remove component</Button>
 </div>;})}
 <LibrarySharePanel onChange={setLib}/>
 </section>;
}
