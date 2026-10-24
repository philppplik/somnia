// Isolated developer fixture only. Synthetic speech output; never part of the app entry.
import {createRoot} from 'react-dom/client';
import {TranscriptHub} from '../../src/components/TranscriptHub';
import {setTranscriptHubOpen} from '../../src/lib/transcript/session';
import '../../src/styles/global.css';
const params=new URLSearchParams(location.search);
if(params.has('native')){
 Object.assign(globalThis,{isTauri:true});
 Object.assign(window,{__TAURI_INTERNALS__:{invoke:async(command:string)=>{
  if(command==='local_voice_status')return {helperReady:true,modelReady:true};
  if(command==='local_voice_transcribe_file')return 'synthetic-job';
  if(command==='local_voice_poll')return {id:'synthetic-job',phase:'complete',transcript:'Synthetic fixture transcript.\n\nReview the wording, then export a text file. No real speech recognition runs in this UI fixture.'};
 }}});
}
setTranscriptHubOpen(true);createRoot(document.getElementById('root')!).render(<TranscriptHub/>);
