import {useT} from '../lib/useT';
import {ComponentSystemPanel} from './ComponentSystemPanel';
import {elements,insertElement} from '../lib/structureCommands';
import {useAppStore,patchState} from '../store/appStore';
import {Button} from './ui/button';
import {ComponentBrowser} from './ComponentBrowser';
export function ElementsPanel(){
 const {t}=useT();
 const s=useAppStore();
 return <section className="element-library" aria-label={t('panels.elements.htmlElementLibrary')}><h3>{t('panels.elements.htmlElements')}</h3><p>{t('panels.elements.selectAContainerAndInsert')}</p>
 {elements.map((element,i)=><Button key={element.label} variant="outline" draggable disabled={!s.coreConnected}
 onDragStart={e=>{e.dataTransfer.setData('application/x-somnia-element',String(i));e.dataTransfer.effectAllowed='copy';}}
 onClick={()=>{try{insertElement(i);}catch(error){patchState({notice:String(error)});}}}
 >{t('panels.elements.item.'+i)}</Button>)}
 <ComponentBrowser/>
 <ComponentSystemPanel/>
 </section>;
}
