import test from 'node:test';
import assert from 'node:assert/strict';
import {askOpenStudio,answerOpenChoice,getOpenChoice,subscribeOpenChoice} from './openChoice';
import {resolveOpen} from './openResolver';
import './index';
const bytes=new TextEncoder().encode('some text');
const offer=()=>{const r=resolveOpen('notes.unknown',bytes);if(r.status!=='safe-text-offer')throw Error('missing offer');return r;};
test('verified text is a confirmation, exposes no bytes, and rejects an incompatible answer',async()=>{
 const pending=askOpenStudio({name:'notes.unknown',bytes},offer());
 assert.equal(getOpenChoice()?.mode,'safe-text-offer');assert.equal(getOpenChoice()?.suggested,'code');
 assert.deepEqual(getOpenChoice()?.candidates.map(h=>h.studioId),['code']);assert.ok(!('bytes' in getOpenChoice()!));
 answerOpenChoice('video');assert.ok(getOpenChoice());answerOpenChoice(null);assert.equal(await pending,null);
});
test('newer choice cancels old one and notifies subscribers; valid choice resolves once',async()=>{
 let updates=0;const unsubscribe=subscribeOpenChoice(()=>updates++);
 const old=askOpenStudio({name:'old.unknown',bytes},offer());
 const newer=askOpenStudio({name:'new.unknown',bytes},offer(),'code');assert.equal(await old,null);
 answerOpenChoice('code');assert.equal(await newer,'code');assert.equal(getOpenChoice(),null);assert.ok(updates>=3);
 unsubscribe();const before=updates;answerOpenChoice(null);assert.equal(updates,before);
});
test('ambiguous content exposes only resolver candidates and the suggested handler',async()=>{
 const r=resolveOpen('picture.docx',new TextEncoder().encode('%PDF-1.7\n'));if(r.status!=='choose-handler')throw Error('missing chooser');
 const p=askOpenStudio({name:'picture.docx',bytes},r,'code');assert.equal(getOpenChoice()?.mode,'choose-handler');assert.equal(getOpenChoice()?.suggested,'code');
 answerOpenChoice('code');assert.equal(await p,'code');
});

test('extension offers are exposed for picking; unknown offer ids are rejected',async()=>{
 const extOpenOffer={id:'acme.md',extensionId:'acme.viewer',kinds:['text' as const],commandId:'acme.viewer.open',capability:'preview' as const,priority:10,effectivePriority:10,title:'MD Viewer'};
 const pending=askOpenStudio({name:'notes.unknown',bytes},offer(),'code',[extOpenOffer]);
 assert.equal(getOpenChoice()?.offers.length,1);
 answerOpenChoice({extensionOffer:'nope.unknown'});assert.ok(getOpenChoice());
 answerOpenChoice({extensionOffer:'acme.md'});assert.deepEqual(await pending,{extensionOffer:'acme.md'});assert.equal(getOpenChoice(),null);
});
