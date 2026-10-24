import './documents-panels.css';
import {lazyPanel} from '../studios/lazyPanel';
import {documentsStudio} from '../../lib/studios/documents';
import {registerStudioPanels} from '../studios/registerStudioPanels';
const DocumentsOutlinePanel=lazyPanel(()=>import('./DocumentsPanelContents').then(m=>m.DocumentsOutlinePanel));
const DocumentsFindPanel=lazyPanel(()=>import('./DocumentsPanelContents').then(m=>m.DocumentsFindPanel));
const DocumentsInfoPanel=lazyPanel(()=>import('./DocumentsPanelContents').then(m=>m.DocumentsInfoPanel));
const DocumentsSelectionPanel=lazyPanel(()=>import('./DocumentsPanelContents').then(m=>m.DocumentsSelectionPanel));
const PagesPanel=lazyPanel(()=>import('./DocumentsPanels').then(m=>m.PagesPanel));
const RisksSection=lazyPanel(()=>import('./DocumentsPanels').then(m=>m.RisksSection));
const TextSection=lazyPanel(()=>import('./DocumentsPanels').then(m=>m.TextSection));
/** Components half of the Documents manifest (lib/studios/documents.ts). Imported once by the studio hosts. */
export const disposeDocumentsShell=registerStudioPanels(documentsStudio,{
 panels:{'documents.pages':PagesPanel,'documents.outline':DocumentsOutlinePanel,'documents.find':DocumentsFindPanel},
 sections:{'documents.inspector.document':DocumentsInfoPanel,'documents.inspector.selection':DocumentsSelectionPanel,'documents.inspector.text':TextSection,'documents.inspector.risks':RisksSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeDocumentsShell());
