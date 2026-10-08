import {Canvas} from '../Canvas';
import {Inspector} from '../Inspector';
import {getStudio} from '../../lib/studios';
import {useAppStore} from '../../store/appStore';
const canvasHosts={'code.canvas':Canvas};
const inspectorRegistries={'code.inspector':Inspector};
export function StudioCanvas(){const s=useAppStore();const Host=canvasHosts[getStudio(s.activeStudio).canvas as keyof typeof canvasHosts];if(!Host)throw new Error('Studio canvas unavailable');return <Host/>;}
export function StudioInspector(){const s=useAppStore();const Host=inspectorRegistries[getStudio(s.activeStudio).shell.inspector as keyof typeof inspectorRegistries];if(!Host)throw new Error('Studio inspector unavailable');return <Host/>;}
