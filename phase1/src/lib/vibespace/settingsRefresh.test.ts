import test from 'node:test';
import assert from 'node:assert/strict';
import {subscribeVibeModelSettings} from './settingsRefresh';
import {initializeAgentSettings,applyAgentSettings,setAgentActivity,setAgentAuthenticationBusy,setActiveFileAccess,agentSettingsSnapshot} from '../agent/settingsRuntime';
test('model invalidation follows saved provider/model only and unsubscribes',async()=>{
 const data=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
 let refreshes=0;const off=subscribeVibeModelSettings(()=>refreshes++);
 await initializeAgentSettings();assert.equal(refreshes,1);
 const cfg={...agentSettingsSnapshot().config,provider:'openai' as const,model:'fixture-model'};
 assert.equal(await applyAgentSettings(cfg),true);assert.equal(refreshes,2);
 assert.equal(await applyAgentSettings({...cfg,customPrompts:[{id:'p',name:'style',text:'short',enabled:true}]}),true);assert.equal(refreshes,2);
 setAgentAuthenticationBusy(true);setActiveFileAccess(true);setAgentActivity(true,false);
 assert.equal(await applyAgentSettings({...cfg,model:'unsaved'}),false);assert.equal(refreshes,2);
 setAgentActivity(false,false);setAgentAuthenticationBusy(false);
 assert.equal(await applyAgentSettings({...cfg,provider:'openrouter'}),true);assert.equal(refreshes,3);
 off();assert.equal(await applyAgentSettings({...cfg,model:'later'}),true);assert.equal(refreshes,3);
});
