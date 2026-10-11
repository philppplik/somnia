import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {VibeSpaceHome} from './VibeSpaceHome';
import {StudioDetail,ReviewChanges,ConsentCard,StudioMetrics} from './StudioDetail';
import {CreateSpaceForm,CreateStudioForm} from './CreateForms';
import {fixtureRun,fixtureSnapshot,fixtureSpace,createFixtureVibeSpaceTransport} from '../../lib/vibespace/fixture';
const onAction=async()=>true;
test('empty/loading state contains no scheduling/library scaffolding; fixture is explicit',()=>{
 const html=renderToStaticMarkup(<VibeSpaceHome transport={createFixtureVibeSpaceTransport('test')}/>);
 assert.match(html,/Fixture mode/);assert.match(html,/Loading Vibe Space/);assert.match(html,/vadivam:bot/);assert.ok(!/Coming soon|Schedule|Desktop control|Skills/.test(html));
});
test('create requires folder chooser grant and model selection, no credentials or free scope',()=>{
 const space=renderToStaticMarkup(<CreateSpaceForm busy={false} onCreate={onAction} onChoose={async()=>null} onClose={()=>{}}/>);
 assert.match(space,/Choose folder/);assert.match(space,/No folder chosen/);assert.match(space,/disabled=""[^>]*>Create Vibe Space/);assert.ok(!space.includes('API key'));
 const studio=renderToStaticMarkup(<CreateStudioForm space={fixtureSpace} models={[]} busy={false} onCreate={onAction} onClose={()=>{}}/>);assert.match(studio,/No configured model/);assert.match(studio,/Ask for writes/);assert.match(studio,/disabled=""[^>]*>Create Studio/);
});
test('review shows split text, explicit Apply/Discard, not-run checks and disabled conflict selection',()=>{
 const html=renderToStaticMarkup(<ReviewChanges studio={fixtureRun()} disabled={false} onAction={onAction}/>);
 assert.match(html,/Before/);assert.match(html,/Proposed/);assert.match(html,/Apply selected/);assert.match(html,/Discard/);assert.match(html,/Not run/);assert.match(html,/Current project/);assert.match(html,/edited by you/);assert.match(html,/disabled=""[^>]*aria-label="Include about.html"|aria-label="Include about.html"[^>]*disabled=""/);assert.ok(!html.includes('Confirm Apply'));
});
test('consent has exact scope/reason/once/run/deny and run-level denial honored',()=>{
 const html=renderToStaticMarkup(<ConsentCard studio={fixtureSnapshot().studios[1]} disabled={false} runAllowed={true} onAction={onAction}/>);
 assert.match(html,/Scope/);assert.match(html,/Why/);assert.match(html,/Allow once/);assert.match(html,/disabled=""[^>]*>Allow for this run/);assert.match(html,/Deny/);
});
test('disabled run controls, restore timeline and visible failure/retry',()=>{
 const html=renderToStaticMarkup(<StudioDetail studio={fixtureSnapshot().studios[3]} space={fixtureSpace} pending={true} capabilities={['retry','restore','stop','steer']} onAction={onAction} onBack={()=>{}}/>);
 assert.match(html,/provider_unavailable/);assert.match(html,/Retry in a new run/);assert.match(html,/disabled=""[^>]*>Retry/);assert.match(html,/Checkpoint/);assert.match(html,/Before Studio work/);
});
test('zero and local cost hidden, positive cloud usage labelled with source',()=>{
 const r=fixtureRun();const html=renderToStaticMarkup(<StudioMetrics studio={r}/>);assert.match(html,/USD 0.04/);assert.match(html,/provider_reported/);
 const local=renderToStaticMarkup(<StudioMetrics studio={{...r,model:{...r.model,locality:'local'}}}/>);assert.ok(!local.includes('USD'));
});
test('applied or discarded history never claims an unchanged project or offers another apply',()=>{
 const html=renderToStaticMarkup(<ReviewChanges studio={fixtureRun({reviewState:'applied'})} disabled={true} onAction={onAction}/>);
 assert.match(html,/These changes were applied/);assert.ok(!html.includes('Your project has not changed'));assert.ok(!html.includes('Apply selected'));
});
