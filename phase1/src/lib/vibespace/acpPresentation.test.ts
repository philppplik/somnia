import test from 'node:test';
import assert from 'node:assert/strict';
import {describeAcpEvent,describeAcpTranscript,describeConsentOrigin} from './acpPresentation';
import {VIBESPACE_CATALOGUES} from './i18n';
import {setLocale,t,BASE_LOCALE} from '../i18n';

test('external agent origin is shown with its name; other origins are not touched',()=>{
 assert.deepEqual(describeConsentOrigin({type:'external_agent',name:'Claude Code'}),{key:'vibespace.acp.origin',params:{name:'Claude Code'},tone:'info'});
 for(const o of [{type:'model'},{type:'skill',name:'x'},null,undefined])assert.equal(describeConsentOrigin(o as never),null);
});

test('agent-controlled text is stripped of control and bidi characters and capped',()=>{
 const l=describeConsentOrigin({type:'external_agent',name:'A\u202eB\nC'+'x'.repeat(200)})!;
 assert.ok(!/[\u202e\n]/.test(l.params.name));assert.ok(l.params.name.length<=81);
});

test('permission events map to allowed/denied/warn and anything unclear is never "allowed"',()=>{
 const mk=(decision:unknown)=>describeAcpEvent({kind:'permission',data:{decision,kind:'write',title:'edit a.txt'}})!;
 assert.equal(mk('allowed').tone,'allowed');assert.equal(mk('denied').tone,'denied');
 assert.equal(mk('cancelled').tone,'warn');assert.equal(mk('weird').tone,'warn');assert.equal(mk(undefined).key,'vibespace.acp.perm.cancelled');
});

test('transcript keeps lifecycle and permission lines and skips raw updates',()=>{
 const lines=describeAcpTranscript([
  {kind:'lifecycle',data:{event:'launched'}},{kind:'lifecycle',data:{event:'initialized'}},
  {kind:'session_ready',data:{resumed:false}},{kind:'update',data:{}},{kind:'prompt',data:{}},
  {kind:'permission',data:{decision:'denied',kind:'delete',title:'rm'}},
  {kind:'session_ready',data:{resumed:true}},{kind:'lifecycle',data:{event:'killed'}},{kind:'lifecycle',data:{event:'nope'}},{}]);
 assert.deepEqual(lines.map(l=>l.key),['vibespace.acp.launched','vibespace.acp.initialized','vibespace.acp.sessionNew','vibespace.acp.perm.denied','vibespace.acp.sessionResumed','vibespace.acp.killed']);
});

test('five locales carry every acp key with matching placeholders',()=>{
 const keys=Object.keys(VIBESPACE_CATALOGUES.en).filter(k=>k.startsWith('vibespace.acp.')).sort();
 assert.ok(keys.length>=12);
 for(const tag of Object.keys(VIBESPACE_CATALOGUES)){
  setLocale(tag);
  for(const k of keys){
   const v=t(k);assert.notEqual(v,k,`${tag}:${k}`);
   assert.deepEqual(VIBESPACE_CATALOGUES[tag][k].match(/\{\w+\}/g),VIBESPACE_CATALOGUES.en[k].match(/\{\w+\}/g),`${tag}:${k} placeholders`);
  }
 }
 setLocale(BASE_LOCALE);
});
