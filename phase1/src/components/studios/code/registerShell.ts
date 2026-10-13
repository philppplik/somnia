import {codeStudio} from '../../../lib/studios/code';
import {registerStudioPanels} from '../registerStudioPanels';
import {CodeDesignSection,CodeInteractionsSection,CodeSourceSection,CodeOutlinePanel,CodeResponsivePanel} from './CodePanels';
import {LayersPanel} from '../../LayersPanel';
import {FilesPanel} from '../../FilesPanel';
import {SearchPanel} from '../../SearchPanel';
import {ComponentsPanel} from '../../ComponentsPanel';
import {CssPanel} from '../../CssPanel';
import {VersionsHost} from '../../versions/VersionsHost';
export const disposeCodeShell=registerStudioPanels(codeStudio,{
 panels:{'code.layers':LayersPanel,'code.files':FilesPanel,'code.search':SearchPanel,'code.components':ComponentsPanel,'code.css':CssPanel,'code.versions':VersionsHost,'code.outline':CodeOutlinePanel,'code.responsive':CodeResponsivePanel},
 sections:{'code.inspector.design':CodeDesignSection,'code.inspector.interactions':CodeInteractionsSection,'code.inspector.source':CodeSourceSection},
});
if(import.meta.hot)import.meta.hot.dispose(disposeCodeShell);
