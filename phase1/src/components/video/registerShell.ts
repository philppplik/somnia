import {lazyPanel} from '../studios/lazyPanel';
import {videoStudio} from '../../lib/studios/video';
import {registerStudioPanels} from '../studios/registerStudioPanels';
const SourcesPanel=lazyPanel(()=>import('./VideoPanels').then(m=>m.SourcesPanel));
const SequencePanel=lazyPanel(()=>import('./VideoPanels').then(m=>m.SequencePanel));
const VideoDocumentSection=lazyPanel(()=>import('./VideoPanels').then(m=>m.VideoDocumentSection));
const VideoSelectionSection=lazyPanel(()=>import('./VideoPanels').then(m=>m.VideoSelectionSection));
const VideoAudioSection=lazyPanel(()=>import('./VideoPanels').then(m=>m.VideoAudioSection));
const VideoExportSection=lazyPanel(()=>import('./VideoPanels').then(m=>m.VideoExportSection));
export const disposeVideoShell=registerStudioPanels(videoStudio,{
 panels:{'video.sources':SourcesPanel,'video.sequence':SequencePanel},
 sections:{'video.inspector.document':VideoDocumentSection,'video.inspector.selection':VideoSelectionSection,'video.inspector.audio':VideoAudioSection,'video.inspector.export':VideoExportSection},
});
if(import.meta.hot)import.meta.hot.dispose(()=>disposeVideoShell());
