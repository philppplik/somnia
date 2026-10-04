import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCode,langFor} from './format';
test('languages map from file names',()=>{assert.equal(langFor('a.html'),'html');assert.equal(langFor('x/b.css'),'css');assert.equal(langFor('c.js'),'babel');assert.equal(langFor('d.ts'),'typescript');assert.equal(langFor('e.png'),null);});
test('formats html, css and js with the chosen indent',async()=>{
 const h=await formatCode('<div><p>hi</p><ul><li>a</li></ul></div>','html',{indent:4});assert.match(h,/\n    <p>hi<\/p>/);
 const c=await formatCode('a{color:red;margin:0}','css',{indent:2});assert.equal(c,'a {\n  color: red;\n  margin: 0;\n}\n');
 const j=await formatCode('const a={b:1,c:[1,2]};function f(){return a}','babel',{indent:'tab'});assert.match(j,/\n\treturn a;/);});
