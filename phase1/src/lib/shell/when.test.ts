import test from 'node:test';import assert from 'node:assert/strict';
import {evalWhen,parseWhen,validateWhen,WhenSyntaxError} from './when';
const ctx={studio:'photos',document:{dirty:true,readOnly:false,kind:'png'},selection:{count:2,kind:'many'},busy:false,services:{core:true}};
test('basics',()=>{
 assert.equal(evalWhen(undefined,ctx),true);assert.equal(evalWhen('  ',ctx),true);
 assert.equal(evalWhen('selection.count>0 && !document.readOnly',ctx),true);
 assert.equal(evalWhen("studio=='photos'",ctx),true);assert.equal(evalWhen('studio!="code"',ctx),true);
 assert.equal(evalWhen('selection.count>=3',ctx),false);assert.equal(evalWhen('busy || services.core',ctx),true);
 assert.equal(evalWhen('(busy||document.dirty)&&!busy',ctx),true);
});
test('missing paths are falsy, ordering with non-number is false',()=>{
 assert.equal(evalWhen('nope.x.y',ctx),false);assert.equal(evalWhen('!nope',ctx),true);
 assert.equal(evalWhen('studio>1',ctx),false);assert.equal(evalWhen('nope==null',ctx),false);
});
test('no prototype access',()=>{
 assert.equal(evalWhen('constructor',ctx),false);assert.equal(evalWhen('document.__proto__',ctx),false);
 assert.equal(evalWhen('toString',ctx),false);
});
test('syntax errors never throw at eval time',()=>{
 for(const bad of ['a &&','(a','a ==','1 2','a.','"x','a ? b : c','foo()','a = b'])assert.equal(evalWhen(bad,ctx),false,bad);
 assert.throws(()=>parseWhen('a &&'),WhenSyntaxError);assert.ok(validateWhen('a &&'));assert.equal(validateWhen('a&&b'),null);
});
test('no code execution',()=>{
 (globalThis as any).__pwned=false;
 evalWhen("(globalThis.__pwned=true)",ctx);evalWhen('process.exit',ctx);assert.equal((globalThis as any).__pwned,false);
});
