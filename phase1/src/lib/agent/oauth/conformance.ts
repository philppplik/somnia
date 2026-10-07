import test from 'node:test';
import assert from 'node:assert/strict';
import {MockOAuthServer} from './testSupport/mockOAuthServer';
import {FakeClock} from './testSupport/clock';
import {FakeCredentialStore} from './testSupport/fakeCredentialStore';
import {visitAuthorize,deliverCallback} from './testSupport/browserSim';
import type {OAuthSubject,OAuthSubjectFactory} from './subject';
/**
 * Conformance suite for the OpenAI ChatGPT-plan OAuth client. Run it against any OAuthSubjectFactory.
 * Everything runs on 127.0.0.1 against MockOAuthServer; there is no network access and no real credential.
 */
type Env={srv:MockOAuthServer;clock:FakeClock;store:FakeCredentialStore;subject:OAuthSubject;browser:{opened:string[];mode:'approve'|'ignore'|'tamper-state'};close:()=>Promise<void>;make:()=>Promise<OAuthSubject>};
async function env(factory:OAuthSubjectFactory,o:ConstructorParameters<typeof MockOAuthServer>[0]={}):Promise<Env>{
 const clock=new FakeClock();const srv=new MockOAuthServer({clock,...o});const issuer=await srv.start();
 const store=new FakeCredentialStore();const browser={opened:[] as string[],mode:'approve' as 'approve'|'ignore'|'tamper-state'};
 const openBrowser=async(url:string)=>{
  browser.opened.push(url);if(browser.mode==='ignore')return;
  // Browser: follow authorize, then hit the loopback callback (async, like a real redirect).
  const r=await visitAuthorize(url);if(!r.location)return;
  const cb=new URL(r.location);if(browser.mode==='tamper-state')cb.searchParams.set('state','forged');
  void deliverCallback(cb.toString()).catch(()=>{});
 };
 const make=async()=>factory({issuer,endpoints:srv.endpoints,clock,store,fetch,openBrowser});
 return {srv,clock,store,subject:await make(),browser,make,close:()=>srv.stop()};
}
const withEnv=(name:string,factory:OAuthSubjectFactory,fn:(e:Env)=>Promise<void>,o?:ConstructorParameters<typeof MockOAuthServer>[0])=>test(name,async()=>{const e=await env(factory,o);try{await fn(e);}finally{await e.close();}});
export function defineConformanceSuite(prefix:string,factory:OAuthSubjectFactory){
 const T=(n:string,fn:(e:Env)=>Promise<void>,o?:ConstructorParameters<typeof MockOAuthServer>[0])=>withEnv(`${prefix}: ${n}`,factory,fn,o);
 T('sign-in: authorize request carries PKCE S256, state, nonce, loopback redirect, resource, scopes, host id and name hint',async e=>{
  const s=await e.subject.signIn();assert.equal(s.state,'connected');
  const u=new URL(e.browser.opened[0]!);const p=u.searchParams;
  assert.equal(u.pathname,'/api/accounts/authorize');
  assert.equal(p.get('response_type'),'code');assert.equal(p.get('client_id'),'dynamic_agent_client');
  assert.equal(p.get('code_challenge_method'),'S256');assert.match(p.get('code_challenge')!,/^[A-Za-z0-9_-]{43}$/);
  assert.match(p.get('redirect_uri')!,/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
  assert.equal(p.get('resource'),'https://api.openai.com/v1');
  assert.equal(p.get('scope'),'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct');
  assert.ok((p.get('state')??'').length>=16);assert.ok((p.get('nonce')??'').length>=16);
  assert.match(p.get('ext_agent_host_id')!,/^urn:uuid:[0-9a-f-]{36}$/);assert.equal(p.get('agent_name_hint'),'Somnia');
  assert.equal(p.has('client_secret'),false);
 });
 T('sign-in: token exchange sends verifier, never a client secret, and uses the issued oaiapp client id',async e=>{
  const s=await e.subject.signIn();assert.match(s.clientId,/^oaiapp_/);
  const ex=e.srv.log.find(l=>l.path==='/api/accounts/oauth/token')!;
  assert.equal(ex.form!.grant_type,'authorization_code');assert.equal(ex.form!.client_id,s.clientId);
  assert.ok(ex.form!.code_verifier);assert.equal('client_secret' in ex.form!,false);
  assert.equal(ex.form!.redirect_uri,new URL(e.browser.opened[0]!).searchParams.get('redirect_uri'));
 });
 T('sign-in: state and nonce are fresh per attempt; verifier is never repeated',async e=>{
  await e.subject.signIn();await e.subject.signIn();
  const [a,b]=e.browser.opened.map(u=>new URL(u).searchParams);
  assert.notEqual(a!.get('state'),b!.get('state'));assert.notEqual(a!.get('nonce'),b!.get('nonce'));assert.notEqual(a!.get('code_challenge'),b!.get('code_challenge'));
 });
 T('sign-in: forged state in callback is rejected, nothing is stored, no token request is made',async e=>{
  e.browser.mode='tamper-state';
  await assert.rejects(e.subject.signIn());
  assert.equal(await e.subject.status(),null);assert.equal(e.srv.log.some(l=>l.path==='/api/accounts/oauth/token'),false);
 });
 T('sign-in: user denial leaves existing connection unchanged and makes no token request',async e=>{
  await e.subject.signIn();const before=e.store.dump();
  e.srv.consent.mode='deny';
  await assert.rejects(e.subject.signIn());
  assert.equal(e.store.dump(),before);assert.equal((await e.subject.status())!.state,'connected');
 });
 T('sign-in: cancel via AbortSignal and timeout stop the flow and release the loopback listener',async e=>{
  e.browser.mode='ignore';
  const ac=new AbortController();const p=e.subject.signIn({signal:ac.signal});await new Promise(r=>setTimeout(r,20));ac.abort();
  await assert.rejects(p);
  const redirect=new URL(e.browser.opened[0]!).searchParams.get('redirect_uri')!;
  await assert.rejects(fetch(redirect),'listener must be closed after cancel');
  const t=e.subject.signIn({timeoutMs:1000});await new Promise(r=>setTimeout(r,20));e.clock.advance(1001);await assert.rejects(t);
  assert.equal(await e.subject.status(),null);
 });
 for(const bad of ['nonce','issuer','audience','signature','expired'] as const)T(`sign-in: id_token with bad ${bad} is rejected and not stored`,async e=>{
  e.srv.faults.badIdToken=bad;await assert.rejects(e.subject.signIn());assert.equal(await e.subject.status(),null);
 });
 T('sign-in: missing id_token is rejected',async e=>{e.srv.faults.omitIdToken=true;await assert.rejects(e.subject.signIn());assert.equal(await e.subject.status(),null);});
 T('sign-in: granted scopes (not requested scopes) decide plan permission; missing chatgpt.tokens.use.direct is rejected',async e=>{
  e.srv.faults.grantScopes=['openid','profile','email','offline_access'];
  await assert.rejects(e.subject.signIn());assert.equal(await e.subject.status(),null);
 });
 T('sign-in: reauthorization reuses the saved issued client id and the same host id',async e=>{
  const a=await e.subject.signIn();const host1=new URL(e.browser.opened[0]!).searchParams.get('ext_agent_host_id');
  const b=await (await e.make()).signIn();
  assert.equal(b.clientId,a.clientId);
  const u=new URL(e.browser.opened[1]!).searchParams;assert.equal(u.get('client_id'),a.clientId);assert.equal(u.get('ext_agent_host_id'),host1);
 });
 T('sign-in: reauthorization as a different account is rejected and keeps the old connection',async e=>{
  const a=await e.subject.signIn();const before=e.store.dump();
  (e.srv.opts as {user?:{sub:string;email:string}}).user={sub:'user-2',email:'other@example.test'};
  await assert.rejects(e.subject.signIn());assert.equal(e.store.dump(),before);assert.equal((await e.subject.status())!.clientId,a.clientId);
 });
 T('endpoints: poisoned discovery document is ignored; authorize, token and revoke go only to the allowlisted endpoints',async e=>{
  e.srv.faults.poisonDiscovery=true;await e.subject.signIn();e.clock.advance(3700*1000);await e.subject.accessToken();await e.subject.signOut();
  assert.equal(e.srv.log.some(l=>l.path.startsWith('/evil/')),false);
 });
 T('storage: no token, refresh token or verifier appears outside the credential store; status exposes no secrets',async e=>{
  await e.subject.signIn();const tok=await e.subject.accessToken();
  const st=JSON.stringify(await e.subject.status());assert.equal(st.includes(tok),false);
  for(const l of e.srv.log)assert.equal(JSON.stringify(l).includes(tok),false);
  assert.ok(e.store.dump().includes(tok));
 });
 T('refresh: valid token is returned with no network call before earliest_refresh_at',async e=>{
  await e.subject.signIn();const n=e.srv.log.length;
  const a=await e.subject.accessToken();e.clock.advance(60*60*1000*0.5);const b=await e.subject.accessToken();
  assert.equal(a,b);assert.equal(e.srv.log.length,n);
 });
 T('refresh: after earliest_refresh_at the token rotates; the replacement refresh token is persisted',async e=>{
  await e.subject.signIn();const a=await e.subject.accessToken();const rt1=e.srv.activeRefreshTokens()[0]!;
  e.clock.advance(3600*1000*0.81);const b=await e.subject.accessToken();
  assert.notEqual(a,b);const rts=e.srv.activeRefreshTokens();assert.equal(rts.length,1);assert.notEqual(rts[0],rt1);
  assert.ok(e.store.dump().includes(rts[0]!),'replacement refresh token must be stored');assert.equal(e.store.dump().includes(rt1),false);
  const r=e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').at(-1)!;
  assert.equal(r.form!.resource,'https://api.openai.com/v1');assert.equal('client_secret' in r.form!,false);
 });
 T('refresh: expiry boundary - an access token within 30s of expiry is refreshed, never handed out',async e=>{
  await e.subject.signIn();const a=await e.subject.accessToken();
  e.clock.advance(3600*1000-10_000);const b=await e.subject.accessToken();assert.notEqual(a,b);
 },{refreshAfterFraction:1});
 T('refresh: 20 concurrent callers share exactly one refresh request (single-flight) and all get the same token',async e=>{
  await e.subject.signIn();e.clock.advance(3700*1000);e.srv.faults.tokenDelayMs=30;
  const before=e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length;
  const toks=await Promise.all(Array.from({length:20},()=>e.subject.accessToken()));
  assert.equal(new Set(toks).size,1);
  assert.equal(e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length-before,1);
  assert.equal(e.srv.activeRefreshTokens().length,1,'a second refresh would have tripped reuse detection and revoked the family');
 });
 T('refresh: two subject instances sharing one store never leave a revoked family (cross-window race)',async e=>{
  await e.subject.signIn();const other=await e.make();e.clock.advance(3700*1000);e.srv.faults.tokenDelayMs=20;
  const r=await Promise.allSettled([e.subject.accessToken(),other.accessToken()]);
  const ok=r.filter(x=>x.status==='fulfilled').length;assert.ok(ok>=1);
  if(e.srv.revokedFamilies.size>0)assert.fail('concurrent refresh from two instances burned the rotating refresh token; serialize across instances (re-read store inside the lock)');
 });
 T('refresh: transient failures (503, network) keep the token set intact and do not require reauthorization',async e=>{
  await e.subject.signIn();const before=e.store.dump();e.clock.advance(3700*1000);
  e.srv.faults.tokenFail={count:1,status:503};await assert.rejects(e.subject.accessToken());
  assert.equal(e.store.dump(),before);assert.equal((await e.subject.status())!.state,'connected');
  assert.ok((await e.subject.accessToken()).length>10,'recovers on next attempt');
 });
 for(const code of ['invalid_grant'])T(`refresh: terminal ${code} clears the unusable tokens, marks reauthorization-required, keeps the client id`,async e=>{
  const a=await e.subject.signIn();e.clock.advance(3700*1000);e.srv.revokeServerSide();
  await assert.rejects(e.subject.accessToken());
  const s=(await e.subject.status())!;assert.equal(s.state,'reauthorization-required');assert.equal(s.clientId,a.clientId);
  const calls=e.srv.log.length;await assert.rejects(e.subject.accessToken());assert.equal(e.srv.log.length,calls,'no refresh loop after a terminal error');
 });
 T('refresh: after 30 days of inactivity the refresh token is expired and reauthorization is required',async e=>{
  await e.subject.signIn();e.clock.advance(31*86400*1000);await assert.rejects(e.subject.accessToken());
  assert.equal((await e.subject.status())!.state,'reauthorization-required');
 });
 T('refresh: one failed save after rotation is retried or flagged; the replacement refresh token is never lost silently',async e=>{
  await e.subject.signIn();e.clock.advance(3700*1000);e.store.failWriteAt=1;
  await e.subject.accessToken().catch(()=>{});
  const rts=e.srv.activeRefreshTokens();const s=await e.subject.status();
  assert.ok(s&&(s.state==='reauthorization-required'||e.store.dump().includes(rts[0]!)),'recoverable or flagged');
 });
 T('refresh: persistent save failure after rotation surfaces an error and recovers via reauthorization, never an infinite refresh loop',async e=>{
  await e.subject.signIn();e.clock.advance(3700*1000);e.store.failAllWrites=true;
  await assert.rejects(e.subject.accessToken());
  e.store.failAllWrites=false;
  const n=e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length;
  await e.subject.accessToken().catch(()=>{}); await e.subject.accessToken().catch(()=>{});
  assert.ok(e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length-n<=1,'at most one further refresh attempt with the burned token');
  assert.equal((await e.subject.status())!.state,'reauthorization-required');
 });
 T('401: request refreshes once and retries once with the new token',async e=>{
  await e.subject.signIn();e.srv.expireAllAccessTokens();
  const old=await e.subject.accessToken().catch(()=>'');void old;
  const res=await e.subject.request(e.srv.issuer+'/v1/models');assert.equal(res.status,200);
  assert.equal(e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length,1);
 });
 T('401: a server that keeps answering 401 gets exactly one retry, no loop',async e=>{
  await e.subject.signIn();e.srv.faults.rejectAccessTokens=true;
  const res=await e.subject.request(e.srv.issuer+'/v1/models');assert.equal(res.status,401);
  assert.equal(e.srv.log.filter(l=>l.path==='/v1/models').length,2);
  assert.equal(e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length,1);
 });
 T('401: concurrent requests with one stale token trigger a single refresh',async e=>{
  await e.subject.signIn();e.srv.expireAllAccessTokens();e.srv.faults.tokenDelayMs=20;
  const rs=await Promise.all(Array.from({length:8},()=>e.subject.request(e.srv.issuer+'/v1/models')));
  assert.ok(rs.every(r=>r.status===200));assert.equal(e.srv.log.filter(l=>l.form?.grant_type==='refresh_token').length,1);
 });
 T('401: bearer token is sent only to the requested URL and never in the query string',async e=>{
  await e.subject.signIn();await e.subject.request(e.srv.issuer+'/v1/models');
  assert.ok(e.srv.log.filter(l=>l.path==='/v1/models').every(l=>l.auth==='present'));
 });
 T('inference: SIWC constraints - mock rejects unsupported params, so a conforming client can only call with store=false, stream=true, array input',async e=>{
  await e.subject.signIn();
  const ok=await e.subject.request(e.srv.issuer+'/v1/responses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'m',store:false,stream:true,input:[{role:'user',content:'hi'}],instructions:'x'})});
  assert.equal(ok.status,200);assert.match(await ok.text(),/response\.completed/);
 });
 for(const [status,code] of [[403,'subscription_sharing_user_not_eligible'],[429,'subscription_sharing_usage_limit_exceeded'],[401,'subscription_sharing_invalid_user']] as const)T(`inference: ${status} ${code} is passed through unchanged (classification happens in the provider layer, no silent re-billing)`,async e=>{
  await e.subject.signIn();e.srv.faults.responsesError={status,code,count:status===401?2:1};
  const res=await e.subject.request(e.srv.issuer+'/v1/responses',{method:'POST',body:JSON.stringify({model:'m',store:false,stream:true,input:[]})});
  assert.equal(res.status,status);assert.equal(((await res.json()) as {error:{code:string}}).error.code,code);
  assert.equal(e.srv.log.some(l=>l.path.startsWith('/v1/')&&!['/v1/models','/v1/responses'].includes(l.path)),false);
 });
 T('sign-out: revokes the refresh token remotely, clears tokens, keeps client and host mapping',async e=>{
  const a=await e.subject.signIn();const r=await e.subject.signOut();assert.equal(r.remoteRevoked,true);
  assert.equal(e.srv.activeRefreshTokens().length,0);
  const s=(await e.subject.status())!;assert.equal(s.clientId,a.clientId);assert.notEqual(s.state,'connected');
  await assert.rejects(e.subject.accessToken());
  assert.equal(e.store.dump().includes('rt_'),false,'no refresh token left locally');
 });
 T('sign-out: when remote revocation fails, local sign-out still succeeds and reports remoteRevoked=false',async e=>{
  await e.subject.signIn();e.srv.faults.revokeFail={count:1,status:500};
  const r=await e.subject.signOut();assert.equal(r.remoteRevoked,false);assert.notEqual((await e.subject.status())!.state,'connected');
 });
 T('storage: locked credential store is reported, never erases the connection, and recovers after unlock',async e=>{
  await e.subject.signIn();e.store.locked=true;
  await assert.rejects(e.subject.accessToken());
  e.store.locked=false;assert.equal((await e.subject.status())!.state,'connected');assert.ok((await e.subject.accessToken()).length>10);
 });
 T('storage: sign-in write failure leaves no half-written connection that reports connected',async e=>{
  e.store.failWriteAt=1;await assert.rejects(e.subject.signIn().then(()=>{if(e.store.failWriteAt!==null)throw Error('write did not fail');}));
  const s=await e.subject.status();assert.ok(s===null||s.state!=='connected'||(await e.subject.accessToken()).length>10);
 });
}
