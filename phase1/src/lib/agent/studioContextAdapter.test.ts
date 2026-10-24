import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codeStudio} from '../studios/code';
import {photosStudio} from '../studios/photos';
import {buildAgentStudioContext,resolveAgentToolSet,resolveAgentQuickActions,hasAgentContextAdapter,withAgentStudioContext} from './studioContextAdapter';
import type {UiContext} from '../uiContext';
import type {Command} from '../commandRegistry';
import type {AgentProviderRequest} from './types';
import {AgentProjectTools} from './projectTools';
import {AgentToolRegistry} from './toolRegistry';
import {AgentSession} from './session';
const ui:UiContext={domain:'web',surface:'canvas',selection:{kind:'multi',count:2,mixedTags:false,anyLocked:false},activeTool:'select',nodeId:null,file:'a.html',flags:{locked:false,dirty:false,readonly:false,collab:false,hasProblemsForSelection:false,breakpoint:null}};
const build=(studio=codeStudio,path='a.html')=>buildAgentStudioContext(studio,{path,media:studio.id==='photos'},ui,'design');
const def=(name:string)=>({name,description:name,parameters:{type:'object'}});
test('Code/Photos manifests swap bounded tool sets and providers; empty gets no tools',()=>{
 const code=build(),photo=build(photosStudio,'image.png');assert.equal(code.studioId,'code');assert.equal(code.selectionSummary,'2 selected items');assert.equal(photo.selectionSummary,'No selection');
 const available=['code_read_range','photo_inspect','photo_propose_settings','missing','global'].map(def);
 assert.deepEqual(resolveAgentToolSet(available,code).map(t=>t.name),['code_read_range']);
 assert.deepEqual(resolveAgentToolSet(available,photo,['global']).map(t=>t.name),['photo_inspect','photo_propose_settings','global']);
 assert.deepEqual(build(codeStudio,'').capabilities,[]);assert.equal(hasAgentContextAdapter({...photosStudio,id:'sound',agentV2:undefined}),false);
});
test('v2 overrides defaults; command actions use registry titles and availability, not model prose',()=>{
 const studio={...photosStudio,agentV2:{tools:['photo_inspect'],contextProviders:['bounded'],quickActions:['photos.tone','missing','photos.tone','code.nope']}};
 const command:Command={id:'photos.tone',title:'Tone settings',category:'Tools',studio:'photos',when:'selection.count>0',run:()=>{throw Error('must not execute during resolution');}};
 assert.deepEqual(build(studio,'image.png').capabilities,['photo_inspect']);
 const actions=resolveAgentQuickActions(studio,{studio:'photos',selection:{kind:'none',count:0},busy:false,services:{}},id=>id==='photos.tone'?command:id==='code.nope'?{...command,id,studio:'code'}:undefined);
 assert.deepEqual(actions,[{id:'photos.tone',title:'Tone settings',enabled:false}]);
});
test('tool allowlist gates execution as well as advertisement',async()=>{
 let called=false;const registry=new AgentToolRegistry().register({definition:def('photo_inspect'),level:'read',async run(){called=true;return '{}';}});
 const tools=new AgentProjectTools({projectId:'p',files:()=>({}),allowed:()=>true},undefined,undefined,{registry,nativeOnly:true,toolNames:[]});
 assert.deepEqual(tools.definitions(),[]);await assert.rejects(tools.execute({id:'x',name:'photo_inspect',arguments:'{}'},new AbortController().signal),/outside the active studio/);assert.equal(called,false);
});
test('one conversation survives a session tool swap; context notes never enter replay history',async()=>{
 const requests:AgentProviderRequest[]=[];const provider={id:'fixture',locality:'local' as const,async *stream(request:AgentProviderRequest){requests.push(request);yield {type:'text' as const,text:'Kept answer'};yield {type:'finish' as const,reason:'stop'};}};
 const make=(studio=codeStudio,path='a.html')=>new AgentSession({provider:withAgentStudioContext(provider,build(studio,path)),model:'fixture'});
 const first=make();await first.prompt('First message');const second=make(photosStudio,'photo.png');second.restore(first.snapshot());await second.prompt('Second message');
 assert.equal(requests[1].messages[1].role,'system');assert.match(requests[1].messages[1].content,/Now in Photos/);assert.ok(requests[1].messages.some(m=>m.content==='First message'));assert.ok(requests[1].messages.some(m=>m.content==='Kept answer'));
 assert.equal(second.snapshot().messages.some(m=>m.content.includes('Now in')),false);
});

test('real Photos registry gives only photo tools during a Code-to-Photos session swap',async()=>{
 const {createPhotoDevelopRegistry,photoDevelopAdapter,serializePhotoSettings}=await import('./photoStudio');
 const {DocumentRegistry}=await import('./documentCore');
 const documents=new DocumentRegistry([photoDevelopAdapter]);const text=serializePhotoSettings({exposure:0,contrast:0,saturation:0});
 documents.sync({'image.png':text},undefined,{'image.png':{kind:'photo',adapter:photoDevelopAdapter.id,identity:'photo-local',revision:0}});
 const registry=createPhotoDevelopRegistry({snapshot:()=>documents.snapshot('image.png'),info:()=>({name:'image.png',mime:'image/png',width:8,height:4}),propose:()=>{throw Error('must stay inspection-only in this test');}});
 const photo=build(photosStudio,'image.png');const tools=new AgentProjectTools({projectId:'p',files:()=>({'image.png':text}),allowed:()=>true},undefined,undefined,{registry,nativeOnly:true,nativePath:()=>true,toolNames:resolveAgentToolSet(registry.definitions(),photo).map(t=>t.name)});
 let names:string[]=[];const provider={id:'fixture',locality:'local' as const,async *stream(request:AgentProviderRequest){names=request.tools.map(t=>t.name);yield {type:'text' as const,text:'Photo guidance'};yield {type:'finish' as const,reason:'stop'};}};
 const code=new AgentSession({model:'fixture',provider});await code.prompt('Code question');
 const session=new AgentSession({model:'fixture',provider:withAgentStudioContext(provider,photo),tools});session.restore({...code.snapshot(),projectId:'p'});await session.prompt('Photo question');
 assert.deepEqual(names,['photo_inspect','photo_propose_settings']);assert.equal(session.snapshot().messages[0].content,'Code question');
 const inspected=JSON.parse(await tools.execute({id:'i',name:'photo_inspect',arguments:'{}'},new AbortController().signal));assert.equal(inspected.pixelsDisclosed,false);
 await assert.rejects(tools.execute({id:'bad',name:'code_read_range',arguments:'{}'},new AbortController().signal),/outside the active studio/);
});

test('quick action rechecks current studio availability before executing',async()=>{
 const {runAgentQuickAction}=await import('./studioContextAdapter');let called=false;
 const studio={...photosStudio,agentV2:{tools:[],contextProviders:[],quickActions:['photos.tone']}};
 const command:Command={id:'photos.tone',title:'Tone',category:'Tools',studio:'photos',enabled:()=>false,run:()=>{}};
 assert.equal(await runAgentQuickAction(command.id,studio,{studio:'photos',selection:{kind:'none',count:0},busy:false,services:{}},()=>command,async()=>{called=true;return true;}),false);assert.equal(called,false);
});
