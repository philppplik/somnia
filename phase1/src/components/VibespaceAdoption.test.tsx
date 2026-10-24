import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {BoardView} from './vibespace/BoardView';
import {CreateSpaceForm,CreateStudioForm} from './vibespace/CreateForms';
import {ModelSetup} from './vibespace/ModelSetup';
import {fixtureSnapshot,fixtureSpace} from '../lib/vibespace/fixture';

const ALL:readonly any[]=['create-space','create-studio','start','stop','steer','consent','review','restore','retry','apply-hunks','request-changes'];
const onAction=async()=>true;const noop=()=>{};
const NOW=new Date('2026-10-11T12:00:00Z').getTime();

test('board pending controls render through native primitives and stay disabled',()=>{
 const html=renderToStaticMarkup(<BoardView space={fixtureSpace} snapshot={fixtureSnapshot()} schedules={null} pending={true} capabilities={ALL} mode="fixture" onAction={onAction} onOpenRun={noop} nowMs={NOW}/>);
 const stops=html.match(/<button[^>]*data-slot="native-button"[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*?Stop<\/button>/gs)??[];
 assert.equal(stops.length,2);
 const toggles=html.match(/<button[^>]*data-slot="native-button"[^>]*aria-pressed="false"[^>]*disabled=""[^>]*>/g)??[];
 assert.ok(toggles.length>=2,'steer toggles disabled while pending');
});

test('create forms keep labels and required fields through native primitives',()=>{
 const models=fixtureSnapshot().models;
 const studio=renderToStaticMarkup(<CreateStudioForm space={fixtureSpace} models={models} busy={false} onCreate={async()=>false} onClose={noop}/>);
 assert.match(studio,/<textarea[^>]*data-slot="textarea"[^>]*required=""/);
 assert.match(studio,/<select[^>]*data-slot="native-select"[^>]*required=""/);
 assert.match(studio,/Choose a configured model/);
 const space=renderToStaticMarkup(<CreateSpaceForm busy={false} onCreate={async()=>false} onChoose={async()=>null} onClose={noop}/>);
 assert.match(space,/<input[^>]*data-slot="native-input"[^>]*required=""/);
 assert.match(space,/<button[^>]*data-slot="native-button"[^>]*class="vs-primary"[^>]*disabled=""/);
});

test('model setup re-probe action is a named native button',()=>{
 const probe=async()=>({state:'server-down',hintKey:'vs.model.hint.ollamaDown'} as const);
 const html=renderToStaticMarkup(<ModelSetup probe={probe}/>);
 assert.match(html,/<button[^>]*data-slot="native-button"[^>]*>Check again<\/button>/);
});

test('no raw form controls remain anywhere in the vibespace area',()=>{
 const dir=new URL('./vibespace/',import.meta.url);
 for(const f of readdirSync(dir).filter(f=>f.endsWith('.tsx')&&!f.includes('.test.'))) {
  const source=readFileSync(new URL(f,dir),'utf8');
  assert.doesNotMatch(source,/<(button|input|select|textarea)\b/,f);
 }
});
