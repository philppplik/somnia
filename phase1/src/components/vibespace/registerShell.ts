import {vibespaceStudio} from '../../lib/studios/vibespace';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {registerRailIcons} from '../../lib/shell/railIcons';
import {Bot,LayoutTemplate,AlertTriangle,Info,Lightbulb,Puzzle} from '../../lib/icons';
import {SpacesPanel,RunsPanel,AttentionPanel,MemoryShellPanel,SkillsShellPanel,SpaceSection,RunSection,UsageSection,CheckpointsSection} from './VibeSpacePanels';
registerRailIcons({Bot,LayoutTemplate,AlertTriangle,Info,Lightbulb,Puzzle});
export const disposeVibeSpaceShell=registerStudioPanels(vibespaceStudio,{panels:{'vibespace.memory':MemoryShellPanel,'vibespace.skills':SkillsShellPanel,'vibespace.spaces':SpacesPanel,'vibespace.runs':RunsPanel,'vibespace.attention':AttentionPanel},sections:{'vibespace.inspector.space':SpaceSection,'vibespace.inspector.run':RunSection,'vibespace.inspector.usage':UsageSection,'vibespace.inspector.checkpoints':CheckpointsSection}});
if(import.meta.hot)import.meta.hot.dispose(disposeVibeSpaceShell);
