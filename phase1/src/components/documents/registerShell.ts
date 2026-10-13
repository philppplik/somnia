import {documentsStudio} from '../../lib/studios/documents';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {DocumentSection,OutlinePanel,PagesPanel,RisksSection,SelectionSection,TextSection} from './DocumentsPanels';
/** Components half of the Documents manifest (lib/studios/documents.ts). Imported once by the studio hosts. */
export const disposeDocumentsShell=registerStudioPanels(documentsStudio,{
 panels:{'documents.pages':PagesPanel,'documents.outline':OutlinePanel},
 sections:{'documents.inspector.document':DocumentSection,'documents.inspector.selection':SelectionSection,'documents.inspector.text':TextSection,'documents.inspector.risks':RisksSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeDocumentsShell());
