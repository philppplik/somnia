import test from 'node:test';import assert from 'node:assert/strict';
import {recommendedModelCandidates} from './localModelPicker';
test('exact candidates filter by declared catalog task and use size order, not inferred quality',()=>{
 const text=recommendedModelCandidates('text',null);assert.equal(text[0].entry.tag,'qwen3:1.7b');assert.ok(text.every(r=>r.fit.label==='unknown'&&r.entry.benchmark==='not-tested'));assert.deepEqual(recommendedModelCandidates('vision',null).map(r=>r.entry.tag),['gemma3:4b']);assert.deepEqual(recommendedModelCandidates('tools',null).map(r=>r.entry.tag),['qwen3:4b','qwen3:8b']);
});
test('device recommendation uses fresh available RAM/VRAM and never unknown hardware',async()=>{const {deviceModelSuggestion}=await import('./localModelPicker');assert.equal(deviceModelSuggestion(null),null);const hw={os:'test',arch:'x',gpus:[],errors:[],checkedAt:Date.now(),ramAvailableBytes:8*1024**3};assert.equal(deviceModelSuggestion(hw),'qwen3:1.7b');assert.equal(deviceModelSuggestion({...hw,checkedAt:Date.now()-61000}),null);assert.equal(deviceModelSuggestion({...hw,ramAvailableBytes:1}),null);});
