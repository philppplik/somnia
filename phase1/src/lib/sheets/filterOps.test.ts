import test from 'node:test';
import assert from 'node:assert/strict';
import {filterValueProblem,parseFilterCommand} from './filterOps';
test('filter command accepts only a closed, bounded shape',()=>{
 assert.deepEqual(parseFilterCommand({kind:'custom',column:2,op:'contains',value:'ab'}),{kind:'custom',column:2,op:'contains',value:'ab'});
 assert.deepEqual(parseFilterCommand({kind:'clear',column:0}),{kind:'clear',column:0});
 assert.deepEqual(parseFilterCommand({kind:'off'}),{kind:'off'});assert.deepEqual(parseFilterCommand({kind:'clearAll'}),{kind:'clearAll'});
 for(const bad of [null,[],{},{kind:'fly'},{kind:'off',column:1},{kind:'custom',column:1,op:'regex',value:'a'},{kind:'custom',column:1,op:'=',value:''},{kind:'custom',column:1,op:'=',value:'a\nb'},{kind:'custom',column:1,op:'=',value:'x'.repeat(256)},{kind:'custom',column:-1,op:'=',value:'a'},{kind:'custom',column:16384,op:'=',value:'a'},{kind:'custom',column:1.5,op:'=',value:'a'},{kind:'custom',column:1,op:'=',value:5},{kind:'clear'},{kind:'custom',column:1,op:'=',value:'a',extra:1}])assert.throws(()=>parseFilterCommand(bad),JSON.stringify(bad));
});
test('filter values are bounded text',()=>{assert.equal(filterValueProblem(''),'blank');assert.equal(filterValueProblem('x'.repeat(256)),'long');assert.equal(filterValueProblem('a\u0007'),'chars');assert.equal(filterValueProblem('>=5 *'),null);});
