/**
 * A8 multi-agent board projection. Pure presentation over the single native runtime
 * owner: run states are derived with the existing studioState() from the core wire
 * (no second state machine), and this module never dispatches effects. Control
 * intents (stop/steer/consent/review) leave the board as plain VibeIntent data and
 * are executed by the one VibeSpaceController that owns the native connection.
 */
import {studioState} from './state';
import type {Schedule} from './schedule';
import type {Studio,StudioState,StudioSummary,VibeSnapshot} from './types';

/** Board columns map to run state, not user labels (concept 3.6). */
export const BOARD_COLUMNS=['draft','running','needs-you','ready','closed'] as const;
export type BoardColumnId=typeof BOARD_COLUMNS[number];

const COLUMN_BY_STATE:Record<StudioState,BoardColumnId>={
 'draft':'draft',
 'running':'running','paused':'running',
 'needs-you':'needs-you',
 'ready':'ready','done':'ready',
 'applied':'closed','discarded':'closed','failed':'closed','crashed':'closed','stopped':'closed',
};
export function columnForState(state:StudioState):BoardColumnId{return COLUMN_BY_STATE[state];}

export interface BoardConcurrency {draft:number;active:number;needsYou:number;ready:number;closed:number;total:number}
export interface BoardProjection {
 columns:Record<BoardColumnId,Studio[]>;
 /** Studios that exist as sessions but have no run yet. */
 drafts:StudioSummary[];
 concurrency:BoardConcurrency;
}

/** Groups the space's runs into board columns. Runs keep snapshot order; nothing is invented. */
export function boardProjection(snapshot:Pick<VibeSnapshot,'studios'|'sessions'>,spaceId:string):BoardProjection{
 const columns:Record<BoardColumnId,Studio[]>={draft:[],running:[],'needs-you':[],ready:[],closed:[]};
 for(const studio of snapshot.studios){
  if(studio.spaceId!==spaceId)continue;
  columns[columnForState(studioState(studio))].push(studio);
 }
 const drafts=snapshot.sessions.filter(s=>s.spaceId===spaceId&&s.latestRunId===null);
 const concurrency:BoardConcurrency={
  draft:columns.draft.length+drafts.length,
  active:columns.running.length,
  needsYou:columns['needs-you'].length,
  ready:columns.ready.length,
  closed:columns.closed.length,
  total:0,
 };
 concurrency.total=concurrency.draft+concurrency.active+concurrency.needsYou+concurrency.ready+concurrency.closed;
 return {columns,drafts,concurrency};
}

/**
 * A10 usage contract for the board total: option fields stay optional. A run that
 * did not report a value makes that aggregate field unknown (null), never zero.
 * Cost is only ever the sum of provider-reported amounts; a cloud run without a
 * reported cost marks the total incomplete instead of being silently free.
 */
export interface UsageAggregate {
 runsWithUsage:number;
 runsWithoutUsage:number;
 inputTokens:number|null;
 outputTokens:number|null;
 cacheReadTokens:number|null;
 cacheWriteTokens:number|null;
 costUsd:number|null;
 /** False when any cloud run is missing a reported cost. Local runs are known-free. */
 costComplete:boolean;
 /** True when any run reported a partial cost source or the total is incomplete. */
 partialCost:boolean;
}
export function aggregateUsage(runs:readonly Studio[]):UsageAggregate{
 if(!runs.length)return {runsWithUsage:0,runsWithoutUsage:0,inputTokens:null,outputTokens:null,cacheReadTokens:null,cacheWriteTokens:null,costUsd:null,costComplete:true,partialCost:false};
 let input=0,output=0,cacheRead=0,cacheWrite=0,cost=0;
 let inputKnown=true,outputKnown=true,cacheReadKnown=true,cacheWriteKnown=true;
 let anyCost=false,costComplete=true,partial=false;
 let withUsage=0,without=0;
 for(const run of runs){
  const u=run.usage;
  if(!u){
   without++;
   inputKnown=outputKnown=cacheReadKnown=cacheWriteKnown=false;
   if(run.model.locality!=='local')costComplete=false;
   continue;
  }
  withUsage++;
  input+=u.inputTokens;output+=u.outputTokens;
  if(u.cacheReadTokens===null)cacheReadKnown=false;else cacheRead+=u.cacheReadTokens;
  if(u.cacheWriteTokens===null)cacheWriteKnown=false;else cacheWrite+=u.cacheWriteTokens;
  if(u.costSource==='provider_reported_partial'){partial=true;costComplete=false;}
  if(u.costUsd!==null&&Number.isFinite(u.costUsd)){cost+=u.costUsd;anyCost=true;}
  else if(run.model.locality!=='local')costComplete=false;
 }
 return {
  runsWithUsage:withUsage,runsWithoutUsage:without,
  inputTokens:inputKnown?input:null,outputTokens:outputKnown?output:null,
  cacheReadTokens:cacheReadKnown?cacheRead:null,cacheWriteTokens:cacheWriteKnown?cacheWrite:null,
  costUsd:anyCost?cost:null,
  costComplete,
  partialCost:partial||!costComplete,
 };
}

/** USD label for an aggregate cost, same precision rule as the per-run costLabel. */
export function aggregateCostLabel(costUsd:number):string{
 return `USD ${costUsd.toFixed(costUsd<0.01?4:2)}`;
}

export interface ScheduleConflict {
 kind:'same-slot'|'active-overlap';
 scheduleIds:string[];
 studioId:string;
 atMs:number;
}

const ACTIVE_EXECUTION=['claimed','running','paused'] as const;

/**
 * Visible scheduler conflicts on the board's time axis. Only verifiable collisions
 * are reported; no future duration is predicted:
 * - same-slot: two enabled schedules of one Studio fire at the exact same time.
 * - active-overlap: an enabled schedule is due while a run of its Studio is active
 *   (the native core cannot start a second run of that Studio until canStart).
 * Schedules on different Studios never conflict: runs are isolated and parallel by design.
 */
export function scheduleConflicts(schedules:readonly Schedule[],runs:readonly Studio[],nowMs:number):ScheduleConflict[]{
 const conflicts:ScheduleConflict[]=[];
 const enabled=schedules.filter(s=>s.enabled);
 const activeByStudio=new Set(runs.filter(r=>(ACTIVE_EXECUTION as readonly string[]).includes(r.executionState)).map(r=>r.studioId));
 for(const s of enabled){
  if(s.nextRunMs<=nowMs&&activeByStudio.has(s.spec.studioId))
   conflicts.push({kind:'active-overlap',scheduleIds:[s.id],studioId:s.spec.studioId,atMs:s.nextRunMs});
 }
 const byStudio=new Map<string,Schedule[]>();
 for(const s of enabled){
  const list=byStudio.get(s.spec.studioId)??[];list.push(s);byStudio.set(s.spec.studioId,list);
 }
 for(const [studioId,list] of byStudio){
  const bySlot=new Map<number,string[]>();
  for(const s of list){
   const ids=bySlot.get(s.nextRunMs)??[];ids.push(s.id);bySlot.set(s.nextRunMs,ids);
  }
  for(const [atMs,ids] of bySlot){
   if(ids.length>1)conflicts.push({kind:'same-slot',scheduleIds:ids,studioId,atMs});
  }
 }
 return conflicts.sort((a,b)=>a.atMs-b.atMs);
}
