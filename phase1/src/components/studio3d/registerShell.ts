import {studio3D} from '../../lib/studios/3d';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {registerRailIcons} from '../../lib/shell/railIcons';
import {Boxes,Info} from '../../lib/icons';
import {ScenePanel,ModelSection,ObjectSection,ViewSection,EnvSection,ToolsSection} from './Studio3DPanels';
registerRailIcons({Boxes,Info});
export const disposeStudio3DShell=registerStudioPanels(studio3D,{panels:{'studio3d.scene':ScenePanel},sections:{'studio3d.inspector.model':ModelSection,'studio3d.inspector.object':ObjectSection,'studio3d.inspector.view':ViewSection,'studio3d.inspector.env':EnvSection,'studio3d.inspector.tools':ToolsSection}});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeStudio3DShell());
