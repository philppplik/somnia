import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubAuth,decodeGithubStatus,GithubAuthError} from './githubAccount';
test('commands carry no arguments and the status is projected',async()=>{
 const calls:string[]=[];
 const c=createGithubAuth(async(cmd)=>{calls.push(cmd);return {provider:'github',state:'connected',login:'philppplik',name:'Philipp',accessToken:'gho_must_not_leak',deviceCode:'secret'};},()=>true);
 for(const op of ['status','start','cancel','disconnect'] as const)assert.deepEqual(await c[op](),{state:'connected',login:'philppplik',name:'Philipp'});
 assert.deepEqual(calls,['github_account_status','github_account_start','github_account_cancel','github_account_disconnect']);
});
test('pending status carries the user code and only the GitHub device page',()=>{
 assert.deepEqual(decodeGithubStatus({provider:'github',state:'pending',userCode:'WDJB-MJHT',verificationUri:'https://github.com/login/device'}),{state:'pending',userCode:'WDJB-MJHT',verificationUri:'https://github.com/login/device'});
 assert.equal(decodeGithubStatus({provider:'github',state:'pending',userCode:'A',verificationUri:'https://evil.example'}).verificationUri,undefined);
});
test('browser does not invoke native; failures never leak text; malformed fails closed',async()=>{
 let n=0;await assert.rejects(createGithubAuth(async()=>{n++;return {};},()=>false).start(),(e:unknown)=>e instanceof GithubAuthError&&e.code==='desktop');assert.equal(n,0);
 await assert.rejects(createGithubAuth(async()=>{throw Error('gho_secret');},()=>true).start(),(e:unknown)=>e instanceof GithubAuthError&&!e.message.includes('gho_'));
 for(const v of [null,{},{provider:'openai',state:'connected'},{provider:'github',state:'working'}])assert.throws(()=>decodeGithubStatus(v),GithubAuthError);
});
