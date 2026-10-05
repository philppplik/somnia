import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOGUES,BASE_LOCALE,LOCALE_NAMES,resolveLocale,translate} from './i18n';

const placeholders=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join(',');
const base=CATALOGUES[BASE_LOCALE];

test('every locale has a native name',()=>{for(const l of Object.keys(CATALOGUES))assert.ok(LOCALE_NAMES[l],`missing name for ${l}`);});
for(const [locale,cat] of Object.entries(CATALOGUES)){
 if(locale===BASE_LOCALE)continue;
 test(`${locale}: no missing keys`,()=>{const missing=Object.keys(base).filter(k=>!(k in cat));assert.deepEqual(missing,[],`${locale} lacks: ${missing.join(', ')}`);});
 test(`${locale}: no unused keys`,()=>{const extra=Object.keys(cat).filter(k=>!(k in base)&&!(k.replace(/_(one|few|many|two|zero)$/,'_other') in base));assert.deepEqual(extra,[]);});
 test(`${locale}: placeholders match`,()=>{for(const k of Object.keys(cat)){const b=base[k]??base[k.replace(/_(one|few|many|two|zero)$/,'_other')];if(b!==undefined)assert.equal(placeholders(cat[k]),placeholders(b),`${locale}:${k}`);}});
}
test('base keys have no empty values',()=>{for(const [k,v] of Object.entries(base))assert.ok(v.trim().length>0,k);});
test('plural and interpolation',()=>{assert.equal(translate('en','common.files',{count:1}),'1 file');assert.equal(translate('en','common.files',{count:3}),'3 files');});
test('missing key falls back to the key',()=>{assert.equal(translate('en','no.such.key'),'no.such.key');});
test('resolveLocale follows system list and falls back to en',()=>{assert.equal(resolveLocale('system',['xx-YY']),'en');assert.equal(resolveLocale('system',['en-GB']),'en');assert.equal(resolveLocale('en',[]),'en');});
