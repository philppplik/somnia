import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountAuth,decodeAccountStatus,effectiveAccountStatus,AccountAuthError} from './accountAuth';
const disconnected={provider:'openai',state:'disconnected',method:'api-key'} as const;
test('native contract: provider arguments and explicit fallback; status is projected',async()=>{
 const calls:{command:string;args:Record<string,string>}[]=[];
 const client=createAccountAuth(async(command,args)=>{calls.push({command,args});return {...disconnected,token:'must-never-leak',email:'private'};},()=>true);
 for(const operation of ['status','start','cancel','disconnect'] as const)assert.deepEqual(await client[operation]('openai'),disconnected);
 await client.setMethod('openai','api-key');
 assert.deepEqual(calls.map(c=>c.command),['agent_account_status','agent_account_start','agent_account_cancel','agent_account_disconnect','agent_account_set_method']);
 assert.deepEqual(calls.at(-1)?.args,{provider:'openai',method:'api-key'});
 assert.ok(calls.slice(0,4).every(c=>JSON.stringify(c.args)==='{"provider":"openai"}'));
});
test('unsupported providers and browser do not invoke native or OAuth',async()=>{
 let calls=0;const transport=async()=>{calls++;return disconnected;};
 for(const provider of ['claude','openrouter','ollama'] as const)await assert.rejects(createAccountAuth(transport,()=>true).start(provider),(e:unknown)=>e instanceof AccountAuthError&&e.code==='unsupported');
 await assert.rejects(createAccountAuth(transport,()=>false).start('openai'),(e:unknown)=>e instanceof AccountAuthError&&e.code==='desktop');assert.equal(calls,0);
});
test('native failure text never escapes; malformed responses fail closed',async()=>{
 await assert.rejects(createAccountAuth(async()=>{throw Error('secret-token-native-details');},()=>true).start('openai'),(e:unknown)=>e instanceof AccountAuthError&&!e.message.includes('secret'));
 for(const value of [null,{}, {...disconnected,provider:'claude'},{...disconnected,state:'working'},{...disconnected,method:'auto'},{...disconnected,expiresAt:NaN},{...disconnected,expiresAt:'123'}])assert.throws(()=>decodeAccountStatus(value),AccountAuthError);
});
test('expiration never silently changes the chosen method',()=>{
 const value={provider:'openai',state:'connected',method:'account',expiresAt:1000} as const;
 assert.equal(effectiveAccountStatus(value,999).state,'connected');assert.deepEqual(effectiveAccountStatus(value,1000),{...value,state:'expired'});
});
