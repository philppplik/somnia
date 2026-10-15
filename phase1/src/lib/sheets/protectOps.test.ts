import test from 'node:test';import assert from 'node:assert/strict';
import {ALLOW_PRESETS,PROTECT_ALLOW,parseProtectCommand,parseProtection} from './protectOps';
test('protect command accepts the closed allowlist',()=>{
 assert.deepEqual(parseProtectCommand({kind:'protect'}),{kind:'protect'});
 assert.deepEqual(parseProtectCommand({kind:'protect',password:'',allow:['sort','sort','formatCells']}),{kind:'protect',allow:['sort','formatCells']});
 assert.deepEqual(parseProtectCommand({kind:'protect',password:'pw'}),{kind:'protect',password:'pw'});
 assert.deepEqual(parseProtectCommand({kind:'unprotect'}),{kind:'unprotect'});assert.deepEqual(parseProtectCommand({kind:'unprotect',password:'x'}),{kind:'unprotect',password:'x'});
 assert.deepEqual(parseProtectCommand({kind:'lock',locked:false}),{kind:'lock',locked:false});assert.deepEqual(parseProtectCommand({kind:'workbook',on:true}),{kind:'workbook',on:true});
});
test('protect command refuses malformed input',()=>{
 for(const bad of [null,[],'x',{},{kind:'burn'},{kind:'protect',extra:1},{kind:'protect',allow:['everything']},{kind:'protect',allow:'sort'},{kind:'protect',allow:Array(10).fill('sort')},{kind:'protect',password:5},{kind:'protect',password:'x'.repeat(65)},{kind:'protect',password:'a\u0007'},{kind:'unprotect',password:'a\nb'},{kind:'unprotect',x:1},{kind:'lock'},{kind:'lock',locked:'y'},{kind:'workbook'},{kind:'workbook',on:1}])
  assert.throws(()=>parseProtectCommand(bad),JSON.stringify(bad));
});
test('errors never echo the password',()=>{
 try{parseProtectCommand({kind:'protect',password:'secret\u0007pw'});assert.fail('should throw');}catch(e){assert.ok(!String((e as Error).message).includes('secret'));}
});
test('presets only use known permissions and answers are bounded',()=>{
 for(const list of Object.values(ALLOW_PRESETS))for(const a of list)assert.ok((PROTECT_ALLOW as readonly string[]).includes(a));
 assert.equal(parseProtection(null),null);assert.deepEqual(parseProtection({password:true,allow:['sort','bogus',3]}),{password:true,allow:['sort']});assert.deepEqual(parseProtection({}),{password:false,allow:[]});
});
