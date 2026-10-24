// Every locale module must ship the same keys in every language, with the same
// {placeholder} sets — a key added to en.json but forgotten in de.json silently
// falls back or renders raw. Modules are files grouped by directory + prefix:
// photos/en.json is module "", photos/rail.en.json is module "rail".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';

const root=new URL('./',import.meta.url).pathname;
const LANGS=new Set(['en','de','es','fr','pt-BR']);
const modules=new Map(); // "dir|prefix" -> lang -> object
const walk=(dir)=>{
 for(const f of readdirSync(dir)){
  const p=join(dir,f);
  if(statSync(p).isDirectory()){walk(p);continue;}
  if(!f.endsWith('.json'))continue;
  const m=/^(?:(.+)\.)?(en|de|es|fr|pt-BR)\.json$/.exec(f);
  if(!m)continue;
  const id=dir+'|'+(m[1]??'');
  if(!modules.has(id))modules.set(id,{});
  modules.get(id)[m[2]]=JSON.parse(readFileSync(p,'utf8'));
 }
};
walk(root);

test('locale key parity across languages',()=>{
 assert.ok(modules.size>10,'expected locale modules to be discovered');
 for(const [id,langs] of modules){
  const union=new Set(Object.values(langs).flatMap(o=>Object.keys(o)));
  for(const [lang,data] of Object.entries(langs)){
   const missing=[...union].filter(k=>!(k in data));
   assert.deepEqual(missing,[],`${id} [${lang}] missing keys: ${missing.join(', ')}`);
  }
 }
});

test('interpolation placeholder parity per key',()=>{
 for(const [id,langs] of modules){
  const union=new Set(Object.values(langs).flatMap(o=>Object.keys(o)));
  for(const k of union){
   const sets=Object.entries(langs).filter(([,d])=>k in d)
    .map(([lang,d])=>[lang,[...(d[k].match(/\{\w+\}/g)??[])].sort().join('')]);
   const first=sets[0]?.[1];
   for(const [lang,s] of sets)assert.equal(s,first,`${id} ${k} [${lang}] placeholders differ`);
  }
 }
});
