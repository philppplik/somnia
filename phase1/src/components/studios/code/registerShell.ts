import {codeStudio} from '../../../lib/studios/code';
import {registerStudioPanels} from '../registerStudioPanels';
import {CodeDesignSection,CodeInteractionsSection,CodeSourceSection,CodeOutlinePanel,CodeResponsivePanel} from './CodePanels';
import {LayersPanel} from '../../LayersPanel';
import {FilesPanel} from '../../FilesPanel';
import {SearchPanel} from '../../SearchPanel';
import {ComponentsPanel} from '../../ComponentsPanel';
import {CssPanel} from '../../CssPanel';
import {DeployTargetsPanel,DeployLogPanel,DeployTargetSection,DeployFrameworkSection,DeployDryRunSection} from '../../deploy/DeployPanels';
import {registerDeployPanelCommands} from '../../../lib/deployPanels/commands';
import {deployPanelActions} from '../../deploy/deployShellActions';
import {VersionsHost} from '../../versions/VersionsHost';
export const disposeCodeShell=registerStudioPanels(codeStudio,{
 panels:{'code.layers':LayersPanel,'code.files':FilesPanel,'code.search':SearchPanel,'code.components':ComponentsPanel,'code.css':CssPanel,'code.versions':VersionsHost,'code.outline':CodeOutlinePanel,'code.responsive':CodeResponsivePanel,'deploy.targets':DeployTargetsPanel,'deploy.log':DeployLogPanel},
 sections:{'code.inspector.design':CodeDesignSection,'code.inspector.interactions':CodeInteractionsSection,'code.inspector.source':CodeSourceSection,'deploy.inspector.target':DeployTargetSection,'deploy.inspector.framework':DeployFrameworkSection,'deploy.inspector.dryrun':DeployDryRunSection},
});
export const disposeDeployCommands=registerDeployPanelCommands(deployPanelActions);
if(import.meta.hot)import.meta.hot.dispose(()=>{disposeCodeShell();disposeDeployCommands();});
