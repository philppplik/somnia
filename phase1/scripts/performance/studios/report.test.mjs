import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,sampleCount,validateScenarios,markdown} from './report.mjs';
test('nearest-rank percentiles retain tails and leave samples unchanged',()=>{const x=Array.from({length:100},(_,i)=>100-i);assert.deepEqual(summarize(x),{count:100,min:1,p50:50,p95:95,p99:99,max:100});assert.equal(x[0],100);});
test('invalid or incomplete timings never become zero or a passing report',()=>{for(const x of [[],[-1],[NaN],[Infinity],null])assert.throws(()=>summarize(x));assert.throws(()=>sampleCount('2'));assert.throws(()=>sampleCount('4.5'));assert.equal(sampleCount('20'),20);});
test('scenarios require unique IDs and actual readiness selectors',()=>{assert.throws(()=>validateScenarios([]));assert.throws(()=>validateScenarios([{id:'a',label:'A'}]));assert.throws(()=>validateScenarios([{id:'a',label:'A',readySelector:'img'},{id:'a',label:'A',readySelector:'img'}]));});
test('report preserves unverified native and resume attribution',()=>{const text=markdown({sha:'x',environment:{},timings:[]});assert.match(text,/not certified suspended resume/);assert.match(text,/not exclusive studio bytes/);assert.match(text,/no pass\/fail performance threshold/);});
