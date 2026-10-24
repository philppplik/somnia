import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BoardView} from '../../src/components/vibespace/BoardView';
import {fixtureRun,fixtureSnapshot,fixtureSpace} from '../../src/lib/vibespace/fixture';
import {setLocale} from '../../src/lib/i18n';
import type {Schedule} from '../../src/lib/vibespace/schedule';
import type {VibeIntent,VibeSnapshot} from '../../src/lib/vibespace/types';
import '../../src/components/vibespace/vibespace.css';

setLocale(new URLSearchParams(location.search).get('locale')??'en');

const base=fixtureSnapshot();
const running2=fixtureRun({runId:'run-styles',studioId:'studio-styles',goal:'Tighten the stylesheet',executionState:'running',reviewState:'none',review:null,lastStep:'Rewriting unused rules.',elapsedMs:30500,usage:{inputTokens:4200,outputTokens:800,cacheReadTokens:null,cacheWriteTokens:120,costUsd:0.062,costSource:'provider_reported_partial'},capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}});
const applied=fixtureRun({runId:'run-alt',studioId:'studio-alt',goal:'Rewrite the about page',reviewState:'applied',review:null,lastStep:'Applied after review.',capabilities:{stop:false,steer:false,pause:false,resume:false,apply:false,restore:true}});
const snapshot0:VibeSnapshot={...base,
 studios:[...base.studios,running2,applied],
 sessions:[...base.sessions,
  {studioId:'studio-styles',spaceId:base.spaces[0].spaceId,goal:running2.goal,model:running2.model,canStart:false,latestRunId:'run-styles'},
  {studioId:'studio-alt',spaceId:base.spaces[0].spaceId,goal:applied.goal,model:applied.model,canStart:false,latestRunId:'run-alt'},
  {studioId:'studio-draft',spaceId:base.spaces[0].spaceId,goal:'Plan the launch checklist',model:base.models[0],canStart:true,latestRunId:null},
 ]};
const NOW=new Date('2026-10-11T12:00:00Z').getTime();
const sched=(id:string,studioId:string,nextRunMs:number,enabled=true):Schedule=>({id,spec:{name:id,studioId,cronExpr:'0 9 * * 1',timezone:'Europe/Berlin',misfirePolicy:{kind:'coalesce'},consentLevel:'ask_for_writes',autoApply:false},enabled,nextRunMs});
const schedules:Schedule[]=[
 sched('Morning images','studio-images',NOW+3_600_000),
 sched('Second images','studio-images',NOW+3_600_000),
 sched('Overdue links','studio-network',NOW-60_000),
 sched('Off duty','studio-copy',NOW+7_200_000,false),
];

declare global {interface Window {boardCalls:Record<string,unknown>[]}}
window.boardCalls=[];

function BoardFixture(){
 const [snapshot,setSnapshot]=useState(snapshot0);
 const onAction=async(intent:VibeIntent)=>{
  window.boardCalls.push(intent as unknown as Record<string,unknown>);
  if(intent.type==='stop'&&'runId' in intent)setSnapshot(s=>({...s,studios:s.studios.map(r=>r.runId===intent.runId?{...r,executionState:'stopped' as const,pendingConsents:[],capabilities:{...r.capabilities,stop:false,steer:false},lastStep:'Stopped. Partial work stays isolated.'}:r)}));
  if(intent.type==='start'&&'studioId' in intent){const session=snapshot.sessions.find(x=>x.studioId===intent.studioId)!;const run=fixtureRun({runId:'run-new',studioId:session.studioId,goal:session.goal,model:session.model,executionState:'running',reviewState:'none',review:null,lastStep:'Starting...',capabilities:{stop:true,steer:true,pause:false,resume:false,apply:false,restore:false}});setSnapshot(s=>({...s,studios:[...s.studios,run],sessions:s.sessions.map(x=>x.studioId===session.studioId?{...x,canStart:false,latestRunId:run.runId}:x)}));}
  return true;
 };
 return <section className="vs-root"><BoardView space={fixtureSpace} snapshot={snapshot} schedules={schedules} pending={false}
  capabilities={['create-space','create-studio','start','stop','steer','consent','review','restore','retry','apply-hunks','request-changes']}
  mode="fixture" onAction={onAction} onOpenRun={()=>{}} nowMs={NOW}/></section>;
}
document.body.style.cssText='font-family:system-ui;margin:24px;background:#f3f4f7';
createRoot(document.getElementById('root')!).render(<BoardFixture/>);
