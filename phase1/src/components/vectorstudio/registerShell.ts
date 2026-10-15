import {vectorStudio} from '../../lib/studios/vector';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {registerRailIcons} from '../../lib/shell/railIcons';
import {Circle,Minus,Download} from '../../lib/icons';
import {NodeIcon,PenNibIcon,PolygonIcon,StarIcon} from './icons';
import {VectorLayersPanel,VectorToolsPanel,VectorExportPanel,VectorPageSection,VectorTransformSection,VectorStyleSection,VectorTextSection,VectorShapeSection,VectorNodeSection} from './VectorPanels';
registerRailIcons({VectorNode:NodeIcon,VectorPen:PenNibIcon,VectorEllipse:Circle,VectorLine:Minus,VectorPolygon:PolygonIcon,VectorStar:StarIcon,VectorExport:Download});
export const disposeVectorShell=registerStudioPanels(vectorStudio,{
 panels:{'vector.layers':VectorLayersPanel,'vector.tools':VectorToolsPanel,'vector.export':VectorExportPanel},
 sections:{'vector.section.page':VectorPageSection,'vector.section.transform':VectorTransformSection,'vector.section.style':VectorStyleSection,'vector.section.text':VectorTextSection,'vector.section.shape':VectorShapeSection,'vector.section.nodes':VectorNodeSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeVectorShell());
