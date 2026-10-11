import {parseSnapshot,validateCommand} from './validation';
import type {Studio,VibeCommand,VibeSnapshot,VibeSpaceTransport,VibeEvent} from './types';
export const fixtureSpace={spaceId:'space-demo',name:'Website relaunch',autonomy:'ask_for_writes' as const,scopeLabel:'/projects/website',studioCount:4};
export function fixtureRun(overrides:Partial<Studio>={}):Studio{
 return {runId:'run-copy',studioId:'studio-copy',spaceId:fixtureSpace.spaceId,sequence:1,goal:'Improve the landing page copy',model:{provider:'openai',model:'configured-model',locality:'cloud'},executionState:'done',reviewState:'ready',lastStep:'Reviewed wording and accessibility checks.',startedAtUtc:'2026-10-11T10:00:00Z',finishedAtUtc:'2026-10-11T10:00:42Z',elapsedMs:42000,usage:{inputTokens:1800,outputTokens:400,cacheReadTokens:900,cacheWriteTokens:null,costUsd:0.041,costSource:'provider_reported'},messages:[],pendingConsents:[],checkpoints:[{checkpointId:'cp-start',label:'Before Studio work',createdAtUtc:'2026-10-11T10:00:00Z',fileCount:2,restorable:true}],review:{revision:'review-1',summary:'Clearer copy and a more descriptive page title.',files:[{path:'index.html',change:'modified',binary:false,beforeText:'<h1>Welcome to our website</h1>\n<p>We do things for your business.</p>',afterText:'<h1>Your next idea, made real</h1>\n<p>Websites and design for independent teams.</p>',beforeBytes:76,afterBytes:101,currentText:null,currentBytes:76,conflict:false},{path:'about.html',change:'modified',binary:false,beforeText:'<title>About</title>',afterText:'<title>About our studio</title>',beforeBytes:20,afterBytes:30,currentText:'<title>About the team - edited by you</title>',currentBytes:45,conflict:true}],conflicts:['about.html'],checks:[{name:'HTML validation',status:'passed',detail:null},{name:'Browser check',status:'not_run',detail:'Review in your browser before publishing.'}]},failure:null,capabilities:{stop:false,steer:false,pause:false,resume:false,apply:true,restore:true},...overrides};
}
export function fixtureSnapshot():VibeSnapshot{
 const ready=fixtureRun();const consent=fixtureRun({runId:'run-network',studioId:'studio-network',goal:'Check external links',executionState:'running',reviewState:'none',review:null,elapsedMs:19000,usage:null,lastStep:'Waiting for network consent.',pendingConsents:[{requestId:'request-1',action:'Fetch an external page',scope:'https://example.org/about',reason:'Check whether the linked page still exists.',allowForRun:false}],capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}});
 const running=fixtureRun({runId:'run-images',studioId:'studio-images',goal:'Improve image descriptions',executionState:'running',reviewState:'none',review:null,model:{provider:'ollama',model:'qwen3.5:9b',locality:'local'},lastStep:'Inspecting image context in /images.',elapsedMs:12000,usage:null,capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}});
 const failure=fixtureRun({runId:'run-failed',studioId:'studio-failed',goal:'Check document headings',executionState:'failed',reviewState:'none',review:null,lastStep:'Provider request failed.',failure:{code:'provider_unavailable',message:'The configured provider did not respond. No project files were changed.',retryable:true},usage:null});
 return {revision:1,spaces:[fixtureSpace],sessions:[ready,consent,running,failure].map(s=>({studioId:s.studioId,spaceId:s.spaceId,goal:s.goal,model:s.model,canStart:s.executionState==='failed'&&!!s.failure?.retryable,latestRunId:s.runId})),models:[ready.model,running.model],studios:[ready,consent,running,failure]};
}
/** Explicit opt-in only. No native adapter imports this module. */
export function createFixtureVibeSpaceTransport(environment:'development'|'test',initial:VibeSnapshot=fixtureSnapshot()):VibeSpaceTransport & {calls:VibeCommand[];emit:(event:VibeEvent)=>void;failNext:Error|null}{
 if(!['development','test'].includes(environment))throw new Error('Fixture mode is limited to explicit development or test use.');
 let snapshot=parseSnapshot(structuredClone(initial));let listener:((e:VibeEvent)=>void)|undefined;
 const transport={mode:'fixture' as const,capabilities:['create-space','create-studio','start','stop','steer','consent','review','restore','retry'] as const,calls:[] as VibeCommand[],failNext:null as Error|null,
  snapshot:async()=>structuredClone(snapshot),chooseFolder:async()=>({folderGrantId:'fixture-grant',folder:'/projects/fixture'}),
  subscribe:async(onEvent:(e:VibeEvent)=>void)=>{listener=onEvent;return()=>{listener=undefined;};},
  emit(event:VibeEvent){listener?.(event);},
  execute:async(command:VibeCommand)=>{
   validateCommand(command);transport.calls.push(structuredClone(command));
   if(transport.failNext){const e=transport.failNext;transport.failNext=null;throw e;}
   const studios=snapshot.studios.map(s=>{
    if(!('runId'in command)||command.runId!==s.runId)return s;
    const next={...s,sequence:s.sequence+1};
    
    if(command.type==='stop'){next.executionState='stopped';next.pendingConsents=[];next.capabilities={...next.capabilities,stop:false,steer:false};next.lastStep='Stopped. Partial work stays isolated.';}
    if(command.type==='steer')next.lastStep='Direction received for the next step.';
    if(command.type==='consent'){next.pendingConsents=s.pendingConsents.filter(c=>c.requestId!==command.requestId);next.lastStep=command.choice==='deny'?'Request denied. Waiting for the next native step.':'Consent recorded.';}
    if(command.type==='review'){next.reviewState=command.decision==='apply'?'applied':'discarded';next.capabilities={...next.capabilities,apply:false};}
    return next;
   });
   let spaces=snapshot.spaces;let sessions=snapshot.sessions;
   if(command.type==='create-space')spaces=[...spaces,{spaceId:`space-${spaces.length}`,name:command.name,scopeLabel:'/projects/fixture',autonomy:'ask_for_writes',studioCount:0}];
   if(command.type==='create-studio')sessions=[...sessions,{studioId:`studio-${sessions.length}`,spaceId:command.spaceId,goal:command.goal,model:command.model,canStart:true,latestRunId:null}];
   if(command.type==='start'){
    const session=sessions.find(s=>s.studioId===command.studioId);if(!session)throw new Error('Fixture session missing');
    const run=fixtureRun({runId:`run-${studios.length}`,studioId:session.studioId,spaceId:session.spaceId,goal:session.goal,model:session.model,review:null,reviewState:'none',executionState:'running',lastStep:'Starting...',elapsedMs:0,startedAtUtc:null,finishedAtUtc:null,usage:null,checkpoints:[],capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}});studios.push(run);sessions=sessions.map(s=>s.studioId===session.studioId?{...s,canStart:false,latestRunId:run.runId}:s);
   }
   snapshot=parseSnapshot({...snapshot,revision:snapshot.revision+1,spaces,sessions,studios});return structuredClone(snapshot);
  },
 };return transport;
}
