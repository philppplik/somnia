import test from 'node:test';
import assert from 'node:assert/strict';
import {askOpenStudio,answerOpenChoice,getOpenChoice} from './openChoice';
import {resolveOpen} from './openResolver';
import './index';
const bytes=new TextEncoder().encode('some text');
test('unknown text asks, rejects incompatible choice, and cancels without opening',async()=>{
 const resolution=resolveOpen('notes.unknown',bytes);assert.equal(resolution.status,'safe-text-offer');
 if(resolution.status!=='safe-text-offer')throw Error('missing offer');
 const pending=askOpenStudio({name:'notes.unknown',bytes},resolution,'video');
 assert.equal(getOpenChoice()?.suggested,'video');assert.deepEqual(getOpenChoice()?.candidates.map(h=>h.studioId),['code']);
 answerOpenChoice('video');assert.ok(getOpenChoice());answerOpenChoice(null);assert.equal(await pending,null);
});
test('a newer choice cancels the old one; valid choice resolves exactly once',async()=>{
 const r=resolveOpen('x.unknown',bytes);if(r.status!=='safe-text-offer')throw Error('missing offer');
 const old=askOpenStudio({name:'old.unknown',bytes},r);
 const newer=askOpenStudio({name:'new.unknown',bytes},r,'code');assert.equal(await old,null);
 answerOpenChoice('code');assert.equal(await newer,'code');assert.equal(getOpenChoice(),null);answerOpenChoice(null);
});
test('unrecognized binary has no unsafe Studio fallback',async()=>{
 const r=resolveOpen('x.bin',new Uint8Array([0,1,0,1]));if(r.status!=='unsupported')throw Error('expected unsupported');
 const pending=askOpenStudio({name:'x.bin',bytes},r);assert.deepEqual(getOpenChoice()?.candidates,[]);
 answerOpenChoice('code');assert.ok(getOpenChoice());answerOpenChoice(null);assert.equal(await pending,null);
});
