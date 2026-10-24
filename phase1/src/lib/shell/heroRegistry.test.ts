import test from 'node:test';
import assert from 'node:assert/strict';
import {commandRevision,registerCommand,subscribeCommands} from '../commandRegistry';
test('mount/unmount registrations notify the data-only header slot',()=>{
 let calls=0;const before=commandRevision(),off=subscribeCommands(()=>calls++);
 const remove=registerCommand({id:'heroregistry.test',title:'Test',category:'Tools',run:()=>{}});
 assert.equal(commandRevision(),before+1);assert.equal(calls,1);
 remove();assert.equal(commandRevision(),before+2);assert.equal(calls,2);off();
});
