import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandRegistry} from '../lib/commandRegistry';
import '../lib/studios/documents';
import './railCommands';
import {patchState} from './appStore';
import {shellLayoutStore} from './shellLayoutStore';
import {documentsStudio} from '../lib/studios/documents';
import {setFocusedRailItem} from './railActions';
import {studioDefaultLayout,studioPanels} from '../lib/shell/codePanels';
const get=(op:string)=>commandRegistry.get('shell.rail.'+op)!;
const ov=()=>shellLayoutStore.get('documents',studioDefaultLayout(documentsStudio),studioPanels(documentsStudio)).railOverrides;
test('rail commands are unavailable in a studio without customizable rails',()=>{
 patchState({activeStudio:'code'});assert.equal(get('pin').enabled!(),false);
});
test('with a payload target the commands work without a focused rail icon (overflow menu path)',async()=>{
 patchState({activeStudio:'documents'});setFocusedRailItem(null);
 for(const op of ['pin','unpin','hide','show','moveUp','moveDown','reset'])assert.equal(get(op).enabled!(),true,op);
 await get('unpin').run({side:'left',id:'versions'});assert.ok(ov().unpinned!.includes('versions'));
 await get('pin').run({side:'left',id:'versions'});assert.ok(ov().pinned.includes('versions')&&!ov().unpinned!.includes('versions'));
 await get('hide').run({side:'left',id:'pages'});assert.ok(ov().hidden.includes('pages'));
 await get('show').run({side:'left',id:'pages'});assert.ok(!ov().hidden.includes('pages'));
 await get('reset').run();assert.deepEqual(ov().hidden,[]);
});
test('without payload and without focus the command reports an expected error; focus is used as fallback',async()=>{
 patchState({activeStudio:'documents'});setFocusedRailItem(null);
 await assert.rejects(async()=>{await get('hide').run();},(e:any)=>e.expected===true);
 setFocusedRailItem({side:'left',id:'outline'});await get('hide').run();assert.ok(ov().hidden.includes('outline'));
 await get('reset').run();
});
