import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsFormat,getStudio,listStudios,sheetsStudio} from '../studios';
import {CATALOGUES} from '../i18n';
test('Sheets registers additively, claims only xlsx and Code stays first',()=>{
 assert.equal(getStudio('sheets'),sheetsStudio);assert.equal(listStudios()[0].id,'code');
 assert.equal(acceptsFormat(sheetsStudio,'budget.XLSX'),true);assert.equal(acceptsFormat(sheetsStudio,'index.html'),false);assert.equal(acceptsFormat(sheetsStudio,'a.xls'),false);
 assert.equal(sheetsStudio.canvas,'sheets.canvas');assert.equal(sheetsStudio.shell.inspector,'sheets.inspector');
});
test('every Sheets string exists in all five catalogues',()=>{
 const keys=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('sheets.')||k.endsWith('studio.sheets'));assert.ok(keys.length>=20);
 for(const [locale,catalogue] of Object.entries(CATALOGUES))for(const key of keys)assert.ok(catalogue[key],`${locale}:${key}`);
 for(const key of keys){const ph=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort().join();for(const c of Object.values(CATALOGUES))assert.equal(ph(c[key]),ph(CATALOGUES.en[key]),key);}
});
