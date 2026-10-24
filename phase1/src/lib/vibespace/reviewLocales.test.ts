import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('A5 catalogue keys and placeholders have five-locale parity',()=>{
 const catalogues=['en','de','es','fr','pt-BR'].map(l=>JSON.parse(readFileSync(new URL(`../../locales/${l}.json`,import.meta.url),'utf8')) as Record<string,string>);
 const keys=(c:Record<string,string>)=>Object.keys(c).filter(k=>k.startsWith('vibe.review.')).sort();const baseline=keys(catalogues[0]);assert.equal(baseline.length,44);
 for(const c of catalogues){assert.deepEqual(keys(c),baseline);for(const k of baseline){assert.ok(c[k].trim());assert.deepEqual(c[k].match(/\{\w+\}/g),catalogues[0][k].match(/\{\w+\}/g));}}
});
