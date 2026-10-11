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
test('panels are validated',()=>{
 const ok=validateManifest({...base,contributes:{panels:[{id:'files',title:'Files',side:'left',html:'<p>x</p>'}]}});assert.equal(ok.ok,true);
 for(const bad of [{id:'Bad Id',title:'x',side:'left',html:'x'},{id:'a',title:'x',side:'top',html:'x'},{id:'a',title:'x',side:'left',html:'x'.repeat(50001)}]){const r=validateManifest({...base,contributes:{panels:[bad]}});assert.equal(r.ok,false);}
});

test('accentPalettes are validated and normalized',()=>{
 const ok=validateManifest({...base,permissions:[],contributes:{accentPalettes:[{id:'ocean-blue',label:'Ocean Blue',light:'#075D96',dark:'#80d4ff'}]}});
 assert.equal(ok.ok,true);if(ok.ok){const p=ok.manifest.contributes.accentPalettes[0];assert.equal(p.light,'#075d96');assert.equal(p.dark,'#80d4ff');}
 for(const bad of [{id:'Bad Id',label:'X',light:'#075d96',dark:'#80d4ff'},{id:'x',label:'',light:'#075d96',dark:'#80d4ff'},{id:'x',label:'X',light:'#123',dark:'#80d4ff'},{id:'x',label:'X',light:'red',dark:'#80d4ff'},{id:'x',label:'X',light:'#075d96'},{id:'x',label:'X',light:'#075d96',dark:'url(javascript:alert(1))'}]){
  const r=validateManifest({...base,contributes:{accentPalettes:[bad]}});assert.equal(r.ok,false,JSON.stringify(bad));}
});
