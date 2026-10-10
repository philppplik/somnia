import test from 'node:test';
import assert from 'node:assert/strict';
import example from './contracts/v2/example.json';
import type {ManifestV2} from './manifestV2';
import {SecretSlotSettings,secretNamespace} from './secretSlots';
test('Settings secrets remain namespaced in keychain and expose presence only',async()=>{
  const m=structuredClone(example) as ManifestV2;m.security={tier:'A',secrets:['apiKey']};const entries=new Map<string,string>();
  const settings=new SecretSlotSettings({set:async(ns,slot,value)=>{entries.set(ns+'/'+slot,value);},delete:async(ns,slot)=>{entries.delete(ns+'/'+slot);},exists:async(ns,slot)=>entries.has(ns+'/'+slot)});
  await settings.set(m,'apiKey','private-value');assert.deepEqual(await settings.list(m),[{slot:'apiKey',configured:true}]);await assert.rejects(settings.set(m,'undeclared','x'),/E_UNDECLARED_SECRET/);await assert.rejects(settings.set(m,'apiKey','bad\r\nheader'),/E_INVALID_SECRET/);
  await settings.delete(m,'apiKey');assert.deepEqual(await settings.list(m),[{slot:'apiKey',configured:false}]);assert.notEqual(secretNamespace('a-b'),secretNamespace('a.b'));
});
