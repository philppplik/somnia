import test from 'node:test';import assert from 'node:assert/strict';
import {parseVariables,setVariableValue,addVariable,listClasses,renameClass,countVarUses} from './cssTools.ts';
const files={
 'index.html':'<html><head><style>:root{--bg:#fff;--gap: 8px}\n.card{padding:var(--gap)}</style></head><body class="page dark"><div class="card big"></div><p class=\'card\'></p></body></html>',
 'style.css':'/* --ghost: 1; */\n:root{\n  --brand: #7c3aed;\n}\n.dark{--bg:#000}\n.card:hover,.big .card{color:var(--brand)}\n@media (min-width:600px){.page{margin:0.5em}}\n.btn-card{x:y}\n@keyframes spin{0%{opacity:0}}\n',
};
test('parses variables with scope, value and uses',()=>{
 const v=parseVariables(files);const by=(n:string,s?:string)=>v.find(x=>x.name===n&&(!s||x.scope===s))!;
 assert.equal(v.length,4);assert.equal(by('--brand').value,'#7c3aed');assert.equal(by('--bg',':root').file,'index.html');assert.equal(by('--bg','.dark').value,'#000');
 assert.equal(by('--gap').value,'8px');assert.equal(by('--gap').uses,1);assert.equal(by('--brand').uses,1);assert.ok(!v.some(x=>x.name==='--ghost'));assert.equal(by('--brand').line,3);});
test('sets a value by offset in css and in html style',()=>{
 const v=parseVariables(files);const b=v.find(x=>x.name==='--brand')!;assert.match(setVariableValue(files,b,'#ff0000')!,/--brand: #ff0000;/);
 const g=v.find(x=>x.name==='--gap')!;assert.match(setVariableValue(files,g,'12px')!,/--gap: 12px\}/);
 assert.equal(setVariableValue(files,b,'red; x:y'),null);assert.equal(setVariableValue(files,b,'  '),null);});
test('adds a variable to :root or creates one',()=>{
 assert.match(addVariable(files,'style.css','--new','1px')!,/:root\{\n  --new: 1px;/);
 assert.match(addVariable({'a.css':'p{}'},'a.css','--x','2')!,/^:root \{\n  --x: 2;\n\}/);assert.equal(addVariable(files,'style.css','bad','1'),null);});
test('lists classes with usage',()=>{
 const c=Object.fromEntries(listClasses(files).map(x=>[x.name,x]));
 assert.equal(c.card.used,2);assert.equal(c.card.defined,3);assert.equal(c.big.used,1);assert.equal(c['btn-card'].used,0);assert.equal(c.page.used,1);assert.ok(!c['5em']&&!c.hover);});
test('renames in selectors and class attributes only',()=>{
 const r=renameClass(files,'card','tile') as {changed:Record<string,string>;count:number};
 assert.ok(r.changed['style.css'].includes('.tile:hover,.big .tile{'));assert.ok(r.changed['style.css'].includes('.btn-card'));
 assert.ok(r.changed['index.html'].includes('class="tile big"'));assert.ok(r.changed['index.html'].includes("class='tile'"));assert.ok(r.changed['index.html'].includes('.tile{padding'));assert.equal(r.count,5);});
test('rename rejects bad and duplicate names',()=>{
 assert.ok('error' in renameClass(files,'card','1x'));assert.ok('error' in renameClass(files,'card','big'));assert.deepEqual((renameClass(files,'card','card') as {count:number}).count,0);});
test('counts var uses',()=>{assert.equal(countVarUses(files).get('--gap'),1);});
