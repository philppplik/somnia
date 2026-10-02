import {useState} from 'react';
import {readComponents,saveComponent,removeComponent,insertComponent} from '../lib/componentLibrary';
import {elements,insertElement} from '../lib/structureCommands';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
export function ElementsPanel(){
 const s=useAppStore();const [saved,setSaved]=useState(readComponents),[name,setName]=useState('');const run=(fn:()=>void)=>{try{fn();}catch(error){patchState({notice:`Library action failed: ${String(error)}. No success is claimed.`});}};
 return <section className="element-library" aria-label="HTML element library"><h3>HTML elements</h3><p>Select a container and insert, or drag an element onto a source container in the canvas. Existing source stays unchanged outside the insertion.</p>
 {elements.map((element,i)=><Button key={element.label} variant="outline" draggable disabled={!s.coreConnected}
 onDragStart={e=>{e.dataTransfer.setData('application/x-somnia-element',String(i));e.dataTransfer.effectAllowed='copy';}}
 onClick={()=>{try{insertElement(i);}catch(error){patchState({notice:String(error)});}}}
 >{element.label}</Button>)}
 <h3>Personal blocks</h3><p>Stored only in this app profile, not synced or in the project. Saved source retains classes; insertion rejects repeated IDs. Form blocks have no connected backend.</p><label>Block name<input aria-label="Block name" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></label><Button variant="outline" disabled={!s.coreConnected} onClick={()=>run(()=>{setSaved(saveComponent(name));setName('');patchState({notice:'Block saved in this app profile. Project save state is unchanged.'});})}>Save selected block</Button>{saved.map(c=><div key={c.id}><Button variant="outline" onClick={()=>run(()=>insertComponent(c))}>Insert {c.name}</Button><Button aria-label={`Remove ${c.name} from library`} onClick={()=>run(()=>{if(window.confirm(`Remove ${c.name} from this personal library? Project files are unchanged.`))setSaved(removeComponent(c.id));})}>Remove</Button></div>)}
 </section>;
}
