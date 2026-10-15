import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentSettings,nextTabIndex} from './agent/AgentSettings';
import {AgentPanel} from './agent/AgentPanel';
import {readFileSync} from 'node:fs';
// This file renders browser components under Node, without sharing browser state.
let previousStorage:PropertyDescriptor|undefined;
beforeEach(()=>{
 previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const values=new Map<string,string>();
 const storage:Storage={get length(){return values.size;},clear:()=>values.clear(),getItem:key=>values.get(key)??null,key:index=>[...values.keys()][index]??null,removeItem:key=>{values.delete(key);},setItem:(key,value)=>{values.set(key,String(value));}};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
});
afterEach(()=>{if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage');});
test('AI Settings owns provider, prompts, active-file approval and explicit cloud consent',()=>{
 const html=renderToStaticMarkup(<AgentSettings/>);
 for(const text of ['Agent configuration','Provider','Model','Custom prompts','Allow cloud AI','Save AI settings'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('type="checkbox"'));
 assert.ok(!html.includes('type="checkbox" checked'));
 assert.ok(!html.includes('linear-gradient'));
});
test('agent panel keeps provider configuration separate while exposing explicit local run context',()=>{
 const html=renderToStaticMarkup(<AgentPanel/>);
 assert.ok(html.includes('Agent configuration'));
 // After the panel declutter, consent and provider fields live in AI Settings (the 'Allow cloud AI'
 // checkbox is asserted in the settings test above); the panel only surfaces where a run would go.
 assert.ok(html.includes('ag-context-chip'),'panel must expose its run context (provider, model, document)');
 assert.ok(html.includes('role="status"'),'run context must be announced as a status region');
 assert.ok(!html.includes('Cloud data consent'),'consent copy belongs in AI Settings, not embedded in the panel');
 assert.ok(!html.includes('Custom prompts'));
 const selects=html.match(/<select/g)??[];assert.equal(selects.length,0,'provider configuration selects belong in AI Settings, not embedded in the panel');
 assert.ok(!html.includes('Save AI settings'),'provider configuration still belongs in settings');
 assert.ok(!html.includes('ag-consent-backdrop'));
});
test('Appearance removes the decorative glass gradient without removing glass controls',()=>{
 const source=readFileSync(new URL('./GlassSettings.tsx',import.meta.url),'utf8');
 assert.ok(!source.includes('linear-gradient'));
 assert.ok(!source.includes('glass-preview'));
 for(const text of ['setOpacity','setBlur','glassFrame','glassPanels','glassCode'])assert.ok(source.includes(text));
});

test('AI Settings tab keys cover all four tabs and wrap in both directions',()=>{
 assert.deepEqual([0,1,2,3].map(i=>nextTabIndex(i,4,'ArrowRight')),[1,2,3,0]);
 assert.deepEqual([0,1,2,3].map(i=>nextTabIndex(i,4,'ArrowLeft')),[3,0,1,2]);
 assert.equal(nextTabIndex(2,4,'Home'),0);
 assert.equal(nextTabIndex(1,4,'End'),3);
});
