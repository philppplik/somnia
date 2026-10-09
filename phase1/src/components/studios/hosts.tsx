import {lazy,Suspense} from 'react';
import {SlidesSidebar} from '../slides/SlidesSidebar';
import {LayersPanel} from '../LayersPanel';
import {SlidesCanvas} from '../slides/SlidesCanvas';
import {SlidesInspector} from '../slides/SlidesInspector';
import {Canvas} from '../Canvas';
import {DocumentsCanvas,DocumentsInspector} from '../documents/DocumentsCanvas';
import {Inspector} from '../Inspector';
import {getStudio} from '../../lib/studios';
import {useAppStore} from '../../store/appStore';
const SheetsCanvas=lazy(()=>import('../sheets/SheetsCanvas').then(m=>({default:m.SheetsCanvas})));
const SheetsInspector=lazy(()=>import('../sheets/SheetsInspector').then(m=>({default:m.SheetsInspector})));
const lazyHost=(Host:React.ComponentType)=>()=><Suspense fallback={null}><Host/></Suspense>;
const canvasHosts={'code.canvas':Canvas,'documents.canvas':DocumentsCanvas,'sheets.canvas':lazyHost(SheetsCanvas),'slides.canvas':SlidesCanvas};
const inspectorRegistries={'code.inspector':Inspector,'documents.inspector':DocumentsInspector,'sheets.inspector':lazyHost(SheetsInspector),'slides.inspector':SlidesInspector};
export function StudioCanvas(){const s=useAppStore();const Host=canvasHosts[getStudio(s.activeStudio).canvas as keyof typeof canvasHosts];if(!Host)throw new Error('Studio canvas unavailable');return <Host/>;}
export function StudioInspector(){const s=useAppStore();const Host=inspectorRegistries[getStudio(s.activeStudio).shell.inspector as keyof typeof inspectorRegistries];if(!Host)throw new Error('Studio inspector unavailable');return <Host/>;}

const sidebarHosts={'slides.sidebar':SlidesSidebar};
export function StudioSidebar(){const s=useAppStore();const id=getStudio(s.activeStudio).shell.sidebar;const Host=id?sidebarHosts[id as keyof typeof sidebarHosts]:LayersPanel;if(!Host)throw new Error('Studio sidebar unavailable');return <Host/>;}
