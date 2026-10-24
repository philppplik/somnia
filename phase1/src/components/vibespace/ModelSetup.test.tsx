import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModelSetup} from './ModelSetup';
const probe=async()=>({state:'server-down',hintKey:'vs.model.hint.ollamaDown'} as const);
test('missing model shows manual pull command, no download button',()=>{
 const html=renderToStaticMarkup(<ModelSetup probe={probe} initial={{ollama:{status:'done',readiness:{state:'model-missing',hintKey:'vs.model.hint.ollamaPull',installed:[{id:'llama3:8b'}]}},lmstudio:{status:'done',readiness:{state:'server-down',hintKey:'vs.model.hint.lmsDown'}}}}/>);
 assert.match(html,/ollama pull qwen3\.5:9b/);assert.match(html,/Qwen3\.5-9B not installed/);assert.match(html,/Nothing is downloaded automatically/);
 assert.ok(!/<button[^>]*>(Download|Install|Pull)/.test(html));assert.equal((html.match(/<button/g)||[]).length,2);assert.match(html,/Check again/);assert.match(html,/127\.0\.0\.1/);
});
test('ready and checking states',()=>{
 const html=renderToStaticMarkup(<ModelSetup probe={probe} initial={{ollama:{status:'done',readiness:{state:'ready',modelId:'qwen3.5:9b',installed:[]}},lmstudio:{status:'checking'}}}/>);
 assert.match(html,/Ready: qwen3\.5:9b/);assert.match(html,/Checking\.\.\./);assert.match(html,/disabled=""[^>]*>Check again/);
});
