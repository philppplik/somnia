import {test} from 'node:test';import assert from 'node:assert/strict';import {panelPreferencesSnapshot,setPanelPreferences,panelDisclosureKey,consumePanelDisclosure} from './panelPreferences';import {defaultLocalContext} from './localAssistant';
const scope={project:1,revision:2,settingsRevision:3,provider:'openai',model:'exact',path:'active.html',media:false,studio:'code',selection:'node1',choices:defaultLocalContext,task:'chat' as const};
test('disclosure exact one-use scope and all target/context/config changes invalidate',()=>{const k=panelDisclosureKey(scope);for(const patch of [{project:2},{revision:3},{settingsRevision:4},{provider:'claude'},{model:'other'},{path:'other.html'},{media:true},{studio:'photos'},{selection:'node2'},{task:'code' as const},{choices:{...defaultLocalContext,maxDocumentBytes:2048}}]){setPanelPreferences({disclosureKey:k});assert.equal(consumePanelDisclosure(panelDisclosureKey({...scope,...patch})),false);assert.equal(panelPreferencesSnapshot().disclosureKey,null);}setPanelPreferences({disclosureKey:k});assert.equal(consumePanelDisclosure(k),true);assert.equal(consumePanelDisclosure(k),false);});
test('local context budgets still reject invalid setting',()=>{assert.throws(()=>setPanelPreferences({choices:{...defaultLocalContext,maxDocumentBytes:NaN}}));});
test('native identity/revision binding detects media changes with unchanged app revision',()=>{const first=panelDisclosureKey({...scope,documentRef:'photo-id:r1'});setPanelPreferences({disclosureKey:first});assert.equal(consumePanelDisclosure(panelDisclosureKey({...scope,documentRef:'photo-id:r2'})),false);});
test('every panel chat carries a stable conversation id, refreshed on demand',()=>{
 const first=panelPreferencesSnapshot().conversationId;
 assert.ok(typeof first==='string'&&first.length>0);
 setPanelPreferences({conversationId:'conv-next'});
 assert.equal(panelPreferencesSnapshot().conversationId,'conv-next');
});
