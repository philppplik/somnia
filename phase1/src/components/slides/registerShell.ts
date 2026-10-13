import {lazyPanel} from '../studios/lazyPanel';
import {slidesStudio} from '../../lib/studios/slides';
import {registerStudioPanels} from '../studios/registerStudioPanels';
const slidesPanelHosts={'slides.overview':lazyPanel(()=>import('./shellPanels').then(m=>m.SlidesOverviewPanel)),'slides.outline':lazyPanel(()=>import('./shellPanels').then(m=>m.SlidesOutlinePanel))};
const slidesInspectorHosts={'slides.inspector.text':lazyPanel(()=>import('./shellPanels').then(m=>m.SlidesTextPanel)),'slides.inspector.deck':lazyPanel(()=>import('./shellPanels').then(m=>m.SlidesDeckPanel)),'slides.inspector.diagnostics':lazyPanel(()=>import('./shellPanels').then(m=>m.SlidesDiagnosticsPanel))};
export const disposeSlidesShell=registerStudioPanels(slidesStudio,{panels:slidesPanelHosts,sections:slidesInspectorHosts});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeSlidesShell());
