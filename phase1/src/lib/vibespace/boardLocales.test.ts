import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('A8 board catalogue keys and placeholders have five-locale parity',()=>{
 const read=(l:string)=>JSON.parse(readFileSync(new URL(`../../locales/vibespace/board/${l}.json`,import.meta.url),'utf8')) as Record<string,string>;
 const catalogues=['en','de','es','fr','pt-BR'].map(read);
 const baseline=Object.keys(catalogues[0]).sort();
 assert.ok(baseline.length>=30,'board catalogue is complete');
 assert.ok(baseline.every(k=>k.startsWith('vs.board.')));
 for(const c of catalogues){
  assert.deepEqual(Object.keys(c).sort(),baseline);
  for(const k of baseline){
   assert.ok(c[k].trim(),k);
   assert.deepEqual(c[k].match(/\{\w+\}/g),catalogues[0][k].match(/\{\w+\}/g),k);
  }
 }
 // plural pairs stay paired
 for(const stem of baseline.filter(k=>k.endsWith('_one')).map(k=>k.slice(0,-4))){
  assert.ok(baseline.includes(`${stem}_other`),stem);
 }
});
