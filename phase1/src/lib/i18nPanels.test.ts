import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {CATALOGUES,translate} from './i18n';

test('panel literal translation keys exist in both catalogues',()=>{
 const dir=new URL('../components/',import.meta.url);
 const files=readdirSync(dir).filter(f=>f.endsWith('Panel.tsx')||['Inspector.tsx','ElementMetrics.tsx','ComponentBrowser.tsx','VariantTools.tsx'].includes(f));
 for(const file of files){
  const source=readFileSync(new URL(file,dir),'utf8');
  for(const match of source.matchAll(/t\('(panels\.[^']+)'(?=[,)])/g)){
   const key=match[1];for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(key in cat||key+'_other' in cat,`${locale}: ${file}: ${key}`);
  }
 }
});
test('panel plurals and interpolated messages work in English and German',()=>{
 assert.equal(translate('en','panels.problems.errors',{count:1}),'1 error');
 assert.equal(translate('en','panels.problems.warnings',{count:2}),'2 warnings');
 assert.equal(translate('de','panels.problems.warnings',{count:1}),'1 Warnung');
 assert.equal(translate('de','panels.problems.warnings',{count:2}),'2 Warnungen');
 assert.equal(translate('de','panels.search.matches',{count:0}),'0 Treffer');
 assert.equal(translate('de','panels.files.open',{path:'assets/example.css'}),'assets/example.css öffnen');
 assert.equal(translate('de','panels.inspector.computed',{label:'Breite'}),'Breite, berechnet');
});
