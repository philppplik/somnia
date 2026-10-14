import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionFrames,TRANSITION_MS} from './transitionPlay';
test('transition frames: none plays nothing, others end at rest',()=>{
  assert.equal(transitionFrames({kind:'none',dir:'l',speed:'med'}),null);
  assert.deepEqual(transitionFrames({kind:'fade',dir:'u',speed:'med'}),[{opacity:0},{opacity:1}]);
  for(const kind of ['push','wipe','cover'] as const)for(const dir of ['l','r','u','d'] as const){
    const f=transitionFrames({kind,dir,speed:'fast'})!;assert.equal(f.length,2);assert.ok(f[1].transform==='none'||f[1].clipPath==='inset(0)');}
  assert.ok(TRANSITION_MS.slow>TRANSITION_MS.med&&TRANSITION_MS.med>TRANSITION_MS.fast);
});
