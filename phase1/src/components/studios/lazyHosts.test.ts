import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('startup graph has no inactive studio canvas or inline media workspace',()=>{
 const graph=JSON.parse(execFileSync(process.execPath,['scripts/bench-startup-graph.mjs'],{encoding:'utf8'}));
 assert.deepEqual(graph.inactiveCanvases,[]);
 assert.ok(graph.modules>0);
});
