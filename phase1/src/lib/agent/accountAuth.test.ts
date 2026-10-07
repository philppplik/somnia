import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountAuthError,parseAccountStatus,accountStatus,accountDisconnect,accountSetMethod,shouldPollAccount} from './accountAuth';
const ok=(value:unknown,calls:unknown[]=[])=>({isTauri:()=>true,invoke:(async(c:string,a:unknown)=>{calls.push([c,a]);return value;}) as never});
test('parse keeps only contract fields and drops secrets',()=>{
 const s=parseAccountStatus({provider:'openai',state:'connected',method:'account',expiresAt:5,accessToken:'fixture-secret',email:'a@b.c'});
 assert.deepEqual(s,{provider:'openai',state:'connected',method:'account',expiresAt:5});
 assert.ok(!JSON.stringify(s).includes('fixture-secret'));
});
test('parse rejects malformed payloads',()=>{
 for(const v of [null,{},{provider:'claude',state:'connected',method:'account'},{provider:'openai',state:'x',method:'account'},{provider:'openai',state:'connected',method:'z'}])assert.throws(()=>parseAccountStatus(v),AccountAuthError);
});
test('commands pass provider/method; disconnect and status use the right native command',async()=>{
 const calls:unknown[]=[];const st={provider:'openai',state:'disconnected',method:'api-key'};
 await accountStatus('openai',ok(st,calls));await accountDisconnect('openai',ok(st,calls));await accountSetMethod('openai','api-key',ok(st,calls));
 assert.deepEqual(calls,[['agent_account_status',{provider:'openai'}],['agent_account_disconnect',{provider:'openai'}],['agent_account_set_method',{provider:'openai',method:'api-key'}]]);
});
test('errors are generic, never raw native text',async()=>{
 const deps={isTauri:()=>true,invoke:(async()=>{throw 'keyring: secret fixture-secret failed';}) as never};
 await assert.rejects(accountStatus('openai',deps),(e:unknown)=>e instanceof AccountAuthError&&e.code==='unavailable'&&!e.message.includes('fixture-secret'));
 await assert.rejects(accountStatus('claude',ok({})),(e:unknown)=>e instanceof AccountAuthError&&e.code==='unsupported');
 await assert.rejects(accountStatus('openai',{isTauri:()=>false}),(e:unknown)=>e instanceof AccountAuthError&&e.code==='native-only');
 await assert.rejects(accountSetMethod('openai','bogus' as never,ok({})),AccountAuthError);
});
test('polling only for pending/connected',()=>{
 const m=(state:string)=>shouldPollAccount({provider:'openai',state:state as never,method:'account'});
 assert.deepEqual(['disconnected','pending','connected','expired'].map(m),[false,true,true,false]);
});
