import test from 'node:test';import assert from 'node:assert/strict';
import {sourceDiff} from './sourceDiff';import {changeStarts,sideBySide,diffStats} from './diffView';
const d=sourceDiff('a\nb\nc\nd\ne','a\nB\nc\nd\ne\nf').lines;
test('change starts mark each changed block once',()=>{assert.deepEqual(changeStarts(d).length,2);});
test('side by side pairs removed with added and counts lines',()=>{const rows=sideBySide(d);const changed=rows.find(r=>r.left?.kind==='removed');assert.equal(changed?.left?.text,'b');assert.equal(changed?.right?.text,'B');assert.deepEqual(diffStats(d),{added:2,removed:1});});
test('identical text has no changes',()=>{assert.equal(changeStarts(sourceDiff('x\ny','x\ny').lines).length,0);});
