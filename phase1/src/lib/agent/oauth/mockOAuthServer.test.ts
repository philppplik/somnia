import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MockOAuthServer} from './testSupport/mockOAuthServer';
import {FakeClock} from './testSupport/clock';
import {s256,isValidVerifier,newVerifier} from './testSupport/pkce';
import {visitAuthorize,listenLoopback} from './testSupport/browserSim';
test('PKCE S256 matches the RFC 7636 appendix B vector',()=>{
 assert.equal(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 assert.ok(isValidVerifier(newVerifier()));assert.equal(isValidVerifier('short'),false);assert.equal(isValidVerifier('a'.repeat(129)),false);assert.equal(isValidVerifier('a b'+'a'.repeat(50)),false);
 assert.notEqual(newVerifier(),newVerifier());
 assert.equal(s256('x'),createHash('sha256').update('x').digest('base64url'));
});
async function begin(srv:MockOAuthServer,over:Record<string,string>={},cid='dynamic_agent_client'){
 const lb=await listenLoopback();const verifier=newVerifier();
 const u=new URL(srv.issuer+'/api/accounts/authorize');
 for(const [k,v] of Object.entries({response_type:'code',client_id:cid,redirect_uri:lb.redirectUri,scope:'openid offline_access',nonce:'n-1234567890123456',state:'st-1234567890123456',code_challenge:s256(verifier),code_challenge_method:'S256',agent_name_hint:'Somnia',ext_agent_host_id:'urn:uuid:123e4567-e89b-12d3-a456-426614174000',...over}))if(v!=='')u.searchParams.set(k,v);
 const r=await visitAuthorize(u.toString());await lb.close();return {r,verifier,lb,cb:r.location?new URL(r.location):null};
}
const tok=(srv:MockOAuthServer,f:Record<string,string>)=>fetch(srv.issuer+'/api/accounts/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(f)});
test('mock: authorize enforces PKCE S256, loopback redirect, host id, nonce',async()=>{
 const srv=new MockOAuthServer();await srv.start();try{
  assert.equal((await begin(srv,{code_challenge_method:'plain'})).cb!.searchParams.get('error'),'invalid_request');
  assert.equal((await begin(srv,{code_challenge:''})).cb!.searchParams.get('error'),'invalid_request');
  assert.equal((await begin(srv,{nonce:''})).cb!.searchParams.get('error'),'invalid_request');
  assert.equal((await begin(srv,{redirect_uri:'http://localhost:1/auth/callback'})).r.status,400);
  assert.equal((await begin(srv,{redirect_uri:'https://evil.example/auth/callback'})).r.status,400);
  assert.equal((await begin(srv,{ext_agent_host_id:'not-a-uuid'})).r.status,400);
  assert.equal((await begin(srv,{},'unknown-client')).r.status,400);
  const ok=await begin(srv);assert.match(ok.cb!.searchParams.get('client_id')!,/^oaiapp_/);assert.equal(ok.cb!.searchParams.get('state'),'st-1234567890123456');
 }finally{await srv.stop();}
});
test('mock: code exchange needs the matching verifier and redirect; codes are single-use and replay revokes the family',async()=>{
 const srv=new MockOAuthServer();await srv.start();try{
  const a=await begin(srv);const cid=a.cb!.searchParams.get('client_id')!;const code=a.cb!.searchParams.get('code')!;
  const base={grant_type:'authorization_code',client_id:cid,code,redirect_uri:a.lb.redirectUri};
  assert.equal((await tok(srv,{...base,code_verifier:newVerifier()})).status,400);
  const b=await begin(srv,{},cid);const c2=b.cb!.searchParams.get('code')!;
  assert.equal((await tok(srv,{...base,code:c2,redirect_uri:b.lb.redirectUri+'x',code_verifier:b.verifier})).status,400);
  const c=await begin(srv,{},cid);const cc=c.cb!.searchParams.get('code')!;
  const good={grant_type:'authorization_code',client_id:cid,code:cc,redirect_uri:c.lb.redirectUri,code_verifier:c.verifier};
  const r=await tok(srv,good);assert.equal(r.status,200);const j=await r.json() as any;
  assert.ok(j.id_token&&j.refresh_token&&j.access_token&&j.earliest_refresh_at);assert.ok(srv.checkBearer(j.access_token));
  assert.equal((await tok(srv,good)).status,400);
  assert.equal(srv.checkBearer(j.access_token),false,'replay revokes access issued from that code');
  assert.equal((await tok(srv,{grant_type:'refresh_token',client_id:cid,refresh_token:j.refresh_token})).status,400);
  assert.equal((await tok(srv,{...good,client_secret:'x'})).status,401,'public client never sends a secret');
 }finally{await srv.stop();}
});
test('mock: refresh rotates; reuse of a rotated token revokes the whole family; expiry follows the fake clock',async()=>{
 const clock=new FakeClock();const srv=new MockOAuthServer({clock});await srv.start();try{
  const a=await begin(srv);const cid=a.cb!.searchParams.get('client_id')!;
  const j=await (await tok(srv,{grant_type:'authorization_code',client_id:cid,code:a.cb!.searchParams.get('code')!,redirect_uri:a.lb.redirectUri,code_verifier:a.verifier})).json() as any;
  const r1=await (await tok(srv,{grant_type:'refresh_token',client_id:cid,refresh_token:j.refresh_token})).json() as any;
  assert.notEqual(r1.refresh_token,j.refresh_token);
  assert.equal((await tok(srv,{grant_type:'refresh_token',client_id:cid,refresh_token:j.refresh_token})).status,400);
  assert.equal(srv.checkBearer(r1.access_token),false);assert.equal((await tok(srv,{grant_type:'refresh_token',client_id:cid,refresh_token:r1.refresh_token})).status,400);
 }finally{await srv.stop();}
 const s2=new MockOAuthServer({clock});await s2.start();try{
  const a=await begin(s2);const cid=a.cb!.searchParams.get('client_id')!;
  const j=await (await tok(s2,{grant_type:'authorization_code',client_id:cid,code:a.cb!.searchParams.get('code')!,redirect_uri:a.lb.redirectUri,code_verifier:a.verifier})).json() as any;
  clock.advance(3599*1000);assert.ok(s2.checkBearer(j.access_token));clock.advance(2000);assert.equal(s2.checkBearer(j.access_token),false);
  clock.advance(31*86400*1000);assert.equal((await tok(s2,{grant_type:'refresh_token',client_id:cid,refresh_token:j.refresh_token})).status,400);
 }finally{await s2.stop();}
});
test('mock: revoke is idempotent (200 for unknown tokens) and kills the family; fault injection works',async()=>{
 const srv=new MockOAuthServer();await srv.start();try{
  const a=await begin(srv);const cid=a.cb!.searchParams.get('client_id')!;
  const j=await (await tok(srv,{grant_type:'authorization_code',client_id:cid,code:a.cb!.searchParams.get('code')!,redirect_uri:a.lb.redirectUri,code_verifier:a.verifier})).json() as any;
  const rv=(t:string)=>fetch(srv.issuer+'/revoke',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:t,client_id:cid})});
  assert.equal((await rv('nope')).status,200);assert.equal((await rv(j.refresh_token)).status,200);assert.equal(srv.checkBearer(j.access_token),false);
  srv.faults.revokeFail={count:1,status:500};assert.equal((await rv(j.refresh_token)).status,500);assert.equal((await rv(j.refresh_token)).status,200);
  srv.faults.tokenFail={count:1,status:503};assert.equal((await tok(srv,{grant_type:'refresh_token',client_id:cid,refresh_token:'x'})).status,503);
 }finally{await srv.stop();}
});
test('mock: logs never contain raw codes, verifiers or tokens',async()=>{
 const srv=new MockOAuthServer();await srv.start();try{
  const a=await begin(srv);const code=a.cb!.searchParams.get('code')!;
  await tok(srv,{grant_type:'authorization_code',client_id:a.cb!.searchParams.get('client_id')!,code,redirect_uri:a.lb.redirectUri,code_verifier:a.verifier});
  const dump=JSON.stringify(srv.log);assert.equal(dump.includes(code),false);assert.equal(dump.includes(a.verifier),false);
 }finally{await srv.stop();}
});
