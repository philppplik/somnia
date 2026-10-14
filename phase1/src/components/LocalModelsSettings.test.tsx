import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocalModelsSettings} from './agent/LocalModelsSettings';
import {AgentSettings,nextTabIndex} from './agent/AgentSettings';
import {patchState} from '../store/appStore';
test('local model view is read-only and has clear capability/inference boundary',()=>{
 const html=renderToStaticMarkup(<LocalModelsSettings active={false}/>);
 for(const text of ['explicit runtime actions','Refresh','Local models','not a hostile proxy'])assert.ok(html.includes(text),text);
 for(const text of ['<input','<select','Start Ollama','Delete model','Download model'])assert.ok(!html.includes(text),text);
});
test('five AI tabs use shared primitives and Local stays inside global settings',()=>{
 const html=renderToStaticMarkup(<AgentSettings/>);
 assert.equal((html.match(/data-slot="tabs-trigger"/g)||[]).length,5);
 assert.ok(html.includes('id="ai-tab-local"'));assert.ok(html.includes('id="ai-content-local"'));
 assert.deepEqual([0,1,2,3,4].map(i=>nextTabIndex(i,5,'ArrowRight')),[1,2,3,4,0]);
 assert.deepEqual([0,1,2,3,4].map(i=>nextTabIndex(i,5,'ArrowLeft')),[4,0,1,2,3]);
 assert.equal(nextTabIndex(0,5,'End'),4);
});
test('unknown saved AI navigation falls back to Providers',()=>{
 patchState({settingsAITab:'removed-tab' as never});
 const html=renderToStaticMarkup(<AgentSettings/>);assert.match(html,/aria-selected="true"[^>]*id="ai-tab-providers"|id="ai-tab-providers"[^>]*aria-selected="true"/);
 patchState({settingsAITab:'providers'});
});
