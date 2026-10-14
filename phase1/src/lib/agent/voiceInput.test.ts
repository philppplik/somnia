import test from 'node:test';import assert from 'node:assert/strict';
import {VoiceInputSession,validateTranscript,type CaptureFactory,type STTAdapter} from './voiceInput';
const clip=()=>({audio:new Blob(['fixture'],{type:'audio/webm'}),mime:'audio/webm',durationMs:100});
const adapter:STTAdapter={id:'test-only',local:true,async transcribe(){return {text:'Reviewed words',final:true};}};
test('capture lifecycle gives final text only after explicit finish',async()=>{
 let stops=0,cancels=0;const factory:CaptureFactory=async()=>({async stop(){stops++;return clip();},cancel(){cancels++;}});const session=new VoiceInputSession(factory,adapter);await session.start(()=>{});assert.equal(stops,0);assert.equal(await session.finish(),'Reviewed words');assert.equal(stops,1);session.cancel();assert.equal(cancels,0);
});
test('permission resolving after cancel stops the late stream and never transcribes',async()=>{
 let grant:(v:Awaited<ReturnType<CaptureFactory>>)=>void=()=>{},cancelled=0;const session=new VoiceInputSession(()=>new Promise(resolve=>{grant=resolve;}),adapter);const pending=session.start(()=>{});session.cancel();grant({async stop(){return clip();},cancel(){cancelled++;}});await assert.rejects(pending,/cancelled/);assert.equal(cancelled,1);
});
test('late STT after cancel, invalid transcript and excessive clip refuse insertion',async()=>{
 let resolve:(v:{text:string;final:true})=>void=()=>{};const session=new VoiceInputSession(async()=>({async stop(){return clip();},cancel(){}}),{id:'test-late',local:true,transcribe:()=>new Promise(r=>{resolve=r;})});await session.start(()=>{});const pending=session.finish();await Promise.resolve();await Promise.resolve();session.cancel();resolve({text:'Late',final:true});await assert.rejects(pending);
 for(const text of ['', 'a\0','a'.repeat(12001)])assert.throws(()=>validateTranscript({text,final:true}));
 const long=new VoiceInputSession(async()=>({async stop(){return {...clip(),durationMs:120001};},cancel(){}}),adapter);await long.start(()=>{});await assert.rejects(long.finish(),/Invalid/);
});
test('transcript target pins source identity and uses existing review/undo transaction',async()=>{
 const {EditorProject}=await import('@somnia/editor-core');const {connectEditorProject,applyOperations,getState}=await import('../../store/appStore');const {realCore,pinVoiceTranscriptTarget,stageVoiceTranscript}=await import('./panelBridge');
 connectEditorProject(new EditorProject({'notes.md':'# Notes'}));const target=pinVoiceTranscriptTarget();const p=stageVoiceTranscript(target,'Dictated words');assert.equal(getState().files['notes.md'],'# Notes');await realCore.applyProposal(p.id);assert.ok(getState().files['notes.md'].includes('Dictated words'));await realCore.revertProposal(p.id);assert.equal(getState().files['notes.md'],'# Notes');
 const stale=pinVoiceTranscriptTarget();applyOperations([{type:'replaceSource',file:'notes.md',text:'New edit'}]);assert.throws(()=>stageVoiceTranscript(stale,'Late words'),/changed/);realCore.clear?.();
});
