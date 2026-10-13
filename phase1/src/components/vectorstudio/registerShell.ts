import {lazyPanel} from '../studios/lazyPanel';
import {vectorStudio} from '../../lib/studios/vector';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {registerRailIcons} from '../../lib/shell/railIcons';
import {Circle,Minus,Download} from '../../lib/icons';
import {NodeIcon,PenNibIcon,PolygonIcon,StarIcon} from './icons';
const VectorLayersPanel=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorLayersPanel));
const VectorToolsPanel=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorToolsPanel));
const VectorExportPanel=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorExportPanel));
const VectorPageSection=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorPageSection));
const VectorTransformSection=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorTransformSection));
const VectorStyleSection=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorStyleSection));
const VectorNodeSection=lazyPanel(()=>import('./VectorPanels').then(m=>m.VectorNodeSection));
registerRailIcons({VectorNode:NodeIcon,VectorPen:PenNibIcon,VectorEllipse:Circle,VectorLine:Minus,VectorPolygon:PolygonIcon,VectorStar:StarIcon,VectorExport:Download});
export const disposeVectorShell=registerStudioPanels(vectorStudio,{
 panels:{'vector.layers':VectorLayersPanel,'vector.tools':VectorToolsPanel,'vector.export':VectorExportPanel},
 sections:{'vector.section.page':VectorPageSection,'vector.section.transform':VectorTransformSection,'vector.section.style':VectorStyleSection,'vector.section.nodes':VectorNodeSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeVectorShell());
