import {agentSettingsSnapshot,subscribeAgentSettings} from '../agent/settingsRuntime';
/** Settings are only an invalidation signal. Native snapshots remain the model authority.
 * Ignore drafts, prompts, credentials and activity updates; never copy model refs from settings.
 */
export function subscribeVibeModelSettings(refresh:()=>void):()=>void{
 const identity=()=>{const s=agentSettingsSnapshot();return s.ready?JSON.stringify([s.config.provider,s.config.model]):null;};
 let previous=identity();
 return subscribeAgentSettings(()=>{
  const next=identity();if(next===previous)return;previous=next;
  if(next!==null)refresh();
 });
}
