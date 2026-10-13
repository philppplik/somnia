import type {PanelDef,PanelHostProps} from '../../lib/shell/types';
import {useStudioContext} from '../../lib/shell/studioContext';
import {INSPECTOR_HOST} from '../../lib/shell/types';
import {InspectorPanel} from '../shell/InspectorPanel';
const DesktopVibeSpacePanel=lazyHost(lazy(()=>import('../vibespace/DesktopVibeSpacePanel').then(m=>({default:m.DesktopVibeSpacePanel}))));
const DesignCanvas=lazyHost(lazy(()=>import('../design/DesignCanvas').then(m=>({default:m.DesignCanvas}))));
const DesignInspector=lazyHost(lazy(()=>import('../design/DesignInspector').then(m=>({default:m.DesignInspector}))));
import {lazy,Suspense} from 'react';
import {useMedia} from '../../lib/media';
const SlidesSidebar=lazyHost(lazy(()=>import('../slides/SlidesSidebar').then(m=>({default:m.SlidesSidebar}))));
import {LayersPanel} from '../LayersPanel';
const SlidesCanvas=lazyHost(lazy(()=>import('../slides/SlidesCanvas').then(m=>({default:m.SlidesCanvas}))));
const SlidesInspector=lazyHost(lazy(()=>import('../slides/SlidesInspector').then(m=>({default:m.SlidesInspector}))));
import {Canvas} from '../Canvas';
const DocumentsInspector=lazyHost(lazy(()=>import('../documents/DocumentsCanvas').then(m=>({default:m.DocumentsInspector}))));
const DocumentsCanvas=lazyHost(lazy(()=>import('../documents/DocumentsCanvas').then(m=>({default:m.DocumentsCanvas}))));
import {Inspector} from '../Inspector';
import {getStudio} from '../../lib/studios';
import {useAppStore} from '../../store/appStore';
const PhotosCanvas=lazyHost(lazy(()=>import('../photos/PhotosCanvas').then(m=>({default:m.PhotosCanvas}))));
const PhotosInspector=lazyHost(lazy(()=>import('../photos/PhotosInspector').then(m=>({default:m.PhotosInspector}))));
const SoundCanvas=lazyHost(lazy(()=>import('../sound/SoundCanvas').then(m=>({default:m.SoundCanvas}))));
const VideoCanvas=lazyHost(lazy(()=>import('../video/VideoCanvas').then(m=>({default:m.VideoCanvas}))));
const VideoInspector=lazyHost(lazy(()=>import('../video/VideoInspector').then(m=>({default:m.VideoInspector}))));
const VectorCanvas=lazyHost(lazy(()=>import('../vectorstudio/VectorCanvas').then(m=>({default:m.VectorCanvas}))));
const VectorInspector=lazyHost(lazy(()=>import('../vectorstudio/VectorInspector').then(m=>({default:m.VectorInspector}))));
const SoundInspector=lazyHost(lazy(()=>import('../sound/SoundInspector').then(m=>({default:m.SoundInspector}))));
const SheetsCanvas=lazy(()=>import('../sheets/SheetsCanvas').then(m=>({default:m.SheetsCanvas})));
const SheetsInspector=lazy(()=>import('../sheets/SheetsInspector').then(m=>({default:m.SheetsInspector})));
function lazyHost(Host:React.ComponentType){return function LazyHost(){return <Suspense fallback={null}><Host/></Suspense>;};}
const canvasHosts={'vibespace.canvas':DesktopVibeSpacePanel,'photos.canvas':PhotosCanvas,'design.canvas':DesignCanvas,'code.canvas':Canvas,'documents.canvas':DocumentsCanvas,'sheets.canvas':lazyHost(SheetsCanvas),'slides.canvas':SlidesCanvas,'sound.canvas':SoundCanvas,'video.canvas':VideoCanvas,'vector.canvas':VectorCanvas};
const inspectorRegistries={'vibespace.inspector':()=>null,'photos.inspector':PhotosInspector,'design.inspector':DesignInspector,'code.inspector':Inspector,'documents.inspector':DocumentsInspector,'sheets.inspector':lazyHost(SheetsInspector),'slides.inspector':SlidesInspector,'sound.inspector':SoundInspector,'video.inspector':VideoInspector,'vector.inspector':VectorInspector};
export function StudioCanvas(){const s=useAppStore();const Host=canvasHosts[getStudio(useHostStudio(s.activeStudio)).canvas as keyof typeof canvasHosts];if(!Host)throw new Error('Studio canvas unavailable');return <Host/>;}
export function StudioInspector(){const s=useAppStore();const Host=inspectorRegistries[getStudio(useHostStudio(s.activeStudio)).shell.inspector as keyof typeof inspectorRegistries];if(!Host)throw new Error('Studio inspector unavailable');return <Host/>;}

const sidebarHosts={'slides.sidebar':SlidesSidebar};
export function StudioSidebar(){const s=useAppStore();const id=getStudio(useHostStudio(s.activeStudio)).shell.sidebar;const Host=id?sidebarHosts[id as keyof typeof sidebarHosts]:LayersPanel;if(!Host)throw new Error('Studio sidebar unavailable');return <Host/>;}

function useHostStudio(id:string){const media=useMedia();const active=media.items.find(m=>m.name===media.active);return id==='slides'&&active&&active.kind!=='pptx'?'code':id;}

/** Explicit host allowlist. A manifest never supplies an executable module path. */
export type PanelComponent=React.ComponentType<PanelHostProps>;
const panelHosts=new Map<string,PanelComponent>([
 [INSPECTOR_HOST,InspectorPanel],
 ...['design','prototype','code'].map(id=>[`code.${id}`,Inspector] as [string,PanelComponent])
]);
export function registerPanelHost(id:string,Host:PanelComponent){if(panelHosts.has(id))throw new Error(`Duplicate panel host: ${id}`);panelHosts.set(id,Host);return()=>{if(panelHosts.get(id)===Host)panelHosts.delete(id);};}
export const hasPanelHost=(id:string)=>panelHosts.has(id);
export function PanelHost({panel}:{panel:PanelDef}){const Host=panelHosts.get(panel.component);const context=useStudioContext(useAppStore().activeStudio);if(!Host)throw new Error(`Studio panel unavailable: ${panel.component}`);return <Host panelId={panel.id} context={context}/>;}
