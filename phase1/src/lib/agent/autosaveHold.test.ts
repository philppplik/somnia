import {test} from 'node:test';
import assert from 'node:assert/strict';
import {holdAgentAutosave,isAgentAutosaveHeld,releaseAgentAutosave,clearAgentAutosaveHolds,installHoldBackend} from './autosaveHold';
test('per-path hold persists until explicit release; backend failure prevents application',async()=>{
 clearAgentAutosaveHolds();const seen:string[][]=[];const clean=installHoldBackend(async p=>{seen.push(p);});
 await holdAgentAutosave(['index.html']);assert.equal(isAgentAutosaveHeld('index.html'),true);assert.equal(isAgentAutosaveHeld('styles.css'),false);assert.deepEqual(seen,[['index.html']]);
 releaseAgentAutosave('index.html');assert.equal(isAgentAutosaveHeld('index.html'),false);clean();
 const failed=installHoldBackend(async()=>{throw Error('root escape');});
 await assert.rejects(holdAgentAutosave(['escape.html']),/root escape/);assert.equal(isAgentAutosaveHeld('escape.html'),false);failed();clearAgentAutosaveHolds();
});
