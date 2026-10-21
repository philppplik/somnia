import {videoStudio} from '../../lib/studios/video';
import {registerStudioPanels} from '../studios/registerStudioPanels';
import {SourcesPanel,SequencePanel,VideoDocumentSection,VideoSelectionSection,VideoAudioSection,VideoExportSection} from './VideoPanels';
export const disposeVideoShell=registerStudioPanels(videoStudio,{
 panels:{'video.sources':SourcesPanel,'video.sequence':SequencePanel},
 sections:{'video.inspector.document':VideoDocumentSection,'video.inspector.selection':VideoSelectionSection,'video.inspector.audio':VideoAudioSection,'video.inspector.export':VideoExportSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeVideoShell());
