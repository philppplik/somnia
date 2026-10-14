import {AlternateRuntimeDiscovery} from '../src/components/agent/AlternateRuntimeDiscovery';
import {LocalRuntimeAdvanced} from '../src/components/agent/LocalRuntimeAdvanced';
import type {Hardware} from '../src/lib/agent/localModelAdvice';
import {LocalModelActions} from '../src/components/agent/LocalModelActions';
import {LocalModelManager} from '../src/lib/agent/localModelManager';
import type {RuntimeSnapshot} from '../src/lib/agent/localModels';
// Development-only fixture. Not imported by the application.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '../src/components/ui/tabs';
import {LocalModelsSettings} from '../src/components/agent/LocalModelsSettings';
import {LocalModelsRuntime} from '../src/lib/agent/localModels';
import '../src/styles/global.css';
import '../src/styles/agent.css';
if(!import.meta.env.DEV)throw Error('Development fixture only');
const fixture=new URLSearchParams(location.search).get('state')??'running';
const runtime=new LocalModelsRuntime(undefined,async(op,model)=>{
 if(fixture==='unreachable')throw Error('fixture offline');
 if(op==='version')return {version:'0.12.1'};
 if(op==='ps')return {models:[{model:'qwen3:4b',size_vram:2200000000,context_length:4096}]};
 if(op==='tags')return fixture==='malformed'?{}:{models:fixture==='empty'?[]:[{name:'qwen3:4b',size:2500000000,details:{parameter_size:'4B',quantization_level:'Q4_K_M'}},{name:'gemma3:4b',size:3300000000},{name:'remote-cloud',size:0}]};
 return {capabilities:model==='gemma3:4b'?['completion','vision']:['completion','tools'],model_info:{architecture:'fixture'},...(model==='remote-cloud'?{remote_host:'fixture.invalid'}:{})};
},async()=>({installed:true}),()=>true);
let installed=true;let transfer=0;
const actionRuntime=new LocalModelsRuntime(undefined,async(op)=>op==='version'?{version:'1'}:op==='tags'?{models:installed?[{name:'qwen3:4b',digest:'fixture-digest'}]:[]}:{model_info:{architecture:'fixture'}},async()=>({installed:true}),()=>true);
const manager=new LocalModelManager(actionRuntime,{start:async()=>{transfer=0;return 'fixture';},next:async()=>{await new Promise(resolve=>setTimeout(resolve,fixture==='actions-slow'?1500:100));return transfer++===0?Array.from(new TextEncoder().encode('{"status":"pulling","digest":"layer-a","completed":500,"total":1000}\n')):Array.from(new TextEncoder().encode('{"status":"success"}\n'));},cancel:async()=> 'unknown',remove:async()=>{installed=false;},launch:async()=>({launched:false,instruction:'sudo systemctl start ollama'})},()=>true);
function Actions(){const [snapshot,setSnapshot]=useState<RuntimeSnapshot|null>(null);React.useEffect(()=>{void actionRuntime.snapshot().then(setSnapshot);},[]);return <LocalModelActions manager={manager} snapshot={snapshot} onChanged={async()=>setSnapshot(await actionRuntime.snapshot())}/>;}
const hardwareProbe=async():Promise<Hardware>=>({os:'fixture',arch:'x86_64',cpu:'Fixture CPU',cores:8,ramTotalBytes:32*1024**3,ramAvailableBytes:20*1024**3,gpus:[{name:'Fixture GPU',totalBytes:8*1024**3,freeBytes:6*1024**3,unified:false,lowerBound:false}],errors:[],checkedAt:Date.now()});
function Fixture(){const [tab,setTab]=useState('local');return <main className="agent-settings" style={{padding:24,maxWidth:720,margin:'0 auto',height:'100vh',overflow:'auto'}}><h2>Settings &gt; AI</h2><Tabs value={tab} onValueChange={v=>setTab(String(v))}><TabsList activateOnFocus aria-label="AI settings">{['providers','local','instructions','privacy','tools'].map(id=><TabsTrigger key={id} value={id}>{id}</TabsTrigger>)}</TabsList><TabsContent value="local">{fixture==='advanced'?<LocalRuntimeAdvanced value={{version:1,numCtx:16384,keepAliveSeconds:300}} disabled={false} onChange={()=>{}}/>:fixture.startsWith('actions')?<Actions/>:<><LocalModelsSettings active={tab==='local'} runtime={runtime} hardwareProbe={hardwareProbe}/><AlternateRuntimeDiscovery/></>}</TabsContent>{['providers','instructions','privacy','tools'].map(id=><TabsContent key={id} value={id}>{id}</TabsContent>)}</Tabs></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
