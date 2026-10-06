import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATALOGUES, translate} from './i18n';
import {catalogErrorCode,CATEGORIES} from './extensions/catalogView';
import {permissionExplanation} from './extensions/catalog';
import {THEME_CHOICES} from './theme';

test('settings and catalogue literal keys exist in every language, without English fallback',()=>{
 for(const file of ['Settings.tsx','ExtensionCatalog.tsx','CommandPalette.tsx']){
  const source=readFileSync(new URL('../components/'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/\bt(?:Or)?\(["']([^"']+)["']\s*(?=[,)])/g)){
   for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(match[1] in cat||match[1]+'_other' in cat,`${locale}: ${file}: ${match[1]}`);
  }
  assert.equal(/aria-label="[A-Za-z]/.test(source),false,`${file}: untranslated accessible label`);
 }
});
test('all dynamic theme, category, state and permission labels exist in every language',()=>{
 const keys=[...THEME_CHOICES.map(x=>'finish.settings.theme.'+x.id),...CATEGORIES.map(x=>'finish.catalog.category.'+x),...Object.keys(permissionExplanation).map(x=>'finish.catalog.permission.'+x),...['not-installed','installed','update-available','newer-installed'].flatMap(x=>['finish.catalog.state.'+x,'finish.catalog.action.'+x])];
 for(const [locale,cat] of Object.entries(CATALOGUES))for(const key of keys)assert.ok(cat[key]?.trim(),`${locale}: ${key}`);
});
test('all provider error classes have translated title and hint; diagnostics are not used as instructions',()=>{
 for(const [message,code] of [['(403)','limited'],['(429)','limited'],['(404)','notFound'],['(503)','server'],['timed out','timeout'],['Failed to fetch','network'],['SHA-256 mismatch','hash'],['unknown','unknown']] as const){
  assert.equal(catalogErrorCode(message),code);
  for(const [locale,cat] of Object.entries(CATALOGUES))for(const suffix of ['title','hint'])assert.ok(cat[`finish.catalog.error.${code}.${suffix}`],locale);
 }
});
test('catalogue plurals and version placeholders render without unresolved parameters',()=>{
 for(const locale of Object.keys(CATALOGUES))for(const count of [0,1,2,1000000]){
  assert.ok(!translate(locale,'finish.catalog.updates',{count}).includes('{'));
  assert.ok(!translate(locale,'finish.catalog.visible',{count,visible:1}).includes('{'));
  assert.ok(translate(locale,'finish.catalog.versions',{from:'1.0',to:'2.0'}).includes('2.0'));
 }
});
test('new static command titles are covered in all five catalogues',()=>{
 const ids=['edit.undo','edit.redo','project.openMedia','edit.encodeEntities','edit.decodeEntities','project.compare','project.close','project.reconnect','collab.share','collab.join',...['row.above','row.below','row.delete','col.left','col.right','col.delete','header','merge'].map(id=>'table.'+id),...Array.from({length:10},(_,i)=>'insert.element.'+i)];
 for(const [locale,cat] of Object.entries(CATALOGUES))for(const id of ids)assert.ok(cat['cmd.'+id],`${locale}: ${id}`);
});
test('round 2 components literal keys exist in every language',()=>{
 for(const file of ['LivePreview.tsx','DiskComparison.tsx','SourceDiff.tsx','MediaPreview.tsx','LayersPanel.tsx','EmptyState.tsx']){
  const source=readFileSync(new URL('../components/'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/\bt\(["']([^"']+)["']\s*(?=[,)])/g))for(const [locale,cat] of Object.entries(CATALOGUES))assert.ok(match[1] in cat||match[1]+'_other' in cat,`${locale}: ${file}: ${match[1]}`);
 }
});
test('preview blocked/error plural messages preserve every placeholder in all locales',()=>{
 for(const locale of Object.keys(CATALOGUES))for(const count of [0,1,2,1000000]){
  const text=translate(locale,'finish2.preview.blocked',{count,files:'literal-ä.js'});
  assert.ok(text.includes('literal-ä.js'));assert.ok(!text.includes('{'));
  assert.ok(!translate(locale,'finish2.preview.errors',{count}).includes('{'));
 }
});
