import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {createHash,createSign,generateKeyPairSync,randomBytes,randomUUID,type KeyObject} from 'node:crypto';
import {b64url,s256} from './pkce';
import type {FakeClock} from './clock';
/**
 * Mock OAuth 2.0 authorization server for the OpenAI ChatGPT-plan flow described in docs/agent/AUTH-DECISION.md section 5.
 * Endpoints: discovery, JWKS, authorize (with dynamic first-time registration via client_id=dynamic_agent_client), token (authorization_code + refresh_token), revoke.
 * Real HTTP on 127.0.0.1, real RS256 ID tokens, PKCE S256 enforcement, rotating refresh tokens with reuse detection.
 * Pure node, no dependencies. Fault injection via `faults`. Never talks to the internet.
 */
export type Faults={
 /** Next N token requests answer with this status/body instead of processing. */
 tokenFail?:{count:number;status:number;error?:string};
 /** Delay (ms, real time) before answering token requests; used for race tests. */
 tokenDelayMs?:number;
 /** Next N revoke calls answer with this status. */
 revokeFail?:{count:number;status:number};
 /** Omit the id_token from the next authorization_code exchange. */
 omitIdToken?:boolean;
 /** Sign next id_token with the wrong nonce / issuer / audience / key / expired. */
 badIdToken?:'nonce'|'issuer'|'audience'|'signature'|'expired';
 /** Grant fewer scopes than requested. */
 grantScopes?:string[];
 /** Respond to resource requests with 401 for the current access token. */
 rejectAccessTokens?:boolean;
 /** Discovery document advertises attacker endpoints; a conforming client ignores it. */
 poisonDiscovery?:boolean;
 /** Next responses call fails with this status and error code (subscription_sharing_user_not_eligible 403, subscription_sharing_usage_limit_exceeded 429, subscription_sharing_invalid_user 401). */
 responsesError?:{status:number;code:string;count?:number};
};
export type MockOptions={clock?:FakeClock;accessTtlSec?:number;refreshTtlSec?:number;/** fraction of ttl after which earliest_refresh_at is set */refreshAfterFraction?:number;user?:{sub:string;email:string};};
type Client={id:string;redirectUris:string[];agentName?:string;hostId?:string};
type Code={clientId:string;redirect:string;challenge:string;nonce?:string;scope:string;resource?:string;exp:number;used:boolean;sub:string;family:string};
type Refresh={family:string;clientId:string;scope:string;resource?:string;sub:string;exp:number;state:'active'|'used'|'revoked'};
type Access={clientId:string;scope:string;exp:number;family:string};
export class MockOAuthServer{
 readonly clients=new Map<string,Client>();
 readonly codes=new Map<string,Code>();
 readonly refresh=new Map<string,Refresh>();
 readonly access=new Map<string,Access>();
 readonly faults:Faults={};
 /** Every request seen, with secrets removed: for assertions about what the client sent. */
 readonly log:{method:string;path:string;form?:Record<string,string>;auth?:string}[]=[];
 readonly revokedFamilies=new Set<string>();
 private server=http.createServer((q,s)=>void this.handle(q,s));
 private key!:{priv:KeyObject;pub:KeyObject;kid:string};
 private otherKey!:{priv:KeyObject};
 issuer='';
 pendingIssued='';
 readonly opts:Required<Pick<MockOptions,'accessTtlSec'|'refreshTtlSec'|'refreshAfterFraction'>>&MockOptions;
 constructor(opts:MockOptions={}){
  this.opts={accessTtlSec:3600,refreshTtlSec:30*86400,refreshAfterFraction:0.8,...opts};
  const k=generateKeyPairSync('rsa',{modulusLength:2048});this.key={priv:k.privateKey,pub:k.publicKey,kid:'mock-'+randomBytes(4).toString('hex')};
  this.otherKey={priv:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey};
 }
 private now(){return this.opts.clock?this.opts.clock.seconds():Math.floor(Date.now()/1000);}
 async start(port=0){await new Promise<void>(r=>this.server.listen(port,'127.0.0.1',r));this.issuer=`http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;return this.issuer;}
 async stop(){this.server.closeAllConnections();await new Promise<void>(r=>this.server.close(()=>r()));}
 get endpoints(){return {issuer:this.issuer,authorize:this.issuer+'/api/accounts/authorize',token:this.issuer+'/api/accounts/oauth/token',revoke:this.issuer+'/revoke',jwks:this.issuer+'/jwks'};}
 get user(){return this.opts.user??{sub:'user-1',email:'user@example.test'};}
 /** Test helpers -------------------------------------------------- */
 activeRefreshTokens(){return [...this.refresh.entries()].filter(([,v])=>v.state==='active').map(([k])=>k);}
 accessCount(){return this.access.size;}
 expireAllAccessTokens(){for(const a of this.access.values())a.exp=this.now()-1;}
 revokeServerSide(){for(const [k,v] of this.refresh)this.refresh.set(k,{...v,state:'revoked'});}
 /** Validate a bearer token as a resource server would. */
 checkBearer(token:string|undefined){
  if(this.faults.rejectAccessTokens)return false;
  const a=token?this.access.get(token):undefined;return !!a&&a.exp>this.now()&&!this.revokedFamilies.has(a.family);
 }
 private idToken(c:{aud:string;nonce?:string;sub:string},bad?:Faults['badIdToken']){
  const t=this.now();
  const header={alg:'RS256',typ:'JWT',kid:this.key.kid};
  const payload:Record<string,unknown>={iss:bad==='issuer'?'https://evil.example':this.issuer,aud:bad==='audience'?'other-client':c.aud,sub:c.sub,email:this.user.email,iat:t,exp:bad==='expired'?t-10:t+3600};
  if(c.nonce!==undefined)payload.nonce=bad==='nonce'?'wrong-nonce':c.nonce;
  const body=b64url(Buffer.from(JSON.stringify(header)))+'.'+b64url(Buffer.from(JSON.stringify(payload)));
  const sig=createSign('RSA-SHA256').update(body).sign(bad==='signature'?this.otherKey.priv:this.key.priv);
  return body+'.'+b64url(sig);
 }
 private json(s:http.ServerResponse,status:number,body:unknown,headers:Record<string,string>={}){s.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});s.end(JSON.stringify(body));}
 private async handle(q:http.IncomingMessage,s:http.ServerResponse){
  const url=new URL(q.url??'/',this.issuer||'http://127.0.0.1');
  let raw='';for await(const c of q)raw+=c;
  const ctype=q.headers['content-type']??'';
  let form:Record<string,string>|undefined;
  if(raw&&ctype.includes('application/x-www-form-urlencoded'))form=Object.fromEntries(new URLSearchParams(raw));
  const redacted=form&&Object.fromEntries(Object.entries(form).map(([k,v])=>[k,/token|code|verifier|secret/.test(k)?'[redacted:'+createHash('sha256').update(v).digest('hex').slice(0,8)+']':v]));
  this.log.push({method:q.method??'',path:url.pathname,form:redacted,auth:q.headers.authorization?'present':undefined});
  try{
   if(url.pathname==='/.well-known/openid-configuration')return this.json(s,200,{issuer:this.issuer,authorization_endpoint:this.issuer+'/api/accounts/authorize',token_endpoint:this.issuer+'/api/accounts/oauth/token',revocation_endpoint:this.issuer+'/revoke',jwks_uri:this.issuer+'/jwks',...(this.faults.poisonDiscovery?{authorization_endpoint:this.issuer+'/evil/authorize',token_endpoint:this.issuer+'/evil/token',revocation_endpoint:this.issuer+'/evil/revoke',jwks_uri:this.issuer+'/evil/jwks'}:{}),code_challenge_methods_supported:['S256'],response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token']});
   if(url.pathname==='/jwks'){const jwk=this.key.pub.export({format:'jwk'});return this.json(s,200,{keys:[{...jwk,kid:this.key.kid,alg:'RS256',use:'sig'}]});}
      if(url.pathname==='/api/accounts/authorize'&&q.method==='GET')return this.authorize(s,url);
   if(url.pathname==='/api/accounts/oauth/token'&&q.method==='POST')return await this.token(s,form??{});
   if(url.pathname==='/revoke'&&q.method==='POST')return this.revoke(s,form??{});
   if(url.pathname==='/v1/models'&&q.method==='GET'){const t=(q.headers.authorization??'').replace(/^Bearer /,'');return this.checkBearer(t)?this.json(s,200,{data:[]}):this.json(s,401,{error:{code:'invalid_token'}});}
   if(url.pathname==='/v1/responses'&&q.method==='POST')return this.responses(s,q,raw);
   this.json(s,404,{error:'not_found'});
  }catch{this.json(s,500,{error:'server_error'});}
 }
 /** Server-side "user approved" state: tests choose the outcome via setNextConsent. */
 consent:{mode:'approve'|'deny'}={mode:'approve'};
 private static LOOP=/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/;
 private authorize(s:http.ServerResponse,u:URL){
  const p=u.searchParams;const redirect=p.get('redirect_uri')??'';
  let client=this.clients.get(p.get('client_id')??'');
  const dynamic=p.get('client_id')==='dynamic_agent_client';
  // Errors that must NOT redirect (RFC 6749 4.1.2.1)
  if(!MockOAuthServer.LOOP.test(redirect)||(!client&&!dynamic))return this.json(s,400,{error:'invalid_request',error_description:'unknown client or redirect_uri'});
  if(dynamic){
   const host=p.get('ext_agent_host_id')??'';
   if(!/^urn:uuid:[0-9a-f-]{36}$/.test(host)||!p.get('agent_name_hint'))return this.json(s,400,{error:'invalid_request',error_description:'ext_agent_host_id and agent_name_hint required'});
   client={id:'oaiapp_'+randomBytes(8).toString('hex'),redirectUris:[redirect],agentName:p.get('agent_name_hint')??undefined,hostId:host};
   this.clients.set(client.id,client);this.pendingIssued=client.id;
  }
  const issuedId=client!.id;
  const state=p.get('state')??undefined;
  const back=(params:Record<string,string>)=>{const r=new URL(redirect);for(const [k,v] of Object.entries(params))r.searchParams.set(k,v);if(state!==undefined)r.searchParams.set('state',state);if(dynamic)r.searchParams.set('client_id',issuedId);s.writeHead(302,{location:r.toString(),'cache-control':'no-store'});s.end();};
  if(p.get('response_type')!=='code')return back({error:'unsupported_response_type'});
  const challenge=p.get('code_challenge')??'';
  if(!challenge||p.get('code_challenge_method')!=='S256')return back({error:'invalid_request',error_description:'PKCE S256 required'});
  if(!p.get('nonce'))return back({error:'invalid_request',error_description:'nonce required'});
  if(this.consent.mode==='deny')return back({error:'access_denied'});
  const code=randomBytes(16).toString('base64url');
  this.codes.set(code,{clientId:issuedId,redirect,challenge,nonce:p.get('nonce')??undefined,scope:p.get('scope')??'',resource:p.get('resource')??undefined,exp:this.now()+60,used:false,sub:this.user.sub,family:randomUUID()});
  back({code});
 }
  /** Resource server: POST /v1/responses, enforcing the SIWC constraints (store=false, stream=true, array input, no unsupported params). */
 readonly responseCalls:{body:Record<string,unknown>}[]=[];
 private responses(s:http.ServerResponse,q:http.IncomingMessage,raw:string){
  const tok=(q.headers.authorization??'').replace(/^Bearer /,'');
  if(!this.checkBearer(tok))return this.json(s,401,{error:{code:'invalid_token'}});
  const e=this.faults.responsesError;
  if(e&&(e.count===undefined||e.count>0)){if(e.count!==undefined)e.count--;return this.json(s,e.status,{error:{code:e.code,message:'mock'}});}
  let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{return this.json(s,400,{error:{code:'invalid_json'}});}
  this.responseCalls.push({body:b});
  const bad=['temperature','top_p','previous_response_id','max_output_tokens','metadata'].find(k=>k in b);
  if(bad)return this.json(s,400,{error:{code:'unsupported_parameter',param:bad}});
  if(b.store!==false||b.stream!==true||!Array.isArray(b.input))return this.json(s,400,{error:{code:'invalid_request',message:'store=false, stream=true and array input required'}});
  const tools=Array.isArray(b.tools)?b.tools as {type?:string}[]:[];
  if(tools.some(t=>t.type!=='function'&&t.type!=='custom'))return this.json(s,400,{error:{code:'unsupported_tool'}});
  s.writeHead(200,{'content-type':'text/event-stream'});
  s.write('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n');
  s.end('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n');
 }
 private err(s:http.ServerResponse,status:number,error:string){return this.json(s,status,{error});}
 private issue(clientId:string,family:string,scope:string,resource:string|undefined,sub:string,extra:Record<string,unknown>={}){
  const granted=this.faults.grantScopes?this.faults.grantScopes.join(' '):scope;
  const at=randomBytes(24).toString('base64url');const rt='rt_'+randomBytes(24).toString('base64url');
  const t=this.now();
  this.access.set(at,{clientId,scope:granted,exp:t+this.opts.accessTtlSec,family});
  this.refresh.set(rt,{family,clientId,scope:granted,resource,sub,exp:t+this.opts.refreshTtlSec,state:'active'});
  return {access_token:at,token_type:'Bearer',expires_in:this.opts.accessTtlSec,refresh_token:rt,scope:granted,earliest_refresh_at:t+Math.floor(this.opts.accessTtlSec*this.opts.refreshAfterFraction),...extra};
 }
 private async token(s:http.ServerResponse,f:Record<string,string>){
  if(this.faults.tokenDelayMs)await new Promise(r=>setTimeout(r,this.faults.tokenDelayMs));
  const tf=this.faults.tokenFail;
  if(tf&&tf.count>0){tf.count--;return this.err(s,tf.status,tf.error??'temporarily_unavailable');}
  if(f.client_secret!==undefined)return this.err(s,401,'invalid_client'); // public client: a secret must never be sent
  const client=this.clients.get(f.client_id??'');
  if(!client)return this.err(s,401,'invalid_client');
  if(f.grant_type==='authorization_code'){
   const c=this.codes.get(f.code??'');
   if(!c||c.clientId!==client.id||c.exp<=this.now())return this.err(s,400,'invalid_grant');
   if(c.used){ // replay: revoke everything issued from this code
    this.revokedFamilies.add(c.family);for(const [k,v] of this.refresh)if(v.family===c.family)this.refresh.set(k,{...v,state:'revoked'});
    return this.err(s,400,'invalid_grant');
   }
   c.used=true;
   if(f.redirect_uri!==c.redirect)return this.err(s,400,'invalid_grant');
   if(!f.code_verifier||s256(f.code_verifier)!==c.challenge)return this.err(s,400,'invalid_grant');
   if(f.resource!==undefined&&c.resource!==undefined&&f.resource!==c.resource)return this.err(s,400,'invalid_target');
   const body:Record<string,unknown>=this.issue(client.id,c.family,c.scope,c.resource,c.sub);
   if(c.scope.split(' ').includes('openid')&&!this.faults.omitIdToken)body.id_token=this.idToken({aud:client.id,nonce:c.nonce,sub:c.sub},this.faults.badIdToken);
   return this.json(s,200,body);
  }
  if(f.grant_type==='refresh_token'){
   const r=this.refresh.get(f.refresh_token??'');
   if(!r||r.clientId!==client.id)return this.err(s,400,'invalid_grant');
   if(r.state==='used'){ // reuse of a rotated token: the whole family is compromised
    this.revokedFamilies.add(r.family);for(const [k,v] of this.refresh)if(v.family===r.family)this.refresh.set(k,{...v,state:'revoked'});
    return this.err(s,400,'invalid_grant');
   }
   if(r.state==='revoked'||r.exp<=this.now())return this.err(s,400,'invalid_grant');
   if(f.resource!==undefined&&r.resource!==undefined&&f.resource!==r.resource)return this.err(s,400,'invalid_target');
   r.state='used'; // rotation
   return this.json(s,200,this.issue(client.id,r.family,r.scope,r.resource,r.sub));
  }
  return this.err(s,400,'unsupported_grant_type');
 }
 private revoke(s:http.ServerResponse,f:Record<string,string>){
  const rf=this.faults.revokeFail;if(rf&&rf.count>0){rf.count--;return this.json(s,rf.status,{error:'server_error'});}
  if(!this.clients.has(f.client_id??''))return this.err(s,401,'invalid_client');
  const r=this.refresh.get(f.token??'');
  if(r){this.revokedFamilies.add(r.family);for(const [k,v] of this.refresh)if(v.family===r.family)this.refresh.set(k,{...v,state:'revoked'});}
  s.writeHead(200,{'cache-control':'no-store'});s.end(); // RFC 7009: 200 even for unknown tokens
 }
}
