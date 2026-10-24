import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocalModelsSettings} from './agent/LocalModelsSettings';
import {AgentSettings,nextTabIndex} from './agent/AgentSettings';
import {patchState} from '../store/appStore';
test('local model view is read-only and has clear capability/inference boundary',()=>{
 const html=renderToStaticMarkup(<LocalModelsSettings active={false}/>);
 for(const text of ['explicit runtime actions','Refresh','Local models','not a hostile proxy'])assert.ok(html.includes(text),text);
 for(const text of ['<input','<select'])assert.ok(!html.includes(text),text);
 // The passive setup heading is guidance, not a launch control. Assert the action boundary.
 assert.ok(html.includes('<strong>Start Ollama</strong>'));
 const buttons=html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)??[];
 for(const text of ['Start Ollama','Delete model','Download model'])assert.ok(buttons.every(button=>!button.includes(text)),text);
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
test('local health snapshot renders separately from browser network and hides no errors by default',async()=>{
 const {LocalAIHealth}=await import('./agent/LocalAIHealth');const html=renderToStaticMarkup(<LocalAIHealth snapshot={{state:'running',installed:true,version:'test',models:[],checkedAt:1,inventoryError:true}} busy={false} onRefresh={()=>{}}/>);
 assert.ok(html.includes('Local AI status'));assert.ok(html.includes('Installed models: unknown'));assert.ok(html.includes('role="alert"'));assert.ok(html.includes('No background polling'));
});

test('lifecycle start control requires an observed stopped runtime; unknown and injected read-only view have no start control',async()=>{
 const {LocalModelActions}=await import('./agent/LocalModelActions');
 const unknown=renderToStaticMarkup(<LocalModelActions snapshot={null} onChanged={async()=>{}}/>);
 assert.ok(!/<button\b[^>]*>[\s\S]*?Start Ollama/.test(unknown));
 const stopped={state:'stopped' as const,installed:true,inventoryError:false,models:[],checkedAt:1};
 const actions=renderToStaticMarkup(<LocalModelActions snapshot={stopped} onChanged={async()=>{}}/>);
 assert.match(actions,/<button\b[^>]*>Start Ollama<\/button>/);
 const {LocalModelsRuntime}=await import('../lib/agent/localModels');
 const runtime=new LocalModelsRuntime(undefined,async()=>{throw Error('No read on static inactive render');});
 const readonly=renderToStaticMarkup(<LocalModelsSettings active={false} runtime={runtime}/>);
 assert.ok(readonly.includes('<strong>Start Ollama</strong>'));
 assert.ok((readonly.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)??[]).every(button=>!button.includes('Start Ollama')));
});
