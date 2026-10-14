import {LocalVoiceInput} from '../src/components/agent/LocalVoiceInput';
import {LocalStudioAssistant} from '../src/components/agent/LocalStudioAssistant';
import {interfaceSession} from '../src/lib/interface/session';
import {addNode} from '../src/lib/interface/model';
import {AnimationSession,setAnimationSession} from '../src/lib/animation/session';
import {patchStudio3D} from '../src/lib/studio3d/session';
import {LocalAIHealth} from '../src/components/agent/LocalAIHealth';
import {setLocale} from '../src/lib/i18n';
import {LocalVisionApplication} from '../src/components/agent/LocalVisionApplication';
import {LocalToolDiagnostics} from '../src/components/agent/LocalToolDiagnostics';
import {EditorProject} from '@somnia/editor-core';
import {connectEditorProject} from '../src/store/appStore';
import {initializeAgentSettings} from '../src/lib/agent/settingsRuntime';
import {LocalQualityProbes} from '../src/components/agent/LocalQualityProbes';
import {visionFixtures} from '../src/lib/agent/localQualityProbes';
import {LocalVisionTest} from '../src/components/agent/LocalVisionTest';
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
if(new URLSearchParams(location.search).get('locale')==='de')setLocale('de');
const fixture=new URLSearchParams(location.search).get('state')??'running';
const runtime=new LocalModelsRuntime(undefined,async(op,model)=>{
 if(fixture==='unreachable'||fixture==='not-found')throw Error('fixture offline');
 if(op==='version')return {version:'0.12.1'};
 if(op==='ps')return {models:[{model:'qwen3:4b',size_vram:2200000000,context_length:4096}]};
 if(op==='tags')return fixture==='malformed'?{}:{models:fixture==='empty'?[]:[{name:'qwen3:4b',size:2500000000,details:{parameter_size:'4B',quantization_level:'Q4_K_M'}},{name:'gemma3:4b',size:3300000000},{name:'remote-cloud',size:0}]};
 return {capabilities:model==='gemma3:4b'?['completion','vision']:['completion','tools'],model_info:{architecture:'fixture'},...(model==='remote-cloud'?{remote_host:'fixture.invalid'}:{})};
},async()=>({installed:fixture!=='not-found'}),()=>true);
let installed=true;let transfer=0;
const actionRuntime=new LocalModelsRuntime(undefined,async(op)=>op==='version'?{version:'1'}:op==='tags'?{models:installed?[{name:'qwen3:4b',digest:'fixture-digest'}]:[]}:{model_info:{architecture:'fixture'}},async()=>({installed:true}),()=>true);
const manager=new LocalModelManager(actionRuntime,{start:async()=>{transfer=0;return 'fixture';},next:async()=>{await new Promise(resolve=>setTimeout(resolve,fixture==='actions-slow'||fixture==='health-pull'?1500:100));return transfer++===0?Array.from(new TextEncoder().encode('{"status":"pulling","digest":"layer-a","completed":500,"total":1000}\n')):Array.from(new TextEncoder().encode('{"status":"success"}\n'));},cancel:async()=> 'unknown',remove:async()=>{installed=false;},launch:async()=>({launched:false,instruction:'sudo systemctl start ollama'})},()=>true);
function Actions(){const [snapshot,setSnapshot]=useState<RuntimeSnapshot|null>(null);React.useEffect(()=>{void actionRuntime.snapshot().then(setSnapshot);},[]);return <LocalModelActions manager={manager} snapshot={snapshot} onChanged={async()=>setSnapshot(await actionRuntime.snapshot())}/>;}
const hardwareProbe=async():Promise<Hardware>=>({os:'fixture',arch:'x86_64',cpu:'Fixture CPU',cores:8,ramTotalBytes:32*1024**3,ramAvailableBytes:20*1024**3,gpus:[{name:'Fixture GPU',totalBytes:8*1024**3,freeBytes:6*1024**3,unified:false,lowerBound:false}],errors:[],checkedAt:Date.now()});
function Application(){React.useEffect(()=>{connectEditorProject(new EditorProject({'notes.md':'# Studio notes'}));void initializeAgentSettings();},[]);return <><LocalVisionApplication text="A red square on a white background." model="fixture-vision"/><LocalToolDiagnostics definitions={[{name:'simple_read',description:'Read',parameters:{type:'object'}},{name:'complex_edit',description:'Edit',parameters:{$ref:'#/large'}}]}/></>;}
function Health(){React.useEffect(()=>{if(fixture==='health-pull')void manager.pull('qwen3:4b');},[]);const [snapshot,setSnapshot]=useState<RuntimeSnapshot|null>({state:'unreachable',installed:null,models:[],checkedAt:Date.now(),inventoryError:false});return <LocalAIHealth snapshot={snapshot} busy={false} manager={manager} onRefresh={()=>setSnapshot({state:'running',installed:true,version:'fixture',models:[],checkedAt:Date.now(),inventoryError:false})}/>;}
function StudioFixture(){const [ready,setReady]=useState(false);React.useEffect(()=>{void initializeAgentSettings().then(()=>{if(fixture==='studio-interface'||fixture==='studio-image'){interfaceSession.start();let id='';interfaceSession.transact(d=>{id=addNode(d,d.pages[0].id,'frame');d.nodes.find(n=>n.id===id)!.name='Login frame';});if(fixture==='studio-image'){const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,64,64);interfaceSession.transact(d=>{const n=d.nodes.find(n=>n.id===id)!;d.assets=[{id:'asset-'+ 'a'.repeat(64),hash:'a'.repeat(64),mime:'image/png',width:64,height:64,data:c.toDataURL('image/png'),sourceName:'synthetic.png',sourceType:'png',license:'user-provided-unverified'}];n.imageFill={assetId:'asset-'+ 'a'.repeat(64),fit:'contain'};});}interfaceSession.select(id);}else if(fixture==='studio-animation'){const session=new AnimationSession();setAnimationSession(session);session.createBlank();session.dispatch({type:'layer.add',kind:'shape',id:'shape'});session.setView({selectedLayer:'shape'});}else patchStudio3D({status:'ready',name:'Fixture scene',outline:[{id:1,name:'Cube',depth:0,kind:'mesh'}]});setReady(true);});},[]);return ready?<LocalStudioAssistant kind={fixture==='studio-interface'||fixture==='studio-image'?'interface':fixture==='studio-animation'?'animation':'studio3d'} model="fixture-local" options={{version:1,numCtx:8192}}/>:null;}
function VoiceFixture(){const [ready,setReady]=useState(false);React.useEffect(()=>{connectEditorProject(new EditorProject({'notes.md':'# Voice notes'}));void initializeAgentSettings().then(()=>setReady(true));},[]);return ready?<LocalVoiceInput adapter={fixture==='voice-unavailable'?null:{id:'test-only-fake-stt',local:true,async transcribe(){return {text:'Synthetic test transcript',final:true};}}} capture={async(_signal,onLevel)=>{onLevel(.5);return {async stop(){onLevel(0);return {audio:new Blob(['synthetic']),mime:'audio/test',durationMs:100};},cancel(){onLevel(0);}};}}/>:null;}
function Fixture(){const [tab,setTab]=useState('local');return <main className="agent-settings" style={{padding:24,maxWidth:720,margin:'0 auto',height:'100vh',overflow:'auto'}}><h2>Settings &gt; AI</h2><Tabs value={tab} onValueChange={v=>setTab(String(v))}><TabsList activateOnFocus aria-label="AI settings">{['providers','local','instructions','privacy','tools'].map(id=><TabsTrigger key={id} value={id}>{id}</TabsTrigger>)}</TabsList><TabsContent value="local">{fixture.startsWith('voice-')?<VoiceFixture/>:fixture.startsWith('studio-')?<StudioFixture/>:fixture.startsWith('health')?<Health/>:fixture==='apply'?<Application/>:fixture==='probes'?<><LocalQualityProbes model="fixture-model" options={{version:1,numCtx:8192}}/><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{visionFixtures().map(f=><img width={160} height={160} key={f.id} alt={f.id} src={'data:image/png;base64,'+f.image.base64}/>)}</div></>:fixture==='vision'?<LocalVisionTest model="gemma3:4b" options={{version:1,numCtx:8192}}/>:fixture==='advanced'?<LocalRuntimeAdvanced value={{version:1,numCtx:16384,keepAliveSeconds:300}} disabled={false} onChange={()=>{}}/>:fixture.startsWith('actions')?<Actions/>:<><LocalModelsSettings active={tab==='local'} runtime={runtime} hardwareProbe={hardwareProbe}/><AlternateRuntimeDiscovery/></>}</TabsContent>{['providers','instructions','privacy','tools'].map(id=><TabsContent key={id} value={id}>{id}</TabsContent>)}</Tabs></main>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
