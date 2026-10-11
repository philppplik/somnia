import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProcessSupport,describeConsentGate} from './consentPresentation';
import {VIBESPACE_CATALOGUES} from './i18n';
import {setLocale,t,BASE_LOCALE} from '../i18n';

test('shell on linux gets the strong sandbox line, on windows the poc line',()=>{
 const g=describeConsentGate('shell','linux',defaultProcessSupport('linux'));
 assert.equal(g?.level,'strong');assert.equal(g?.levelKey,'vibespace.consent.gate.strong');assert.equal(g?.noteKey,null);
 const w=describeConsentGate('shell','windows',defaultProcessSupport('windows'));
 assert.equal(w?.level,'poc');assert.equal(w?.levelKey,'vibespace.consent.gate.poc');
});

test('network goes through the domain proxy line',()=>{
 const g=describeConsentGate('network','linux',defaultProcessSupport('linux'));
 assert.equal(g?.levelKey,'vibespace.consent.gate.proxy');
});

test('macOS and unknown platforms are visibly unavailable, never silent',()=>{
 const m=describeConsentGate('shell','macos',defaultProcessSupport('macos'));
 assert.equal(m?.level,'unavailable');assert.equal(m?.noteKey,'vibespace.consent.gate.unavailable.macos');
 const o=describeConsentGate('shell','other',defaultProcessSupport('other'));
 assert.equal(o?.level,'unavailable');assert.equal(o?.noteKey,null);
});

test('elevated mode gets its own loud line',()=>{
 const g=describeConsentGate('shell','linux',{kind:'elevated'});
 assert.equal(g?.level,'elevated');assert.equal(g?.levelKey,'vibespace.consent.gate.elevated');
});

test('file consents and unknown kinds get no gate line',()=>{
 for(const k of ['read','write','delete','mcp','desktop',undefined,null,'Shell',''])assert.equal(describeConsentGate(k as never,'linux',defaultProcessSupport('linux')),null);
});

test('all five locales carry exactly the same gate keys and none fall back to the key',()=>{
 const tags=Object.keys(VIBESPACE_CATALOGUES).sort();
 assert.deepEqual(tags,['de','en','es','fr','pt-BR']);
 const enKeys=Object.keys(VIBESPACE_CATALOGUES.en).sort();
 for(const tag of tags)assert.deepEqual(Object.keys(VIBESPACE_CATALOGUES[tag]).sort(),enKeys,`parity ${tag}`);
 for(const tag of tags){
  setLocale(tag);
  for(const k of enKeys){
   const v=t(k);
   assert.notEqual(v,k,`${tag}:${k} must translate`);
   assert.ok(v.trim().length>0);
  }
 }
 setLocale(BASE_LOCALE);
});
