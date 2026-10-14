import {Button} from '../ui/button';
import {LocalToolDiagnostics} from './LocalToolDiagnostics';
import {LocalQualityProbes} from './LocalQualityProbes';
import {LocalVisionTest} from './LocalVisionTest';
import {LocalStudioModels} from './LocalStudioModels';
import {AlternateRuntimeDiscovery} from './AlternateRuntimeDiscovery';
import {LocalRuntimeAdvanced} from './LocalRuntimeAdvanced';
import {normalizeLocalRuntime} from '../../lib/agent/settings';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {patchState,useAppStore} from '../../store/appStore';
import {useT} from '../../lib/useT';
import {settingsMatch} from '../../lib/settingsSearch';
import {ProviderAuthentication} from './ProviderAuthentication';
import {AgentPrivacySettings} from './AgentPrivacy';
import {listProviderModels} from '../../lib/agent/modelCatalog';
import type {AgentConfiguration} from '../../lib/agent/panelBridge';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../ui/tabs';
import {LocalModelsSettings} from './LocalModelsSettings';
import {McpSettings} from './McpSettings';
import {agentSettingsSnapshot,subscribeAgentSettings,initializeAgentSettings,applyAgentSettings,setAgentAuthenticationBusy,agentCredentialsChanged} from '../../lib/agent/settingsRuntime';
/** Provider credentials still use the existing broker, never preference storage. */
/** Roving tab index for Left/Right/Home/End over `count` tabs; wraps around. */
export function nextTabIndex(index:number,count:number,key:string):number{return key==='Home'?0:key==='End'?count-1:(index+(key==='ArrowRight'?1:count-1))%count;}
export function AgentSettings({searchQuery='',legacyPrivacy=false}:{searchQuery?:string;legacyPrivacy?:boolean}){
 const {t}=useT();const app=useAppStore();const tab=['providers','local','instructions','privacy','tools'].includes(app.settingsAITab)?app.settingsAITab:'providers';
 const tabs=['providers','local','instructions','privacy','tools'] as const;
 const labels={local:t('local.tab'),providers:t('agent.settings.providers'),instructions:t('agent.settings.instructions'),privacy:t('agent.settings.privacy'),tools:t('mcp.tab')};
 const settings=useSyncExternalStore(subscribeAgentSettings,agentSettingsSnapshot,agentSettingsSnapshot);
 const {saving,authBusy}=settings;
 const [cfg,setCfg]=useState<AgentConfiguration>(settings.config),[saved,setSaved]=useState(false);
 useEffect(()=>{void initializeAgentSettings();},[]);
 useEffect(()=>{if(settings.ready)setCfg(settings.config);},[settings.ready,settings.config]);
 const [models,setModels]=useState<{id:string;name:string}[]>([]),[modelsBusy,setModelsBusy]=useState(false),[modelsError,setModelsError]=useState('');const modelRequest=useRef<AbortController|null>(null);
 useEffect(()=>{modelRequest.current?.abort();setModels([]);setModelsError('');setModelsBusy(false);return()=>modelRequest.current?.abort();},[cfg.provider]);
 const refreshModels=async()=>{modelRequest.current?.abort();const controller=new AbortController();modelRequest.current=controller;setModelsBusy(true);setModelsError('');try{const list=await listProviderModels(cfg.provider,controller.signal);if(!controller.signal.aborted)setModels(list);}catch{if(!controller.signal.aborted)setModelsError('Could not load models. Check cloud consent, saved key and provider connection. You can enter a model ID manually.');}finally{if(modelRequest.current===controller)setModelsBusy(false);}};
 const saveConfiguration=async()=>{setSaved(await applyAgentSettings(cfg));};
 const locked=!settings.ready||saving||settings.running||settings.pendingReview;
 const bytes=(text:string)=>new TextEncoder().encode(text).length;
 const totalBytes=(cfg.customPrompts??[]).reduce((n,p)=>n+bytes(p.text),0);
 let runtimeInvalid=false;try{normalizeLocalRuntime(cfg.localRuntime);}catch{runtimeInvalid=true;}
 const invalid=runtimeInvalid||totalBytes>16000||(cfg.customPrompts??[]).some(p=>bytes(p.text)>8000);
 useEffect(()=>{if(legacyPrivacy)patchState({settingsAITab:'privacy'});},[legacyPrivacy]);
 useEffect(()=>{if(!searchQuery)return;const areas={local:'Local models Ollama installed vision tools embedding '+t('local.search')+' '+labels.local,providers:'Provider Model API key authentication connection Ollama OpenRouter OpenAI Claude '+labels.providers,instructions:'Custom prompts instructions '+labels.instructions+' '+(cfg.customPrompts??[]).map(p=>p.name+' '+p.text).join(' '),privacy:'Consent Privacy Cloud Local data '+labels.privacy,tools:'MCP tools servers external Model Context Protocol '+labels.tools};const match=tabs.find(id=>settingsMatch(areas[id],searchQuery));if(match)patchState({settingsAITab:match});},[searchQuery]);
 const visible=(id:typeof tab)=>tab===id;
 return <div className="agent-settings" data-settings-search-text={'Provider Model API key authentication connection Ollama OpenRouter OpenAI Claude Local models vision tools embedding Custom prompts instructions Consent Privacy Cloud Local data '+(cfg.customPrompts??[]).map(p=>p.name+' '+p.text).join(' ')}>
  <p>Choose a provider and model for Somnia Agent. Changes apply when you save the configuration.</p>
  {settings.error&&<p role="alert">{settings.error}</p>}
  <Tabs value={tab} onValueChange={value=>{if(tabs.includes(value as typeof tab))patchState({settingsAITab:value as typeof tab});}}>
  <TabsList activateOnFocus aria-label={t('set.section.ai')}>
   {tabs.map(id=><TabsTrigger id={'ai-tab-'+id} value={id} aria-controls={'ai-content-'+id} key={id}>{labels[id]}</TabsTrigger>)}
  </TabsList>
  <TabsContent keepMounted value="local" id="ai-content-local" aria-labelledby="ai-tab-local"><LocalModelsSettings active={visible('local')}/><AlternateRuntimeDiscovery/><LocalToolDiagnostics/><LocalStudioModels value={cfg.localRuntime} disabled={locked} onChange={localRuntime=>{setCfg({...cfg,localRuntime});setSaved(false);}}/>{settings.config.provider==='ollama'&&<LocalQualityProbes model={settings.config.model} options={settings.config.localRuntime}/>}
{settings.config.provider==='ollama'&&<LocalVisionTest model={settings.config.model} options={settings.config.localRuntime}/>}<LocalRuntimeAdvanced value={cfg.localRuntime} disabled={locked} onChange={localRuntime=>{setCfg({...cfg,localRuntime});setSaved(false);}}/><Button type="button" disabled={locked||authBusy||invalid} onClick={()=>void saveConfiguration()}>{saving?'Saving...':t('agent.settings.save')}</Button>{saved&&<p role="status">Configuration saved.</p>}</TabsContent>
  {settings.running&&<p role="status">Stop the current generation before changing AI configuration.</p>}
  {settings.pendingReview&&<p role="status">Accept or discard pending proposals before changing AI configuration.</p>}
  <p hidden={tab!=='providers'&&tab!=='instructions'}>Saving starts a new AI session. Your visible chat history stays. API key actions apply immediately; cloud consent is separate.</p>
  <TabsContent keepMounted value="tools" id="ai-content-tools" aria-labelledby="ai-tab-tools"><McpSettings/></TabsContent>
  <TabsContent keepMounted value="privacy" id="ai-content-privacy" aria-labelledby="ai-tab-privacy"><AgentPrivacySettings/></TabsContent>
  <form hidden={tab!=='providers'&&tab!=='instructions'} aria-label="Agent configuration" onChange={()=>setSaved(false)} onSubmit={e=>{e.preventDefault();void saveConfiguration();}}>
   <fieldset disabled={locked}>
    <TabsContent keepMounted value="providers" id="ai-content-providers" aria-labelledby="ai-tab-providers">
    <label>Provider<select value={cfg.provider} disabled={authBusy||saving} onChange={e=>setCfg({...cfg,provider:e.target.value as AgentConfiguration['provider']})}><option value="ollama">Ollama (local verification required)</option><option value="openrouter">OpenRouter (cloud)</option><option value="openai">OpenAI API (cloud)</option><option value="claude">Anthropic Claude API (desktop)</option></select></label>
    <label>Model<input required value={cfg.model} onChange={e=>setCfg({...cfg,model:e.target.value})} placeholder="Installed model or provider/model" list="agent-model-catalog"/></label>
    <datalist id="agent-model-catalog">{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
    <button type="button" disabled={modelsBusy||authBusy} onClick={()=>void refreshModels()}>{modelsBusy?'Loading models...':'Refresh models'}</button>{modelsBusy&&<button type="button" onClick={()=>modelRequest.current?.abort()}>Cancel model refresh</button>}{modelsError&&<p role="alert">{modelsError}</p>}
    <p>Refresh is a metadata request, not inference. Cloud consent is required for cloud catalogs. A listed model is not a promise of tool support or available credits.</p>
    <button type="button" onClick={()=>patchState({settingsAITab:'local'})}>{t('local.title')}</button>
    <ProviderAuthentication provider={cfg.provider} disabled={locked} onBusyChange={setAgentAuthenticationBusy} onCredentialChange={()=>void agentCredentialsChanged()}/>
    </TabsContent>
    <TabsContent keepMounted value="instructions" id="ai-content-instructions" aria-labelledby="ai-tab-instructions">
    <fieldset><legend>Custom prompts</legend><p>{totalBytes} / 16000 UTF-8 bytes · {(cfg.customPrompts??[]).length} / 20 prompts · Applies to every AI request on this device.</p><p>Enabled prompts are included with every AI request. Do not put secrets here. File access and cloud consent still require approval.</p>
     {(cfg.customPrompts??[]).map((p,i)=><div key={p.id}>
      <label>Prompt name {i+1}<input maxLength={120} value={p.name} onChange={e=>setCfg({...cfg,customPrompts:cfg.customPrompts!.map(x=>x.id===p.id?{...x,name:e.target.value}:x)})}/></label>
      <label>Prompt text {i+1}<textarea aria-label={`Prompt text ${i+1}`} maxLength={8000} value={p.text} onChange={e=>setCfg({...cfg,customPrompts:cfg.customPrompts!.map(x=>x.id===p.id?{...x,text:e.target.value}:x)})}/></label>
      <p role={bytes(p.text)>8000?'alert':undefined}>{bytes(p.text)} / 8000 UTF-8 bytes</p>
      <label><input type="checkbox" checked={p.enabled} onChange={e=>setCfg({...cfg,customPrompts:cfg.customPrompts!.map(x=>x.id===p.id?{...x,enabled:e.target.checked}:x)})}/>Enable prompt {i+1}</label>
      <button type="button" onClick={()=>setCfg({...cfg,customPrompts:cfg.customPrompts!.filter(x=>x.id!==p.id)})}>Delete prompt {i+1}</button>
     </div>)}
     <button type="button" disabled={(cfg.customPrompts?.length??0)>=20} onClick={()=>setCfg({...cfg,customPrompts:[...(cfg.customPrompts??[]),{id:crypto.randomUUID(),name:'',text:'',enabled:true}]})}>Add custom prompt</button>
    </fieldset>
    </TabsContent>
    <button type="submit" disabled={locked||authBusy||invalid}>{saving?'Saving...':t('agent.settings.save')}</button>{saved&&<p role="status">Configuration saved.</p>}

   </fieldset>
  </form>
  </Tabs>
 </div>;
}
