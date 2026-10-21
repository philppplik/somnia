import './documents-panels.css';
import {DocumentsOutlinePanel,DocumentsFindPanel,DocumentsInfoPanel,DocumentsSelectionPanel} from './DocumentsPanelContents';
import {documentsStudio} from '../../lib/studios/documents';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {PagesPanel,RisksSection,TextSection} from './DocumentsPanels';
/** Components half of the Documents manifest (lib/studios/documents.ts). Imported once by the studio hosts. */
export const disposeDocumentsShell=registerStudioPanels(documentsStudio,{
 panels:{'documents.pages':PagesPanel,'documents.outline':DocumentsOutlinePanel,'documents.find':DocumentsFindPanel},
 sections:{'documents.inspector.document':DocumentsInfoPanel,'documents.inspector.selection':DocumentsSelectionPanel,'documents.inspector.text':TextSection,'documents.inspector.risks':RisksSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeDocumentsShell());
