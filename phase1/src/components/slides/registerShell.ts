import {slidesStudio} from '../../lib/studios/slides';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {slidesPanelHosts,slidesInspectorHosts} from './shellPanels';
export const disposeSlidesShell=registerStudioPanels(slidesStudio,{panels:slidesPanelHosts,sections:slidesInspectorHosts});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeSlidesShell());
