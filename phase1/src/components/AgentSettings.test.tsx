import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentSettings,nextTabIndex} from './agent/AgentSettings';
import {AgentPanel} from './agent/AgentPanel';
import {readFileSync} from 'node:fs';
test('AI Settings owns provider, prompts, active-file approval and explicit cloud consent',()=>{
 const html=renderToStaticMarkup(<AgentSettings/>);
 for(const text of ['Agent configuration','Provider','Model','Custom prompts','Allow cloud AI','Save AI settings'])assert.ok(html.includes(text),text);
 assert.ok(html.includes('type="checkbox"'));
 assert.ok(!html.includes('type="checkbox" checked'));
 assert.ok(!html.includes('linear-gradient'));
});
test('agent panel only links to configuration and consent, never embeds editing controls',()=>{
 const html=renderToStaticMarkup(<AgentPanel/>);
 assert.ok(html.includes('Agent configuration'));
 assert.ok(html.includes('Cloud data consent'));
 assert.ok(!html.includes('Custom prompts'));
 assert.ok(!html.includes('<select'));
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
