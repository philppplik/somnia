import test from 'node:test';import assert from 'node:assert/strict';import {LOCAL_MODELS_CATALOGUES} from '../localModelsI18n';
test('all search/setup translations have exact key and placeholder parity in five locales without English fallback',()=>{
 const base=LOCAL_MODELS_CATALOGUES.en;const keys=Object.keys(base).filter(key=>key.startsWith('local.search.')||key.startsWith('local.wizard.'));const tokens=(s:string)=>[...s.matchAll(/\{([^}]+)\}/g)].map(x=>x[1]).sort();
 for(const locale of ['en','de','es','fr','pt-BR']){const catalogue=LOCAL_MODELS_CATALOGUES[locale as keyof typeof LOCAL_MODELS_CATALOGUES];assert.deepEqual(Object.keys(catalogue).filter(k=>k.startsWith('local.search.')||k.startsWith('local.wizard.')).sort(),[...keys].sort());for(const key of keys){assert.equal(typeof catalogue[key],'string',locale+':'+key);assert.ok(catalogue[key].trim(),locale+':'+key);assert.deepEqual(tokens(catalogue[key]),tokens(base[key]),locale+':'+key);}}
});
