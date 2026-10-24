/** Offline native-boundary harness. Only synthetic non-secret preferences and refs. */
import {createRoot} from 'react-dom/client';
import {VibeSpaceHome} from './VibeSpaceHome';
import {createNativeVibeSpaceTransport} from '../../lib/vibespace/native';
import {fixtureSpace} from '../../lib/vibespace/fixture';
import {initializeAgentSettings,applyAgentSettings} from '../../lib/agent/settingsRuntime';
import type {ModelRef} from '../../lib/vibespace/types';
import './vibespace.css';
let models:ModelRef[]=[],revision=1;const requests:unknown[]=[];
const transport=createNativeVibeSpaceTransport({capabilities:['create-studio'],
 io:{listen:async()=>()=>{},invoke:async()=>{throw new Error('No native calls in the offline harness');}},
 readSnapshot:async()=>({revision,models,runs:[]}),listSpaces:async()=>[fixtureSpace],listStudios:async()=>[],
 createStudio:async request=>{requests.push(request);return {studioId:'new',...request,canStart:true,latestRunId:null};},reviewRequest:()=>({}),
});
await initializeAgentSettings();
Object.assign(window,{modelPickerHarness:{requests,
 save:async(provider:'ollama'|'openai'|'openrouter'|'claude',model:string)=>{
  // Native projection is simulated separately from the UI settings signal.
  models=model?[{provider,model,locality:provider==='ollama'?'local':'cloud'}]:[];revision++;
  return applyAgentSettings({provider,model,apiKey:'',allowActiveFile:false,customPrompts:[]});
 },setModels:(next:ModelRef[])=>{models=next;revision++;},
}});
createRoot(document.getElementById('root')!).render(<VibeSpaceHome transport={transport}/>);
