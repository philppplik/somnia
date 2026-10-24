import {lazyPanel} from '../studios/lazyPanel';
import {slidesStudio} from '../../lib/studios/slides';
import {registerStudioPanels} from '../studios/registerStudioPanels';
const slidesPanelHosts={'slides.overview':lazyPanel(()=>import('./shellPanels').then(m=>m.slidesPanelHosts['slides.overview'])),'slides.outline':lazyPanel(()=>import('./shellPanels').then(m=>m.slidesPanelHosts['slides.outline']))};
const slidesInspectorHosts={'slides.inspector.text':lazyPanel(()=>import('./shellPanels').then(m=>m.slidesInspectorHosts['slides.inspector.text'])),'slides.inspector.deck':lazyPanel(()=>import('./shellPanels').then(m=>m.slidesInspectorHosts['slides.inspector.deck'])),'slides.inspector.diagnostics':lazyPanel(()=>import('./shellPanels').then(m=>m.slidesInspectorHosts['slides.inspector.diagnostics']))};
export const disposeSlidesShell=registerStudioPanels(slidesStudio,{panels:slidesPanelHosts,sections:slidesInspectorHosts});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeSlidesShell());
