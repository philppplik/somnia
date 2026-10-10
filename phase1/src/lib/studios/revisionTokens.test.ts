import test from 'node:test';
import assert from 'node:assert/strict';
import {collectTokens,currentToken,objectRevision,registerRevisionSource,resetRevisionSources,tokensCurrent} from './revisionTokens';
test.beforeEach(resetRevisionSources);
test('tokens are current while the source value is unchanged and stale after it changes',()=>{
 let v=1;registerRevisionSource('a',()=>v);const t=[currentToken('a')];
 assert.equal(tokensCurrent(t),true);v=2;assert.equal(tokensCurrent(t),false);
});
test('a scope without a source yields an unknown token that never revalidates (fail-safe)',()=>{
 const t=currentToken('nope');assert.equal(t.value,'unknown');assert.equal(tokensCurrent([t]),false);
 registerRevisionSource('nope',()=>'unknown');assert.equal(tokensCurrent([{scope:'nope',value:'unknown'}]),false);
});
test('a source that disappears or throws after planning is not current',()=>{
 const off=registerRevisionSource('a',()=>1);const t=[currentToken('a')];off();assert.equal(tokensCurrent(t),false);
 registerRevisionSource('a',()=>{throw new Error('x');});assert.equal(tokensCurrent(t),false);
});
test('collectTokens dedupes equal tokens in input order',()=>{
 const tk={scope:'a',value:1};
 assert.deepEqual(collectTokens([{token:tk},{token:{scope:'a',value:1}},{token:{scope:'b',value:2}}]),[tk,{scope:'b',value:2}]);
});
test('objectRevision is stable per object and distinct across objects',()=>{
 const a={},b={};assert.equal(objectRevision(a),objectRevision(a));assert.notEqual(objectRevision(a),objectRevision(b));
});
