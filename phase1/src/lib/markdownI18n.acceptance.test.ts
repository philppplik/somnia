import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATALOGUES,BASE_LOCALE,translate} from './i18n';

const commands=['bold','italic','code','strike','bullet','task','number','quote','codeblock','table','h1','h2','h3','h4','h5','h6','reveal','sync'];
test('all Markdown palette command titles exist directly in every shipped catalogue',()=>{
 const missing=Object.entries(CATALOGUES).flatMap(([locale,cat])=>commands.filter(command=>!cat[`cmd.md.${command}`]?.trim()).map(command=>`${locale}: cmd.md.${command}`));
 assert.deepEqual(missing,[],'Markdown palette keys must not rely on English fallback');
 for(const [locale,cat] of Object.entries(CATALOGUES))for(const command of commands){
  const key=`cmd.md.${command}`;assert.equal(translate(locale,key),cat[key]);
 }
});
test('Markdown components literal UI and accessible-label keys require native catalogue entries',()=>{
 const keys=new Set<string>();
 for(const file of ['MarkdownToolbar.tsx','MarkdownPreview.tsx','Canvas.tsx','MediaPreview.tsx']){
  const source=readFileSync(new URL(`../components/${file}`,import.meta.url),'utf8');
  for(const match of source.matchAll(/\bt\(['"](md\.[^'"]+)['"]/g))keys.add(match[1]);
 }
 assert.ok(keys.size>=20,'scan must find the Markdown UI strings');
 for(const [locale,cat] of Object.entries(CATALOGUES))for(const key of keys){
  assert.ok(Object.hasOwn(cat,key),`${locale}: ${key}`);assert.ok(cat[key]?.trim(),`${locale}: ${key}`);
 }
});
test('Markdown UI keys and interpolation placeholders stay consistent across shipped locales',()=>{
 const base=CATALOGUES[BASE_LOCALE];const keys=Object.keys(base).filter(k=>k.startsWith('md.')||k.startsWith('cmd.md.'));
 assert.ok(keys.length>40,'test must cover the complete Markdown catalogue');
 const params=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
 for(const [locale,cat] of Object.entries(CATALOGUES)){
  assert.deepEqual(Object.keys(cat).filter(k=>k.startsWith('md.')||k.startsWith('cmd.md.')).sort(),[...keys].sort(),locale);
  for(const key of keys){assert.ok(cat[key]?.trim(),`${locale}: ${key}`);assert.deepEqual(params(cat[key]),params(base[key]),`${locale}: ${key}`);}
 }
});
test('contextual Source / Split / Preview, toolbar and link-dialog labels never fall back to key strings',()=>{
 const keys=['md.view.code','md.view.split','md.view.design','md.toolbar','md.srcLabel','md.previewLabel','md.link.title','md.link.text','md.link.url','md.link.pick','md.link.cancel','md.link.insert'];
 for(const locale of Object.keys(CATALOGUES))for(const key of keys){assert.notEqual(translate(locale,key),key,`${locale}: ${key}`);assert.equal(translate(locale,key),CATALOGUES[locale][key]);}
});
