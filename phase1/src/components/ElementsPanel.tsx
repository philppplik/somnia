import {ComponentSystemPanel} from './ComponentSystemPanel';
import {elements,insertElement} from '../lib/structureCommands';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
export function ElementsPanel(){
 const s=useAppStore();
 return <section className="element-library" aria-label="HTML element library"><h3>HTML elements</h3><p>Select a container and insert, or drag an element onto a source container in the canvas. Existing source stays unchanged outside the insertion.</p>
 {elements.map((element,i)=><Button key={element.label} variant="outline" draggable disabled={!s.coreConnected}
 onDragStart={e=>{e.dataTransfer.setData('application/x-somnia-element',String(i));e.dataTransfer.effectAllowed='copy';}}
 onClick={()=>{try{insertElement(i);}catch(error){patchState({notice:String(error)});}}}
 >{element.label}</Button>)}
 <ComponentSystemPanel/>
 </section>;
}
