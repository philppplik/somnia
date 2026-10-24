import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseReplaceCommand,replaceProblem} from './replaceOps';
const ok={what:'a',with:'b',matchCase:false,wholeCell:true,inFormulas:false};
test('parseReplaceCommand accepts a full op and an empty replacement',()=>{assert.deepEqual(parseReplaceCommand(ok),ok);assert.deepEqual(parseReplaceCommand({...ok,with:''}),{...ok,with:''});});
test('parseReplaceCommand rejects malformed input',()=>{
 for(const bad of [null,[],{},{...ok,what:''},{...ok,what:'x'.repeat(256)},{...ok,with:'a\u0000'},{...ok,with:1},{...ok,matchCase:'y'},{what:'a',with:'b'},{...ok,extra:1}])assert.throws(()=>parseReplaceCommand(bad),JSON.stringify(bad));
});
test('replaceProblem names the field',()=>{assert.equal(replaceProblem('','x'),'what');assert.equal(replaceProblem('a','x\n'),'with');assert.equal(replaceProblem('a',''),null);});
