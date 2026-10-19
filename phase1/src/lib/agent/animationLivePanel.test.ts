import {test} from 'node:test';import assert from 'node:assert/strict';
import {AnimationSession,setAnimationSession} from '../animation/session';
import {findComp,findLayer} from '../animation/model';
import {createAnimationRunTools} from './animationLivePanel';
import {AnimationKeyTransactions} from './animationKeyTransactions';
import type {AgentEvent} from './coreTypes';

const studio={studioId:'animation',label:'Animation',documentRef:null,selectionSummary:'No selection',mode:'design',capabilities:[],contextProviders:[] as readonly string[]};
function animationFixture(){
 const session=new AnimationSession(null);
 session.createBlank('demo');
 session.dispatch([{type:'layer.add',kind:'shape',id:'L'},{type:'prop.animate',layer:'L',prop:'opacity',on:true,t:0}]);
 session.setView({selectedLayer:'L'});
 session.selectKeys([{layer:'L',prop:'opacity',t:0}]);
 setAnimationSession(session);
 return {session,value:()=>findLayer(findComp(session.document!),'L')!.transform.opacity.keys[0].v};
}
/** Stubbed loopback daemon: verified local weights, declared tool support, scripted rounds. */
function stubOllama(rounds:string[][]){
 const bodies:string[]=[];
 const previous=globalThis.fetch;
 globalThis.fetch=async(input:any,init?:any)=>{
  const url=String(input);
  if(url.endsWith('/api/show'))return new Response(JSON.stringify({model_info:{'general.architecture':'fixture'},capabilities:['tools']}),{status:200});
  if(url.endsWith('/api/chat')){bodies.push(String(init?.body??''));const lines=rounds[Math.min(bodies.length-1,rounds.length-1)];return new Response(lines.join('\n')+'\n',{status:200});}
  throw Error('Unexpected endpoint: '+url);
 };
 return {bodies,restore:()=>{globalThis.fetch=previous;}};
}

test('sidepanel run offers the reviewed key tools to the local model and accepts/undoes through the host',async()=>{
 const f=animationFixture();
 const daemon=stubOllama([
  ['{"message":{"content":"","tool_calls":[{"function":{"name":"animation_propose_key","arguments":{"value":55}}}]},"done":true}'],
  ['{"message":{"content":"Key staged for review."},"done":true}'],
 ]);
 try{
  const {configureAgent,realCore}=await import('./panelBridge');
  realCore.clear?.();
  configureAgent({provider:'ollama',model:'exact:tag',apiKey:'',allowActiveFile:false});
  const events:AgentEvent[]=[];
  realCore.run({prompt:'Set the selected opacity key to 55',context:{activeFile:'',selectedElementId:null,studio}},event=>events.push(event));
  await new Promise<void>((resolve,reject)=>{const deadline=Date.now()+5000;(function poll(){if(events.some(e=>e.type==='done'||e.type==='error'))return resolve();if(Date.now()>deadline)return reject(Error('Run did not finish: '+JSON.stringify(events)));setTimeout(poll,5);})();});
  assert.ok(!events.some(e=>e.type==='error'),JSON.stringify(events));
  const chat=JSON.parse(daemon.bodies[0]);
  assert.deepEqual(chat.tools.map((t:any)=>t.function.name),['animation_inspect_key','animation_propose_key'],'exactly the two reviewed port tools are offered');
  const proposal=events.find(e=>e.type==='proposal');
  assert.ok(proposal&&proposal.type==='proposal');
  assert.equal(proposal.proposal.animation?.before,'100');
  assert.equal(proposal.proposal.animation?.after,'55');
  assert.match(proposal.proposal.animation?.label??'',/opacity key/);
  assert.equal(f.value(),100,'the staged preview never mutated the session');
  // A pending review blocks the next turn before any provider traffic.
  const blocked:AgentEvent[]=[];const before=daemon.bodies.length;
  realCore.run({prompt:'again',context:{activeFile:'',selectedElementId:null,studio}},event=>blocked.push(event));
  await new Promise<void>(resolve=>setTimeout(resolve,50));
  assert.ok(blocked.some(e=>e.type==='error'&&/review the pending proposal/.test(e.message)),JSON.stringify(blocked));
  assert.equal(daemon.bodies.length,before,'blocked run never contacted the provider');
  await realCore.applyProposal(proposal.proposal.id);
  assert.equal(f.value(),55);
  await realCore.revertProposal(proposal.proposal.id);
  assert.equal(f.value(),100);
  realCore.clear?.();
 }finally{daemon.restore();setAnimationSession(null);}
});

test('animation tools stay unavailable for cloud providers and without an open document',async()=>{
 const transactions=new AnimationKeyTransactions();
 const assertRun=()=>{};
 assert.equal(createAnimationRunTools({studio,provider:'openrouter',projectId:'1',assertRun,transactions,send:null,onReview:()=>{}}),null,'no cloud fallback');
 setAnimationSession(null);
 assert.equal(createAnimationRunTools({studio,provider:'ollama',projectId:'1',assertRun,transactions,send:null,onReview:()=>{}}),null,'no open animation document');
 assert.equal(createAnimationRunTools({studio:{...studio,studioId:'code'},provider:'ollama',projectId:'1',assertRun,transactions,send:null,onReview:()=>{}}),null,'other studio');
 const f=animationFixture();
 try{
  const run=createAnimationRunTools({studio,provider:'ollama',projectId:'1',assertRun,transactions,send:null,onReview:()=>{}});
  assert.ok(run);
  assert.deepEqual(run.tools.definitions().map(d=>d.name),['animation_inspect_key','animation_propose_key']);
  assert.equal(run.label,'demo');
 }finally{setAnimationSession(null);}
});
