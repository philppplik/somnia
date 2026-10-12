import test from 'node:test';import assert from 'node:assert/strict';
import {describeAcpEvent} from './acpPresentation';import {VIBESPACE_CATALOGUES} from './i18n';
test('computer-use transcript records explicit decision and external agent without capturing content',()=>{
 for(const [decision,tone] of [['allowed','allowed'],['denied','denied'],['unknown','warn']] as const){
  const line=describeAcpEvent({kind:'computer_use',data:{decision,agent:'Codex\n\u202ex',phase:'screen_capture',bytes:'SECRET'}})!;
  assert.equal(line.tone,tone);assert.equal(line.params.action,'screen_capture');assert.ok(!JSON.stringify(line).includes('SECRET'));assert.ok(!/[\n\u202e]/.test(line.params.agent));
 }
});
test('all five computer-use catalogues have matching keys and placeholders',()=>{
 const keys=Object.keys(VIBESPACE_CATALOGUES.en).filter(k=>k.startsWith('vibespace.computerUse.'));assert.equal(keys.length,7);
 for(const locale of ['en','de','es','fr','pt-BR'])for(const key of keys){assert.ok(VIBESPACE_CATALOGUES[locale][key]);assert.deepEqual(VIBESPACE_CATALOGUES[locale][key].match(/\{\w+\}/g),VIBESPACE_CATALOGUES.en[key].match(/\{\w+\}/g));}
});
