import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentRegistry,PolicyGateway,TransactionManager,studioFor} from './documentCore';
import {codeAdapter} from './codeStudio';
import {photoAdapter,photoDevelopAdapter,serializePhotoSettings} from './photoStudio';
import {activeStudioDocument} from './studioTarget';
import {studioAgentContext} from './studioContext';
import {createStudioReadOnlyRegistry} from './studioReadOnly';
import {AgentProjectTools} from './projectTools';
import {AgentSession} from './session';
import {createSoundStudioRegistry,soundAdapter,serializeSound} from './soundStudio';
import {DEFAULT_SETTINGS} from '../sound/recipe';

test('studio routing covers every shipped file family',()=>{
 for(const [path,kind] of Object.entries({'a.html':'code','a.png':'photo','a.svg':'designer','a.docx':'documents','a.xlsx':'sheets','a.pptx':'slides','a.wav':'sound','a.aif':'sound','a.mp4':'video'}))assert.equal(studioFor(path),kind);
});
test('explicit same-kind adapters do not confuse Raster and Develop; replacement creates fresh identity',()=>{
 const r=new DocumentRegistry([photoAdapter,photoDevelopAdapter]),text=serializePhotoSettings({exposure:0,contrast:0,saturation:0});
 const binding={kind:'photo' as const,adapter:photoDevelopAdapter.id,identity:'local-1',revision:1};r.sync({'a.png':text},undefined,{'a.png':binding});const base=r.snapshot('a.png').ref;
 assert.equal(base.adapter,photoDevelopAdapter.id);r.validate(base,text);
 r.sync({'a.png':text},undefined,{'a.png':{...binding,revision:3}});assert.throws(()=>r.assert(base),/changed/);
 const edited=r.snapshot('a.png').ref;r.sync({'a.png':text},undefined,{'a.png':{...binding,identity:'local-2'}});assert.notEqual(r.snapshot('a.png').ref.documentId,edited.documentId);
 r.sync({'a.png':text},undefined,{'a.png':{...binding,adapter:photoAdapter.id}});assert.equal(r.snapshot('a.png').ref.adapter,photoAdapter.id);
});
test('sidebar follows legacy Code media preview and mismatched studio has no document',()=>{
 const media={active:'clip.mp4',items:[{name:'clip.mp4',kind:'video'}]},app={activeStudio:'code',activeFile:'index.html',editorKind:null};
 assert.deepEqual(activeStudioDocument(app,media),{path:'clip.mp4',media:true});
 assert.deepEqual(activeStudioDocument({...app,activeStudio:'video'},media),{path:'clip.mp4',media:true});
 assert.deepEqual(activeStudioDocument({...app,activeStudio:'sound'},media),{path:'',media:false});
 for(const studio of ['code','documents','sheets','slides','sound','video','photos','designer','design'])assert.ok(studioAgentContext(studio,'').actions.length>0);
});
test('read-only studio exposes inspection only, no generic file tool fallback',async()=>{
 const registry=new DocumentRegistry();registry.sync({'book.xlsx':'selected-cell-only'});const base=registry.snapshot('book.xlsx');
 const tools=new AgentProjectTools({projectId:'p',files:()=>({'book.xlsx':base.text}),allowed:()=>true},undefined,undefined,{registry:createStudioReadOnlyRegistry(()=>registry.assert(base.ref)),nativeOnly:true,nativePath:p=>p==='book.xlsx'});
 assert.deepEqual(tools.definitions().map(t=>t.name),['studio_inspect']);const signal=new AbortController().signal;
 const out=JSON.parse(await tools.execute({id:'t',name:'studio_inspect',arguments:'{}'},signal));assert.equal(out.editable,false);assert.equal(out.trust,'untrusted-document');
 await assert.rejects(tools.execute({id:'t',name:'write_file',arguments:'{}'},signal),/Only scoped/);
 await assert.rejects(tools.execute({id:'t',name:'studio_inspect',arguments:'{"extra":true}'},signal),/Unexpected/);
 registry.sync({});await assert.rejects(tools.execute({id:'t',name:'studio_inspect',arguments:'{}'},signal),/no longer open/);
});
test('async studio apply and undo finish before transaction state changes; rejected undo stays accepted',async()=>{
 const r=new DocumentRegistry([codeAdapter]);r.sync({'a.html':'before'});const base=r.snapshot('a.html').ref,policy=new PolicyGateway();policy.grant({effect:'inspect',documentIds:[base.documentId]});
 let finish=()=>{},undoFails=false,text='before';const tx=new TransactionManager(r,policy,{hold:async()=>{},canAccept:()=>true,apply:async(_path,after)=>{await new Promise<void>(resolve=>{finish=resolve;});text=after;},undo:async()=>{if(undoFails)throw Error('later manual edit');await Promise.resolve();text='before';}});
 const p=tx.propose('r',base,'after');policy.grant({effect:'edit',documentIds:[base.documentId],proposalId:p.id});const pending=tx.accept(p.id,p.after);await Promise.resolve();assert.equal(tx.get(p.id).state,'review');assert.equal(text,'before');finish();await pending;assert.equal(tx.get(p.id).state,'accepted');undoFails=true;await assert.rejects(async()=>tx.undo(p.id),/later manual edit/);assert.equal(tx.get(p.id).state,'accepted');undoFails=false;await tx.undo(p.id);assert.equal(tx.get(p.id).state,'undone');assert.equal(text,'before');
});
test('Sound adapter staging reaches the shared session review store, never applies during inference',async()=>{
 const before=serializeSound(DEFAULT_SETTINGS),r=new DocumentRegistry([soundAdapter]);r.sync({'clip.mp3':before});const base=r.snapshot('clip.mp3');let staged:string|undefined;
 const registry=createSoundStudioRegistry({snapshot:()=>r.assert(base.ref),plugins:()=>[],info:()=>({name:'clip.mp3',duration_s:10,sample_rate:44100,channels:2,rendered:null}),propose:after=>{staged=after;}});
 const run=registry.run.bind(registry);registry.run=async(n,a,c,s,g)=>{staged=undefined;const out=await run(n,a,c,s,g);if(staged!==undefined)await c.propose(base.ref.path,staged,s);return out;};
 const tools=new AgentProjectTools({projectId:'p',files:()=>({'clip.mp3':before}),allowed:p=>p==='clip.mp3'},undefined,undefined,{registry,nativeOnly:true,nativePath:p=>p==='clip.mp3'});let rounds=0;const session=new AgentSession({tools,model:'fixture',provider:{id:'fixture',locality:'local',async *stream(){if(++rounds===1){yield {type:'tool-call',index:0,id:'c',name:'sound_propose_settings',arguments:'{"settings":{"pitch":2}}'};yield {type:'finish',reason:'tool_calls'};}else {yield {type:'text',text:'Review the settings.'};yield {type:'finish',reason:'stop'};}}}});
 await session.prompt('Suggest a pitch change');assert.equal(tools.proposals().length,1);assert.equal(JSON.parse(tools.proposals()[0].after).pitch,2);assert.equal(r.snapshot('clip.mp3').text,before);assert.equal(session.status,'review');
});
