import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aggregateCostLabel,aggregateUsage,boardProjection,BOARD_COLUMNS,columnForState,scheduleConflicts} from './board';
import {studioStates} from './types';
import {fixtureRun,fixtureSnapshot,fixtureSpace} from './fixture';
import type {Studio} from './types';
import type {Schedule} from './schedule';

const NOW=new Date('2026-10-11T12:00:00Z').getTime();
const schedule=(id:string,studioId:string,nextRunMs:number,enabled=true):Schedule=>({id,spec:{name:id,studioId,cronExpr:'0 9 * * 1',timezone:'Europe/Berlin',misfirePolicy:{kind:'coalesce'},consentLevel:'ask_for_writes',autoApply:false},enabled,nextRunMs});

test('board columns cover every core run state exactly once; no second state machine',()=>{
 const seen=new Set<string>();
 for(const state of studioStates){const column=columnForState(state);assert.ok(BOARD_COLUMNS.includes(column),state);seen.add(column);}
 assert.equal(studioStates.length,11);
 assert.deepEqual([...seen].sort(),[...BOARD_COLUMNS].sort(),'every column reachable');
 assert.equal(columnForState('needs-you'),'needs-you');
 assert.equal(columnForState('paused'),'running');
 assert.equal(columnForState('done'),'ready');
 assert.equal(columnForState('crashed'),'closed');
});

test('projection groups parallel runs by column, drafts come from run-less sessions',()=>{
 const snapshot=fixtureSnapshot();
 const projection=boardProjection(snapshot,fixtureSpace.spaceId);
 assert.deepEqual(projection.columns['needs-you'].map(s=>s.runId),['run-network']);
 assert.deepEqual(projection.columns.running.map(s=>s.runId),['run-images']);
 assert.deepEqual(projection.columns.ready.map(s=>s.runId),['run-copy']);
 assert.deepEqual(projection.columns.closed.map(s=>s.runId),['run-failed']);
 assert.equal(projection.drafts.length,0);
 assert.equal(projection.concurrency.total,4);
 assert.equal(projection.concurrency.active,1);
 assert.equal(projection.concurrency.needsYou,1);
 const withDraft=boardProjection({studios:snapshot.studios,sessions:[...snapshot.sessions,{studioId:'studio-new',spaceId:fixtureSpace.spaceId,goal:'g',model:snapshot.models[0],canStart:true,latestRunId:null}]},fixtureSpace.spaceId);
 assert.deepEqual(withDraft.drafts.map(s=>s.studioId),['studio-new']);
 assert.equal(withDraft.concurrency.draft,1);
 const other=boardProjection(snapshot,'space-elsewhere');
 assert.equal(other.concurrency.total,0,'other spaces never leak onto the board');
});

test('A10 aggregation: missing usage makes fields unknown (null), never zero',()=>{
 const reported=fixtureRun({usage:{inputTokens:100,outputTokens:50,cacheReadTokens:10,cacheWriteTokens:5,costUsd:0.02,costSource:'provider_reported'}});
 const silent=fixtureRun({runId:'run-silent',usage:null});
 const agg=aggregateUsage([reported,silent]);
 assert.equal(agg.inputTokens,null,'unreported run does not vanish into the total');
 assert.equal(agg.outputTokens,null);
 assert.equal(agg.cacheReadTokens,null);
 assert.equal(agg.costUsd,0.02,'reported cost is still shown');
 assert.equal(agg.costComplete,false,'cloud run without report: cost is partial');
 assert.equal(agg.partialCost,true);
 assert.equal(agg.runsWithUsage,1);
 assert.equal(agg.runsWithoutUsage,1);
});

test('A10 aggregation: local runs are known-free, partial sources stay marked',()=>{
 const cloud=fixtureRun({usage:{inputTokens:100,outputTokens:50,cacheReadTokens:null,cacheWriteTokens:5,costUsd:0.02,costSource:'provider_reported_partial'}});
 const local=fixtureRun({runId:'run-local',model:{provider:'ollama',model:'qwen3.5:9b',locality:'local'},usage:null});
 const agg=aggregateUsage([cloud,local]);
 assert.equal(agg.cacheReadTokens,null,'null cacheRead stays unknown');
 assert.equal(agg.cacheWriteTokens,null,'the silent run poisons the total, not zero-fills it');
 assert.equal(agg.costComplete,false,'cloud partial source: incomplete');
 assert.equal(agg.partialCost,true);
 const localOnly=aggregateUsage([local]);
 assert.equal(localOnly.costComplete,true,'a local run without usage is not a cost gap');
 assert.equal(localOnly.costUsd,null);
 assert.equal(aggregateCostLabel(0.0041),'USD 0.0041');
 assert.equal(aggregateCostLabel(1.5),'USD 1.50');
 const empty=aggregateUsage([]);
 assert.equal(empty.costUsd,null);
 assert.equal(empty.inputTokens,null);
});

test('complete reporting sums exactly',()=>{
 const a=fixtureRun({usage:{inputTokens:100,outputTokens:50,cacheReadTokens:10,cacheWriteTokens:5,costUsd:0.02,costSource:'provider_reported'}});
 const b=fixtureRun({runId:'run-b',usage:{inputTokens:200,outputTokens:60,cacheReadTokens:20,cacheWriteTokens:6,costUsd:0.03,costSource:'provider_reported'}});
 const agg=aggregateUsage([a,b]);
 assert.deepEqual({i:agg.inputTokens,o:agg.outputTokens,r:agg.cacheReadTokens,w:agg.cacheWriteTokens,c:agg.costUsd},{i:300,o:110,r:30,w:11,c:0.05});
 assert.equal(agg.costComplete,true);
 assert.equal(agg.partialCost,false);
});

test('schedule conflicts: same slot on one studio; due while its run is active',()=>{
 const activeRun=fixtureRun({runId:'run-a',studioId:'studio-a',executionState:'running',reviewState:'none',review:null});
 const conflicts=scheduleConflicts([
  schedule('s1','studio-a',NOW+60_000),
  schedule('s2','studio-a',NOW+60_000),
  schedule('s3','studio-a',NOW-1_000),
  schedule('s4','studio-b',NOW+60_000),
  schedule('s5','studio-a',NOW-1_000,false),
 ],[activeRun],NOW);
 const sameSlot=conflicts.find(c=>c.kind==='same-slot');
 assert.deepEqual(sameSlot?.scheduleIds,['s1','s2']);
 const overlap=conflicts.filter(c=>c.kind==='active-overlap');
 assert.deepEqual(overlap.map(c=>c.scheduleIds),[['s3']],'disabled s5 and future s1/s2 are not overlaps');
});

test('schedule conflicts: parallel studios never conflict; inactive runs do not overlap',()=>{
 const doneRun=fixtureRun({runId:'run-a',studioId:'studio-a',executionState:'done'});
 const conflicts=scheduleConflicts([schedule('s1','studio-a',NOW+60_000),schedule('s2','studio-b',NOW+60_000),schedule('s3','studio-a',NOW-1_000)],[doneRun],NOW);
 assert.deepEqual(conflicts,[],'different studios sharing a slot is fine; a finished run blocks nothing');
});

test('ownership: the board projection and view contain no runtime, transport or invoke path',()=>{
 for(const file of['src/lib/vibespace/board.ts','src/components/vibespace/BoardView.tsx']){
  const source=readFileSync(new URL(`../../../${file}`,import.meta.url),'utf8');
  assert.ok(!source.includes('@tauri-apps'),file);
  assert.ok(!/\binvoke\s*\(/.test(source),file);
  assert.ok(!/from '\.\/controller'|from '\.\.\/\.\.\/\.\.\/lib\/vibespace\/controller'/.test(source),file);
  assert.ok(!source.includes('vibespace_stop_run'),file);
 }
});
