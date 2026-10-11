import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {BoardView} from './BoardView';
import {fixtureRun,fixtureSnapshot,fixtureSpace} from '../../lib/vibespace/fixture';
import type {VibeIntent} from '../../lib/vibespace/types';
import type {Schedule} from '../../lib/vibespace/schedule';

const ALL:readonly VibeIntent['type'][]=['create-space','create-studio','start','stop','steer','consent','review','restore','retry','apply-hunks','request-changes'];
const onAction=async()=>true;
const onOpen=()=>{};
const NOW=new Date('2026-10-11T12:00:00Z').getTime();
const schedule=(id:string,studioId:string,nextRunMs:number,enabled=true):Schedule=>({id,spec:{name:id,studioId,cronExpr:'0 9 * * 1',timezone:'Europe/Berlin',misfirePolicy:{kind:'coalesce'},consentLevel:'ask_for_writes',autoApply:false},enabled,nextRunMs});

test('board renders parallel runs in state columns with per-card cost, conflicts and controls',()=>{
 const snapshot=fixtureSnapshot();
 const html=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={snapshot} schedules={null} pending={false} capabilities={ALL} mode="fixture" onAction={onAction} onOpenRun={onOpen} nowMs={NOW}/>);
 for(const label of['Needs you','Running','Ready for review','Failed'])assert.ok(html.includes(label),label);
 for(const goal of['Improve the landing page copy','Check external links','Improve image descriptions','Check document headings'])assert.ok(html.includes(goal),goal);
 assert.match(html,/Stop<\/button>/);
 assert.match(html,/Check whether the linked page still exists/,'consent reason is the card line');
 assert.match(html,/1 conflict - compare needed, no auto-merge/);
 assert.match(html,/2 files changed/);
 assert.match(html,/USD 0.04/,'per-card reported cost');
});

test('aggregate usage is honest: partial label when any run is unreported, never an invented total',()=>{
 const snapshot=fixtureSnapshot(); // run-copy reports cost; three runs report nothing
 const html=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={snapshot} schedules={null} pending={false} capabilities={ALL} mode="fixture" onAction={onAction} onOpenRun={onOpen} nowMs={NOW}/>);
 assert.match(html,/Partial: 1 of 4 runs reported/);
 assert.match(html,/Missing values are unknown, never zero/);
 assert.match(html,/Not reported/);
});

test('schedule strip shows next runs and both conflict kinds; disabled schedules are marked',()=>{
 const snapshot=fixtureSnapshot();
 const schedules=[
  schedule('Morning check','studio-images',NOW+60_000),
  schedule('Second check','studio-images',NOW+60_000),
  schedule('Overdue','studio-network',NOW-1_000),
  schedule('Off duty','studio-copy',NOW+60_000,false),
 ];
 const html=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={snapshot} schedules={schedules} pending={false} capabilities={ALL} mode="fixture" onAction={onAction} onOpenRun={onOpen} nowMs={NOW}/>);
 assert.match(html,/Morning check/);
 assert.match(html,/Same slot: these schedules fire together on one Studio/);
 assert.match(html,/Due now, but a run of this Studio is still active/);
 assert.match(html,/Off<\/span>/);
 assert.match(html,/<time/);
});

test('schedulesError surfaces an honest note instead of fake data',()=>{
 const html=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={fixtureSnapshot()} schedules={null} schedulesError={true} pending={false} capabilities={ALL} mode="fixture" onAction={onAction} onOpenRun={onOpen} nowMs={NOW}/>);
 assert.match(html,/Schedules unavailable\. Live runs are unaffected/);
});

test('pending locks stop/steer and draft start; board never enables what the controller would reject',()=>{
 const snapshot=fixtureSnapshot();
 const html=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={snapshot} schedules={null} pending={true} capabilities={ALL} mode="fixture" onAction={onAction} onOpenRun={onOpen} nowMs={NOW}/>);
 const stops=html.match(/<button type="button" disabled="">(?:(?!<\/button>).)*?Stop<\/button>/gs)??[];
 assert.equal(stops.length,2,'both active runs show a disabled stop while pending');
 const noSteer=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={snapshot} schedules={null} pending={false} capabilities={ALL.filter(c=>c!=='steer')} mode="fixture" onAction={onAction} onOpenRun={onOpen} nowMs={NOW}/>);
 assert.match(noSteer,/disabled=""[^>]*>Steer</);
});
