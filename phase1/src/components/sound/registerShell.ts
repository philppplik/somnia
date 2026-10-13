import {soundStudio} from '../../lib/studios/sound';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {registerRailIcons} from '../../lib/shell/railIcons';
import {AudioWaveform,Scissors,Volume2,SlidersHorizontal} from '../../lib/icons';
import {ClipsPanel,SelectionPanel,EffectsPanel,SourceSection,LevelsSection,ProcessingSection} from './SoundPanels';
registerRailIcons({AudioWaveform,Scissors,Volume2,SlidersHorizontal});
export const disposeSoundShell=registerStudioPanels(soundStudio,{panels:{'sound.clips':ClipsPanel,'sound.selection':SelectionPanel,'sound.effects':EffectsPanel},sections:{'sound.inspector.source':SourceSection,'sound.inspector.levels':LevelsSection,'sound.inspector.processing':ProcessingSection}});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeSoundShell());
