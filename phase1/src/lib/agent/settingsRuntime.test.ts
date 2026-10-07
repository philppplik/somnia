import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAgentSettings,applyAgentSettings,agentSettingsSnapshot,setAgentActivity,subscribeAgentSettings,setActiveFileAccess} from './settingsRuntime';
test('one load, settings save synchronizes, permissions and secrets stay session-only, busy and proposal guards',async()=>{
 const data=new Map<string,string>();let reads=0;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>{reads++;return data.get(key)??null;},setItem:(key:string,value:string)=>data.set(key,value)}});
 await Promise.all([initializeAgentSettings(),initializeAgentSettings()]);assert.equal(reads,1);
 let updates=0;const off=subscribeAgentSettings(()=>updates++);
 const cfg={provider:'openai' as const,model:'fixture',apiKey:'fixture-secret',allowActiveFile:true,customPrompts:[{id:'1',name:'Tone',text:'Be concise',enabled:true}]};
 assert.equal(await applyAgentSettings(cfg),true);assert.equal(agentSettingsSnapshot().config.model,'fixture');
 const stored=JSON.parse(data.get('somnia.agent.preferences.v1')!);assert.equal(stored.apiKey,undefined);assert.equal(stored.allowActiveFile,undefined);
 setActiveFileAccess(false);assert.equal(agentSettingsSnapshot().config.allowActiveFile,false);
 setAgentActivity(true,false);assert.equal(await applyAgentSettings({...cfg,model:'blocked'}),false);
 setAgentActivity(false,true);assert.equal(await applyAgentSettings({...cfg,model:'blocked'}),false);
 assert.equal(agentSettingsSnapshot().config.model,'fixture');
 setAgentActivity(false,false);assert.equal(await applyAgentSettings({...cfg,customPrompts:[{id:'1',name:'',text:'é'.repeat(4001),enabled:true}]}),false);
 assert.equal(agentSettingsSnapshot().config.model,'fixture');assert.ok(updates>0);off();
});
