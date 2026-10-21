import {designStudio} from '../../lib/studios/design';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {ArrangeSection,ArtboardSection,ArtboardsPanel,ColorsPanel,LayersPanel,ProjectSection,SelectionSection} from './DesignShellPanels';
/** Components half of the Design manifest (lib/studios/design.ts). Imported once by App. */
export const disposeDesignShell=registerStudioPanels(designStudio,{
 panels:{'design.layers':LayersPanel,'design.artboards':ArtboardsPanel,'design.colors':ColorsPanel},
 sections:{'design.inspector.selection':SelectionSection,'design.inspector.arrange':ArrangeSection,'design.inspector.artboard':ArtboardSection,'design.inspector.project':ProjectSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeDesignShell());
