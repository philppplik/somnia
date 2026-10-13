import {lazyPanel} from '../studios/lazyPanel';
import {designStudio} from '../../lib/studios/design';
import {registerStudioPanels} from '../studios/registerStudioPanels';
const ArrangeSection=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.ArrangeSection));
const ArtboardSection=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.ArtboardSection));
const ArtboardsPanel=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.ArtboardsPanel));
const ColorsPanel=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.ColorsPanel));
const LayersPanel=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.LayersPanel));
const ProjectSection=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.ProjectSection));
const SelectionSection=lazyPanel(()=>import('./DesignShellPanels').then(m=>m.SelectionSection));
/** Components half of the Design manifest (lib/studios/design.ts). Imported once by App. */
export const disposeDesignShell=registerStudioPanels(designStudio,{
 panels:{'design.layers':LayersPanel,'design.artboards':ArtboardsPanel,'design.colors':ColorsPanel},
 sections:{'design.inspector.selection':SelectionSection,'design.inspector.arrange':ArrangeSection,'design.inspector.artboard':ArtboardSection,'design.inspector.project':ProjectSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeDesignShell());
