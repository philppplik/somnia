import {lazy,Suspense} from 'react';
import {Canvas} from '../Canvas';
import {Inspector} from '../Inspector';
import {getStudio} from '../../lib/studios';
import {useAppStore} from '../../store/appStore';
const SheetsCanvas=lazy(()=>import('../sheets/SheetsCanvas').then(m=>({default:m.SheetsCanvas})));
const SheetsInspector=lazy(()=>import('../sheets/SheetsInspector').then(m=>({default:m.SheetsInspector})));
const lazyHost=(Host:React.ComponentType)=>()=><Suspense fallback={null}><Host/></Suspense>;
const canvasHosts={'code.canvas':Canvas,'sheets.canvas':lazyHost(SheetsCanvas)};
const inspectorRegistries={'code.inspector':Inspector,'sheets.inspector':lazyHost(SheetsInspector)};
export function StudioCanvas(){const s=useAppStore();const Host=canvasHosts[getStudio(s.activeStudio).canvas as keyof typeof canvasHosts];if(!Host)throw new Error('Studio canvas unavailable');return <Host/>;}
export function StudioInspector(){const s=useAppStore();const Host=inspectorRegistries[getStudio(s.activeStudio).shell.inspector as keyof typeof inspectorRegistries];if(!Host)throw new Error('Studio inspector unavailable');return <Host/>;}
