import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest} from './manifest';
const base={id:'acme.hello',name:'Hello',version:'0.1.0',apiVersion:1,permissions:['commands'],contributes:{commands:[{id:'acme.hello.say',title:'Say hello',category:'Tools'}],snippets:[{language:'html',label:'Hero',body:'<section>$1</section>'}],codeThemes:[{id:'acme-night',label:'Acme Night',light:{'--syntax-tag':'#aa0000'},dark:{'--syntax-tag':'#ff8888'}}]}};
test('valid manifest passes',()=>{const r=validateManifest(base);assert.equal(r.ok,true);});
test('rejects unknown permission, wrong apiVersion and foreign command ids',()=>{
 for(const [patch,re] of [[{permissions:['network']},/Unknown permission/],[{apiVersion:2},/apiVersion/],[{contributes:{commands:[{id:'other.cmd',title:'x',category:'Tools'}]}},/must start with/],[{main:'../evil.js'},/relative path/]] as const){
  const r=validateManifest({...base,...patch});assert.equal(r.ok,false);if(!r.ok)assert.match(r.errors.join(' '),re);}
});
test('rejects non-color theme values and commands without permission',()=>{
 let r=validateManifest({...base,contributes:{codeThemes:[{id:'x-y',label:'X',light:{'--syntax-tag':'url(javascript:alert(1))'},dark:{}}]}});assert.equal(r.ok,false);
 r=validateManifest({...base,permissions:[]});assert.equal(r.ok,false);if(!r.ok)assert.match(r.errors.join(' '),/"commands" permission/);
 assert.equal(validateManifest('nope').ok,false);
});
